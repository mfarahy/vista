"""Canonical, domain-neutral floor-plan geometry schema for geo2.

This is geo2's own schema. It is intentionally *not* `VistaGeometry` and does
not depend on the existing geometry-ai pipeline. The aim is a strict, typed,
JSON-serialisable representation of 2D architectural geometry that any number
of independent providers can target and that the evaluation harness can
benchmark against.

Strictness: the Pydantic models reject unknown fields (`extra="forbid"`),
reject non-finite float values (NaN/inf), and enforce non-negative widths and
bounded confidence. Any additional geometric invariants live in
`validation.py` so that purely structural checks (Pydantic) are separated from
semantic/geometric checks.
"""

from __future__ import annotations

import math
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

__all__ = [
    "Point",
    "Source",
    "Wall",
    "Room",
    "Door",
    "Window",
    "Stair",
    "Label",
    "Dimension",
    "Scale",
    "FloorPlanGeometry",
    "SCHEMA_VERSION",
]

SCHEMA_VERSION = "geo2-1.0"

# Enum-like string unions stay open (extensible) but the common values are
# documented. We deliberately avoid dozens of strict enums (see README).
WALL_TYPES = ("exterior", "interior", "unknown")


def _finite(value: float) -> float:
    if value is None or not math.isfinite(float(value)):
        raise ValueError("coordinate/value must be finite (got NaN or inf)")
    return float(value)


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float = Field(description="x coordinate in source-image pixel space")
    y: float = Field(description="y coordinate in source-image pixel space")

    @field_validator("x", "y")
    @classmethod
    def _finite_xy(cls, v: float) -> float:
        return _finite(v)


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = Field(ge=1, description="source image width in pixels")
    height: int = Field(ge=1, description="source image height in pixels")


class Wall(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="unique identifier within walls[]")
    start: Point
    end: Point
    thickness: float = Field(ge=0, description="wall thickness in pixels (>=0)")
    type: str = Field(default="unknown", description="one of: exterior, interior, unknown")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("thickness", "confidence")
    @classmethod
    def _finite_extra(cls, v: float) -> float:
        return _finite(v)


class Room(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="unique identifier within rooms[]")
    name: Optional[str] = Field(default=None, description="optional human label")
    type: str = Field(default="unknown", description="open/extensible room type")
    polygon: List[Point] = Field(min_length=3, description="closed room polygon (CCW or CW)")
    wall_ids: List[str] = Field(default_factory=list, description="walls that bound the room")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("confidence")
    @classmethod
    def _finite_room_conf(cls, v: float) -> float:
        return _finite(v)


class Door(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="unique identifier within doors[]")
    wall_id: str = Field(description="id of the wall the door sits on")
    position: Point = Field(description="centre of the opening on the wall")
    width: float = Field(ge=0, description="opening width in pixels (>=0)")
    swing: Optional[str] = Field(default=None, description="optional swing hint")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("width", "confidence")
    @classmethod
    def _finite_door(cls, v: float) -> float:
        return _finite(v)


class Window(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="unique identifier within windows[]")
    wall_id: str = Field(description="id of the wall the window sits on")
    position: Point = Field(description="centre of the window on the wall")
    width: float = Field(ge=0, description="window width in pixels (>=0)")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("width", "confidence")
    @classmethod
    def _finite_window(cls, v: float) -> float:
        return _finite(v)


class Stair(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="unique identifier within stairs[]")
    region: List[Point] = Field(min_length=3, description="coarse bounding polygon of the stair")
    direction: Optional[str] = Field(default=None, description="optional up/down hint")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("confidence")
    @classmethod
    def _finite_stair(cls, v: float) -> float:
        return _finite(v)


class Label(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="unique identifier within labels[]")
    text: str = Field(description="detected text")
    position: Point
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("confidence")
    @classmethod
    def _finite_label(cls, v: float) -> float:
        return _finite(v)


class Dimension(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="unique identifier within dimensions[]")
    value: float = Field(description="the dimension value")
    unit: Optional[str] = Field(default=None, description="optional unit string")
    start: Point
    end: Point
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("value", "confidence")
    @classmethod
    def _finite_dim(cls, v: float) -> float:
        return _finite(v)


class Scale(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pixel_distance: float = Field(gt=0)
    real_distance: float = Field(gt=0)
    unit: str
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("pixel_distance", "real_distance", "confidence")
    @classmethod
    def _finite_scale(cls, v: float) -> float:
        return _finite(v)


class FloorPlanGeometry(BaseModel):
    """The canonical output of a geo2 provider."""

    model_config = ConfigDict(extra="forbid")

    version: str = SCHEMA_VERSION
    source: Source
    units: str = "px"
    walls: List[Wall] = Field(default_factory=list)
    rooms: List[Room] = Field(default_factory=list)
    doors: List[Door] = Field(default_factory=list)
    windows: List[Window] = Field(default_factory=list)
    stairs: List[Stair] = Field(default_factory=list)
    labels: List[Label] = Field(default_factory=list)
    dimensions: List[Dimension] = Field(default_factory=list)
    scale: Optional[Scale] = Field(default=None)
