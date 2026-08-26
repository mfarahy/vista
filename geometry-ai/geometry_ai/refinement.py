"""Candidate-level ambiguity refinement.

Phase 4 keeps every ambiguous candidate *available* and lets an optional
refinement step resolve it with a *small structured decision*. Refinement is
strictly candidate-level semantic review: a provider receives one candidate
(with the source image when available) and answers a constrained question
such as *"is this candidate a real door?"*. It never regenerates geometry.

The provider is abstract so no commercial vendor is hard-coded. Selection is
configuration-driven:

    GEOMETRY_REFINEMENT_PROVIDER   "noop" (default) | "ai"
    GEOMETRY_REFINEMENT_URL        when "ai": endpoint that accepts
                                   {"candidates": [...], "image_base64": "..."}
    GEOMETRY_REFINEMENT_API_KEY    optional bearer token

`NoOpRefinementProvider` is the default and always returns `uncertain`, so the
deterministic pipeline is the complete, self-sufficient solution unless a
refinement backend is explicitly configured.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class RefinementDecision:
    """A single structured verdict about one candidate.

    `decision` is one of ``"accept" | "reject" | "uncertain"``. `confidence`
    is only set when the underlying model actually reports a meaningful
    probability — it is never fabricated.
    """

    decision: str
    reason: str
    confidence: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision": self.decision,
            "reason": self.reason,
            "confidence": self.confidence,
        }

    @staticmethod
    def from_dict(payload: dict[str, Any]) -> "RefinementDecision":
        decision = payload.get("decision", "uncertain")
        if decision not in ("accept", "reject", "uncertain"):
            decision = "uncertain"
        confidence = payload.get("confidence")
        if confidence is not None:
            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = None
            if not 0.0 <= confidence <= 1.0:
                confidence = None
        return RefinementDecision(
            decision=decision,
            reason=str(payload.get("reason", "")),
            confidence=confidence,
        )


class GeometryRefinementProvider(ABC):
    """Interface implemented by all refinement providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Short stable identifier surfaced in the model document."""

    @abstractmethod
    def refine(
        self,
        *,
        candidate: dict[str, Any],
        candidates: list[dict[str, Any]],
        image_bytes: bytes | None,
    ) -> RefinementDecision:
        """Resolve one ambiguous candidate to a small structured decision."""


class NoOpRefinementProvider(GeometryRefinementProvider):
    """Default provider: nothing to resolve, everything stays `uncertain`.

    Used whenever no refinement backend is configured, so the deterministic
    pipeline remains complete and self-sufficient.
    """

    @property
    def name(self) -> str:
        return "noop"

    def refine(
        self,
        *,
        candidate: dict[str, Any],
        candidates: list[dict[str, Any]],
        image_bytes: bytes | None,
    ) -> RefinementDecision:
        return RefinementDecision(
            decision="uncertain",
            reason="no refinement provider configured",
            confidence=None,
        )


class AIRefinementProvider(GeometryRefinementProvider):
    """Configurable VLM/VLM-based refinement backend.

    Posts the candidate set (plus the source image as base64) to a generic
    JSON endpoint and maps the structured response onto `RefinementDecision`.
    The endpoint URL/credentials come from the environment — no commercial
    provider is hard-coded. Confidence is passed through only when the backend
    reports one.
    """

    def __init__(
        self,
        *,
        url: str | None = None,
        api_key: str | None = None,
        timeout_s: float = 30.0,
    ) -> None:
        self.url = url or os.environ.get("GEOMETRY_REFINEMENT_URL", "")
        self.api_key = api_key or os.environ.get("GEOMETRY_REFINEMENT_API_KEY", "")
        self.timeout_s = timeout_s

    @property
    def name(self) -> str:
        return "ai"

    def refine(
        self,
        *,
        candidate: dict[str, Any],
        candidates: list[dict[str, Any]],
        image_bytes: bytes | None,
    ) -> RefinementDecision:
        if not self.url:
            return RefinementDecision(
                decision="uncertain",
                reason="ai refinement configured without a url",
                confidence=None,
            )
        payload: dict[str, Any] = {
            "candidate": candidate,
            "candidates": candidates,
        }
        if image_bytes is not None:
            payload["image_base64"] = base64.b64encode(image_bytes).decode("ascii")
        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                **({"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}),
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # network/parse failures never crash the pipeline
            return RefinementDecision(
                decision="uncertain",
                reason=f"refinement request failed: {exc}",
                confidence=None,
            )
        return RefinementDecision.from_dict(body if isinstance(body, dict) else {})


def build_refinement_provider(provider_name: str | None = None) -> GeometryRefinementProvider:
    """Select a refinement provider from configuration (default noop)."""
    name = provider_name or os.environ.get("GEOMETRY_REFINEMENT_PROVIDER", "noop")
    if name == "ai":
        return AIRefinementProvider()
    return NoOpRefinementProvider()