"""Schema tests: structure, strictness, NaN/inf, extra-field rejection."""

from __future__ import annotations

import json
import math

import pytest
from pydantic import ValidationError

from geometry_ai.schema import (
    Dimension,
    Door,
    FloorPlanGeometry,
    Point,
    Room,
    Scale,
    Source,
    Stair,
    Wall,
    Window,
)

from conftest import make_geometry


def test_version_and_structure():
    g = make_geometry()
    assert g.version == "geo2-1.0"
    assert g.source.width == 200
    assert g.source.height == 150
    assert g.units == "px"
    assert g.scale is None
    assert [w.id for w in g.walls] == ["w-top", "w-right", "w-bottom", "w-left", "w-div"]


def test_json_roundtrip():
    g = make_geometry()
    payload = g.model_dump_json()
    g2 = FloorPlanGeometry.model_validate_json(payload)
    assert g2 == g
    as_dict = json.loads(payload)
    assert set(as_dict) == {
        "version", "source", "units", "walls", "rooms", "doors",
        "windows", "stairs", "labels", "dimensions", "scale",
    }


def test_extra_fields_rejected():
    with pytest.raises(ValidationError):
        FloorPlanGeometry.model_validate({**make_geometry().model_dump(), "surprise": 1})
    with pytest.raises(ValidationError):
        Wall.model_validate({"id": "w", "start": {"x": 0, "y": 0}, "end": {"x": 1, "y": 0}, "nope": True})


def test_nan_inf_rejected():
    bad = make_geometry().model_dump()
    bad["walls"][0]["start"]["x"] = math.nan
    with pytest.raises(ValidationError):
        FloorPlanGeometry.model_validate(bad)

    bad = make_geometry().model_dump()
    bad["walls"][0]["thickness"] = math.inf
    with pytest.raises(ValidationError):
        FloorPlanGeometry.model_validate(bad)


def test_confidence_range_enforced():
    d = make_geometry().model_dump()
    d["doors"][0]["confidence"] = 1.4
    with pytest.raises(ValidationError):
        FloorPlanGeometry.model_validate(d)
    d = make_geometry().model_dump()
    d["doors"][0]["confidence"] = -0.1
    with pytest.raises(ValidationError):
        FloorPlanGeometry.model_validate(d)


def test_negative_width_rejected():
    d = make_geometry().model_dump()
    d["doors"][0]["width"] = -5
    with pytest.raises(ValidationError):
        FloorPlanGeometry.model_validate(d)


def test_polygon_min_points():
    with pytest.raises(ValidationError):
        Room(id="r", polygon=[Point(x=0, y=0), Point(x=1, y=0)])


def test_scale_requires_positive():
    with pytest.raises(ValidationError):
        Scale(pixel_distance=0, real_distance=1, unit="m")
    s = Scale(pixel_distance=100, real_distance=3.5, unit="m")
    assert s.confidence == 1.0


def test_wall_type_open_but_documented_values_valid():
    g = make_geometry()
    assert g.walls[0].type == "exterior"
    w = Wall(id="x", start=Point(x=0, y=0), end=Point(x=1, y=1), thickness=1, type="interior")
    assert w.type == "interior"
    unknown = Wall(id="y", start=Point(x=0, y=0), end=Point(x=1, y=1), thickness=1, type="whatever")
    assert unknown.type == "whatever"  # open by design; validation flags it, schema doesn't


def test_source_min_size():
    with pytest.raises(ValidationError):
        Source(width=0, height=10)


def test_point_requires_finite():
    with pytest.raises(ValidationError):
        Point(x=float("inf"), y=0)


def test_door_position_point():
    d = Door(id="d", wall_id="w", position=Point(x=1, y=2), width=3)
    assert (d.position.x, d.position.y) == (1.0, 2.0)