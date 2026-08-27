"""Small, dependency-light 2D geometry helpers used across geo2.

Only numpy is required. These are intentionally simple (segment distances,
point-in-polygon, polygon area/centroid, IoU) — no CAD-grade topology.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

from .schema import Point

EPS = 1e-9


def point_segment_distance(p: Point, a: Point, b: Point) -> float:
    """Euclidean distance from point `p` to the segment `a`-`b`."""
    px, py = p.x, p.y
    ax, ay = a.x, a.y
    bx, by = b.x, b.y
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 <= EPS:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def segment_distance(a1: Point, a2: Point, b1: Point, b2: Point) -> float:
    """Distance between two segments, in the sense of shared space.

    Returns 0.0 when the segments intersect within their extents.
    """
    if _segments_intersect(a1, a2, b1, b2):
        return 0.0
    return min(
        point_segment_distance(a1, b1, b2),
        point_segment_distance(a2, b1, b2),
        point_segment_distance(b1, a1, a2),
        point_segment_distance(b2, a1, a2),
    )


def _segments_intersect(a1: Point, a2: Point, b1: Point, b2: Point) -> bool:
    def cross(ox, oy, px, py, qx, qy):
        return (px - ox) * (qy - oy) - (py - oy) * (qx - ox)

    def on_segment(ox, oy, px, py, qx, qy):
        return (
            min(ox, px) <= qx <= max(ox, px)
            and min(oy, py) <= qy <= max(oy, py)
        )

    d1 = cross(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y)
    d2 = cross(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y)
    d3 = cross(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y)
    d4 = cross(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y)
    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and (
        (d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)
    ):
        return True
    if d1 == 0 and on_segment(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y):
        return True
    if d2 == 0 and on_segment(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y):
        return True
    if d3 == 0 and on_segment(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y):
        return True
    if d4 == 0 and on_segment(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y):
        return True
    return False


def polygon_area(points: Sequence[Point]) -> float:
    """Signed shoelace area of a simple polygon; absolute value returned."""
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        a = points[i]
        b = points[(i + 1) % n]
        area += a.x * b.y - b.x * a.y
    return abs(area) / 2.0


def polygon_centroid(points: Sequence[Point]) -> tuple[float, float]:
    """Area-weighted centroid of a simple polygon."""
    n = len(points)
    area = 0.0
    cx = 0.0
    cy = 0.0
    for i in range(n):
        a = points[i]
        b = points[(i + 1) % n]
        cross = a.x * b.y - b.x * a.y
        area += cross
        cx += (a.x + b.x) * cross
        cy += (a.y + b.y) * cross
    area = abs(area) / 2.0
    if area <= EPS:
        return (0.0, 0.0)
    return (cx / (6.0 * area)), (cy / (6.0 * area))


def point_in_polygon(x: float, y: float, poly: Sequence[Point]) -> bool:
    """Ray-casting point-in-polygon test (boundary counts as inside)."""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i].x, poly[i].y
        xj, yj = poly[j].x, poly[j].y
        if ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / ((yj - yi) or EPS) + xi
        ):
            inside = not inside
        j = i
    return inside


def polygon_to_np(poly: Sequence[Point]) -> np.ndarray:
    return np.array([[p.x, p.y] for p in poly], dtype=float)


def polygon_iou(a: Sequence[Point], b: Sequence[Point]) -> float:
    """Approximate polygon intersection-over-union via discrete grid sampling.

    The polygons are rasterised onto a grid derived from their bounding boxes;
    this is good enough for geometric benchmarking and keeps geo2 free of a
    heavy polygon-clipping dependency.
    """
    if len(a) < 3 or len(b) < 3:
        return 0.0
    xs = [p.x for p in a] + [p.x for p in b]
    ys = [p.y for p in a] + [p.y for p in b]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    if max_x - min_x < EPS or max_y - min_y < EPS:
        return 0.0
    target = 40
    step = max((max_x - min_x), (max_y - min_y)) / target
    step = float(step)
    inter = 0
    union = 0
    yy = min_y
    while yy <= max_y:
        xx = min_x
        while xx <= max_x:
            in_a = point_in_polygon(xx, yy, a)
            in_b = point_in_polygon(xx, yy, b)
            if in_a or in_b:
                union += 1
            if in_a and in_b:
                inter += 1
            xx += step
        yy += step
    if union <= 0:
        return 0.0
    return inter / union


def wall_segment(wall) -> tuple[Point, Point]:
    return wall.start, wall.end


def random_id(prefix: str, index: int) -> str:
    return f"{prefix}-{index:03d}"