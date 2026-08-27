"""Provider abstraction for geo2.

A `FloorPlanProvider` takes a floor-plan image and returns a
`FloorPlanGeometry`. The evaluation harness is intentionally decoupled from
the chosen AI model: any provider that implements this interface can be swapped
in and benchmarked with the exact same validation, metrics and overlay path.

Providers must be thin: they produce geometry, they do not validate (the
pipeline validates every result), they do not render overlays, and they do not
compute metrics.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from pydantic import BaseModel

from ..schema import FloorPlanGeometry


class Licensing(BaseModel):
    """Commercial-licensing record for an external model or dependency.

    `commercial_use` is one of: "permitted", "restricted", "unknown".
    When `unknown` or `restricted`, the README must document the risk.
    """

    name: str
    source: str
    license: str
    commercial_use: str
    weights_license: str = ""
    inference_requirements: str = ""


@dataclass
class UsageInfo:
    """Per-call usage/cost telemetry recorded by the harness for a provider.

    A provider that talks to a hosted model or runs local inference sets
    `last_usage` after each `analyze()`; the pipeline copies it into the
    `PipelineResult` so every fixture records the same standard fields:

    - input_tokens / output_tokens: model tokens consumed (text + image)
    - image_tokens: estimated image tokens (official per-provider convention)
    - estimated_cost_usd: derived ONLY from official prices and actual usage
    - cost_status: "estimated" | "unknown" | "n/a"
    - gpu / vram_gb / inference_time_ms: local-infrastructure fields
    """

    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    image_tokens: Optional[int] = None
    estimated_cost_usd: Optional[float] = None
    cost_status: str = "unknown"
    gpu: Optional[str] = None
    vram_gb: Optional[float] = None
    inference_time_ms: Optional[float] = None
    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "image_tokens": self.image_tokens,
            "estimated_cost_usd": round(self.estimated_cost_usd, 6) if self.estimated_cost_usd is not None else None,
            "cost_status": self.cost_status,
            "gpu": self.gpu,
            "vram_gb": self.vram_gb,
            "inference_time_ms": round(self.inference_time_ms, 3) if self.inference_time_ms is not None else None,
        }
        if self.raw:
            d["usage"] = self.raw
        return d


class FloorPlanProvider(ABC):
    """Interface every geo2 geometry provider implements."""

    #: stable identifier used in result.json / metrics.json (e.g. "baseline-mock")
    id: str = "abstract"

    #: after `analyze`, an optional UsageInfo for cost/latency recording; the
    #: pipeline copies it into the PipelineResult when present (local mocks omit it).
    last_usage: Optional[UsageInfo] = None

    @abstractmethod
    def analyze(self, image: np.ndarray) -> FloorPlanGeometry:
        """Turn an RGB (HxWx3, uint8, top-left origin) image into geometry.

        Coordinates in the returned geometry are in source-image pixel space.
        The result is *not* validated here — that is the pipeline's job.
        """
        raise NotImplementedError

    @classmethod
    def licensing(cls) -> Licensing:
        """Licensing record for this provider's model (see README)."""
        return Licensing(
            name=cls.id,
            source="geo2 built-in",
            license="MIT (geo2 project code)",
            commercial_use="permitted",
            weights_license="n/a (no external weights)",
            inference_requirements="CPU only, no GPU, no network",
        )