"""geo2 inference pipeline.

Image
  ↓
Provider
  ↓
Raw result (FloorPlanGeometry)
  ↓
Schema validation (Pydantic)
  ↓
Geometry validation (invariant checks)
  ↓
Canonical JSON
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

from .providers.base import FloorPlanProvider
from .schema import FloorPlanGeometry
from .validation import validate_geometry


@dataclass
class PipelineResult:
    """Outcome of analysing a single image with a single provider."""

    image_path: str
    provider_name: str
    success: bool
    geometry: Optional[FloorPlanGeometry] = None
    validation_errors: list[str] = field(default_factory=list)
    latency_ms: float = field(default=0.0)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        d = {
            "image": self.image_path,
            "provider_name": self.provider_name,
            "success": self.success,
            "latency_ms": round(self.latency_ms, 3),
            "validation_errors": self.validation_errors,
            "estimated_cost_usd": None,
        }
        if self.geometry is not None:
            d["geometry"] = self.geometry.model_dump()
        if self.error is not None:
            d["error"] = self.error
        return d


def load_image(path: Path | str) -> np.ndarray:
    """Load an image as a uint8 RGB numpy array (top-left origin)."""
    im = Image.open(path).convert("RGB")
    return np.asarray(im, dtype=np.uint8)


def analyze_image(
    image: np.ndarray,
    provider: FloorPlanProvider,
    image_path: Path | str | None = None,
) -> PipelineResult:
    """Run one provider on one image and validate the result.

    Steps: provider.analyze → Pydantic model → geometric invariant validation.
    Any failure (schema or geometry) is recorded as `success=False` with the
    issues in `validation_errors`; the raw result is preserved as dict when
    possible so invalid output is never silently dropped.

    Latency covers the provider call only (model time); the validation cost is
    part of the harness, not the model.
    """
    start = time.perf_counter()
    result = provider.analyze(image)
    latency_ms = (time.perf_counter() - start) * 1000.0

    if not isinstance(result, FloorPlanGeometry):
        return PipelineResult(
            image_path=str(image_path or ""),
            provider_name=provider.id,
            success=False,
            validation_errors=[f"provider returned {type(result).__name__}, not FloorPlanGeometry"],
            latency_ms=latency_ms,
            error="provider returned a non-schema object",
        )

    issues = validate_geometry(result)
    if issues:
        return PipelineResult(
            image_path=str(image_path or ""),
            provider_name=provider.id,
            success=False,
            latency_ms=latency_ms,
            validation_errors=issues,
            geometry=result,
        )

    return PipelineResult(
        image_path=str(image_path or ""),
        provider_name=provider.id,
        success=True,
        latency_ms=latency_ms,
        geometry=result,
    )


def analyze_path(
    image_path: Path | str,
    provider: FloorPlanProvider,
) -> PipelineResult:
    """Analyse an image file (load + analyze)."""
    image = load_image(image_path)
    return analyze_image(image, provider, image_path=str(image_path))


def to_json(geometry: FloorPlanGeometry, indent: int = 2) -> str:
    """Serialise validated geometry to canonical JSON."""
    return geometry.model_dump_json(indent=indent)


def save_json(geometry: FloorPlanGeometry, path: Path | str, indent: int = 2) -> None:
    Path(path).write_text(to_json(geometry, indent=indent), encoding="utf-8")