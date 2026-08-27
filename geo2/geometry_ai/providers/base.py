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


class FloorPlanProvider(ABC):
    """Interface every geo2 geometry provider implements."""

    #: stable identifier used in result.json / metrics.json (e.g. "baseline-mock")
    id: str = "abstract"

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