"""Geometry invariant validation for geo2.

Separates *structural* schema checks (Pydantic, see `schema.py`) from
*geometric* invariant checks:

- all coordinates finite and within the image bounds (with tolerance)
- valid non-degenerate polygons (>=3 points, no duplicate consecutive vertices)
- non-negative, sane widths
- doors/windows reference an existing wall, and their centre lies near that wall
- room `wall_ids` reference existing walls
- unique, well-formed entity IDs across the whole document

Returns a list of human-readable issue strings; an empty list means the
document passed. Validation is deliberately conservative without adding
architectural heuristics.
"""

from __future__ import annotations

import math
import re
from typing import Any, List, Sequence

from .geoutil import point_segment_distance
from .schema import FloorPlanGeometry, Point

_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


def validate_geometry(geometry: FloorPlanGeometry) -> List[str]:
    """Return a list of validation issues; empty list == valid."""
    issues: List[str] = []
    issues += _validate_ids(geometry)
    issues += _validate_bounds(geometry)
    issues += _validate_walls(geometry)
    issues += _validate_rooms(geometry)
    issues += _validate_wall_references(geometry)
    issues += _validate_polygons(geometry)
    issues += _validate_dimensions(geometry)
    return issues


def _all_entities(geometry: FloorPlanGeometry):
    for e in geometry.walls:
        yield "wall", e.id
    for e in geometry.rooms:
        yield "room", e.id
    for e in geometry.doors:
        yield "door", e.id
    for e in geometry.windows:
        yield "window", e.id
    for e in geometry.stairs:
        yield "stair", e.id
    for e in geometry.labels:
        yield "label", e.id
    for e in geometry.dimensions:
        yield "dimension", e.id


def _validate_ids(geometry: FloorPlanGeometry) -> List[str]:
    issues: List[str] = []
    seen: dict[str, str] = {}
    for kind, eid in _all_entities(geometry):
        if not eid:
            issues.append(f"{kind} has an empty id")
            continue
        if not _ID_PATTERN.match(eid):
            issues.append(f"{kind} id {eid!r} is malformed (allowed: A-Za-z0-9_-)")
        if eid in seen:
            issues.append(f"duplicate entity id {eid!r} ({seen[eid]} vs {kind})")
        else:
            seen[eid] = kind
    return issues


def _validate_bounds(geometry: FloorPlanGeometry) -> List[str]:
    issues: List[str] = []
    w, h = geometry.source.width, geometry.source.height
    tol = max(2.0, 0.02 * max(w, h))

    def check(label: str, x: float, y: float) -> None:
        if not (math.isfinite(x) and math.isfinite(y)):
            issues.append(f"{label} has non-finite coordinate ({x}, {y})")
            return
        if x < -tol or x > w + tol or y < -tol or y > h + tol:
            issues.append(
                f"{label} coordinate ({x:.1f}, {y:.1f}) is outside image bounds "
                f"({w}x{h}, tol {tol:.1f})"
            )

    for wall in geometry.walls:
        check(f"wall[{wall.id}].start", wall.start.x, wall.start.y)
        check(f"wall[{wall.id}].end", wall.end.x, wall.end.y)
    for room in geometry.rooms:
        for i, p in enumerate(room.polygon):
            check(f"room[{room.id}].polygon[{i}]", p.x, p.y)
    for door in geometry.doors:
        check(f"door[{door.id}].position", door.position.x, door.position.y)
    for window in geometry.windows:
        check(f"window[{window.id}].position", window.position.x, window.position.y)
    for stair in geometry.stairs:
        for i, p in enumerate(stair.region):
            check(f"stair[{stair.id}].region[{i}]", p.x, p.y)
    for label in geometry.labels:
        check(f"label[{label.id}].position", label.position.x, label.position.y)
    for dim in geometry.dimensions:
        check(f"dimension[{dim.id}].start", dim.start.x, dim.start.y)
        check(f"dimension[{dim.id}].end", dim.end.x, dim.end.y)
    return issues


def _validate_walls(geometry: FloorPlanGeometry) -> List[str]:
    issues: List[str] = []
    for wall in geometry.walls:
        if wall.type not in ("exterior", "interior", "unknown"):
            issues.append(f"wall[{wall.id}] has unknown type {wall.type!r}")
        if wall.thickness < 0:
            issues.append(f"wall[{wall.id}] has negative thickness {wall.thickness}")
        if wall.thickness > max(geometry.source.width, geometry.source.height):
            issues.append(f"wall[{wall.id}] thickness {wall.thickness} larger than the image")
        dx = wall.end.x - wall.start.x
        dy = wall.end.y - wall.start.y
        if dx == 0 and dy == 0:
            issues.append(f"wall[{wall.id}] is a zero-length wall (start == end)")
    return issues


def _validate_polygons(geometry: FloorPlanGeometry) -> List[str]:
    issues: List[str] = []

    def check(kind: str, eid: str, pts: Sequence[Point], min_n: int) -> None:
        if len(pts) < min_n:
            issues.append(f"{kind}[{eid}] polygon has {len(pts)} points (need >= {min_n})")
            return
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            if a.x == b.x and a.y == b.y:
                issues.append(f"{kind}[{eid}] polygon has duplicate consecutive point at index {i}")
                break

    for room in geometry.rooms:
        check("room", room.id, room.polygon, 3)
    for stair in geometry.stairs:
        check("stair", stair.id, stair.region, 3)
    return issues


def _validate_rooms(geometry: FloorPlanGeometry) -> List[str]:
    issues: List[str] = []
    wall_ids = {w.id for w in geometry.walls}
    for room in geometry.rooms:
        for wid in room.wall_ids:
            if wid not in wall_ids:
                issues.append(f"room[{room.id}] references unknown wall id {wid!r}")
    return issues


def _validate_wall_references(geometry: FloorPlanGeometry) -> List[str]:
    issues: List[str] = []
    walls: dict[str, Any] = {w.id: w for w in geometry.walls}
    tol = max(2.0, 0.05 * max(geometry.source.width, geometry.source.height))

    for door in geometry.doors:
        wall = walls.get(door.wall_id)
        if wall is None:
            issues.append(f"door[{door.id}] references unknown wall id {door.wall_id!r}")
        elif point_segment_distance(door.position, wall.start, wall.end) > tol:
            issues.append(
                f"door[{door.id}] centre is too far from its wall {door.wall_id!r} "
                f"(distance {point_segment_distance(door.position, wall.start, wall.end):.1f}px)"
            )
        if door.width < 0:
            issues.append(f"door[{door.id}] has negative width")
        if door.width > max(geometry.source.width, geometry.source.height):
            issues.append(f"door[{door.id}] width exceeds image dimensions")

    for window in geometry.windows:
        wall = walls.get(window.wall_id)
        if wall is None:
            issues.append(f"window[{window.id}] references unknown wall id {window.wall_id!r}")
        elif point_segment_distance(window.position, wall.start, wall.end) > tol:
            issues.append(
                f"window[{window.id}] centre is too far from its wall {window.wall_id!r}"
            )
        if window.width < 0:
            issues.append(f"window[{window.id}] has negative width")
        if window.width > max(geometry.source.width, geometry.source.height):
            issues.append(f"window[{window.id}] width exceeds image dimensions")

    return issues


def _validate_dimensions(geometry: FloorPlanGeometry) -> List[str]:
    issues: List[str] = []
    for dim in geometry.dimensions:
        if not math.isfinite(dim.value):
            issues.append(f"dimension[{dim.id}] has non-finite value")
        if dim.value < 0:
            issues.append(f"dimension[{dim.id}] has negative value")
    return issues


# Re-exported for convenience: structural + geometric validity.
def validate(geometry: FloorPlanGeometry) -> List[str]:
    """Alias for `validate_geometry`."""
    return validate_geometry(geometry)