"""Geometry-validation tests: invariants and rejection of invalid output."""

from __future__ import annotations

from geometry_ai.schema import Door, FloorPlanGeometry, Point, Wall
from geometry_ai.validation import validate_geometry

from conftest import make_geometry


def test_valid_geometry_passes():
    assert validate_geometry(make_geometry()) == []


def test_duplicate_ids_rejected():
    g = make_geometry()
    g.walls[0].id = g.walls[1].id
    issues = validate_geometry(g)
    assert any("duplicate entity id" in i for i in issues)


def test_malformed_id_rejected():
    g = make_geometry()
    g.doors[0].id = "door with spaces!"
    issues = validate_geometry(g)
    assert any("malformed" in i for i in issues)


def test_door_unknown_wall_rejected():
    g = make_geometry()
    g.doors[0].wall_id = "w-does-not-exist"
    issues = validate_geometry(g)
    assert any("references unknown wall" in i for i in issues)


def test_door_off_wall_rejected():
    g = make_geometry()
    # door far away from its wall
    g.doors[0].position = Point(x=400, y=500)
    issues = validate_geometry(g)
    assert any("too far from its wall" in i for i in issues)


def test_window_unknown_wall_rejected():
    g = make_geometry()
    g.windows[0].wall_id = "gone"
    issues = validate_geometry(g)
    assert any("references unknown wall" in i for i in issues)


def test_room_unknown_wall_rejected():
    g = make_geometry()
    g.rooms[0].wall_ids.append("not-a-wall")
    issues = validate_geometry(g)
    assert any("references unknown wall id" in i for i in issues)


def test_points_outside_bounds_rejected():
    g = make_geometry()
    g.walls[0].start = Point(x=99999, y=99999)
    issues = validate_geometry(g)
    assert any("outside image bounds" in i for i in issues)


def test_zero_length_wall_rejected():
    g = make_geometry()
    g.walls[0].end = Point(x=g.walls[0].start.x, y=g.walls[0].start.y)
    issues = validate_geometry(g)
    assert any("zero-length wall" in i for i in issues)


def test_polygon_too_few_points_rejected():
    g = make_geometry()
    g.rooms[0].polygon = [Point(x=0, y=0), Point(x=1, y=1)]
    issues = validate_geometry(g)
    assert any("has 2 points" in i for i in issues)


def test_duplicate_consecutive_vertex_rejected():
    g = make_geometry()
    g.rooms[0].polygon.insert(1, Point(x=20, y=20))
    issues = validate_geometry(g)
    assert any("duplicate consecutive point" in i for i in issues)


def test_non_finite_coordinate_rejected():
    g = make_geometry()
    # construct directly (Pydantic would reject at parse time); the geometry
    # validator must catch the invariant at the document level too
    g.walls[0].start = Point.model_construct(x=float("nan"), y=10)
    issues = validate_geometry(g)
    assert any("non-finite" in i for i in issues)


def test_negative_thickness_rejected():
    g = make_geometry()
    g.walls[0].thickness = -1
    issues = validate_geometry(g)
    assert any("negative thickness" in i for i in issues)


def test_rooms_empty_ok():
    g = make_geometry()
    g.rooms = []
    assert validate_geometry(g) == []


def test_box_plan_inline_validation():
    """An integration-style check: build an invalid raw piece and confirm both
    layers (schema + geometry) reject it."""
    walls = [
        Wall(id="a", start=Point(x=0, y=0), end=Point(x=10, y=0), thickness=1),
    ]
    with_bad_door = FloorPlanGeometry(
        source=make_geometry().source,
        walls=walls,
        doors=[Door(id="door-1", wall_id="missing", position=Point(x=5, y=5), width=2)],
    )
    issues = validate_geometry(with_bad_door)
    assert any("references unknown wall" in i for i in issues)