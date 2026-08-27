"""Structural benchmark metrics for geo2.

Measures a predicted `FloorPlanGeometry` against an optional geo2-compatible
ground truth. Reports:

- counts per entity type
- geometry validity (does it pass the invariant checks?)
- detection classification per matched type: detected / missing / false positive
- positional proximity matching for doors, windows, stairs
- polygon overlap (rooms) and wall-segment proximity(walls)

When no ground truth is supplied, only counts + validity are reported, and the
`detection` sections are absent — a model is never credited for merely
producing valid JSON (see README, "Baseline ground truth").
"""

from __future__ import annotations

import math
from typing import Optional, Sequence

from pydantic import BaseModel, ConfigDict

from .geoutil import point_segment_distance, polygon_iou, segment_distance
from .schema import Door, FloorPlanGeometry, Point, Room, Stair, Wall, Window
from .validation import validate_geometry


class GroundTruthEntity(BaseModel):
    # GT documents focus on the fields matching uses; extra fields (e.g. from
    # full prediction documents) are tolerated rather than erroring.
    model_config = ConfigDict(extra="allow")


class GtWall(GroundTruthEntity):
    id: str
    start: Point
    end: Point
    thickness: float = 1.0
    type: str = "unknown"


class GtRoom(GroundTruthEntity):
    id: str
    polygon: list[Point]
    type: str = "unknown"


class GtDoor(GroundTruthEntity):
    id: str
    position: Point
    width: float = 1.0


class GtWindow(GroundTruthEntity):
    id: str
    position: Point
    width: float = 1.0


class GtStair(GroundTruthEntity):
    id: str
    region: list[Point]


class GroundTruth(BaseModel):
    """geo2-compatible ground truth document (`geo2-gt-v1`)."""

    model_config = ConfigDict(extra="forbid")

    version: str = "geo2-gt-v1"
    walls: list[GtWall] = []
    rooms: list[GtRoom] = []
    doors: list[GtDoor] = []
    windows: list[GtWindow] = []
    stairs: list[GtStair] = []


TOLERANCE_FRAC = 0.05  # matching tolerance as a fraction of the image diagonal


def _diagonal(geometry: FloorPlanGeometry) -> float:
    return math.hypot(geometry.source.width, geometry.source.height)


def _tol(geometry: FloorPlanGeometry) -> float:
    return max(2.0, TOLERANCE_FRAC * _diagonal(geometry))


def _greedy_match(
    pred_pts: list[tuple[str, tuple[float, float]]],
    gt_pts: list[tuple[str, tuple[float, float]]],
    tol: float,
) -> tuple[list[str], list[str], list[str]]:
    """Greedy nearest-neighbour one-to-one matching.

    Returns `(detected, missing, false_positives)`:
    - detected: predicted ids matched to a GT entity within `tol`
    - missing:  GT entities with no matching prediction
    - false_positives: predictions matched to nothing (or beyond `tol`)
    """
    matched_pred: set[str] = set()
    used_gt: set[int] = set()

    # nearest-first to avoid stealing a close GT entity from an even closer pred
    candidates: list[tuple[float, int, int]] = []
    for pi, (pid, (px, py)) in enumerate(pred_pts):
        for gi, (gid, (gx, gy)) in enumerate(gt_pts):
            d = math.hypot(px - gx, py - gy)
            candidates.append((d, pi, gi))
    candidates.sort(key=lambda t: (t[0], t[1], t[2]))

    for _, pi, gi in candidates:
        if pi in matched_pred or gi in used_gt:
            continue
        if _dist(pred_pts[pi][1], gt_pts[gi][1]) <= tol:
            matched_pred.add(pi)
            used_gt.add(gi)

    detected = [pid for pi, (pid, _) in enumerate(pred_pts) if pi in matched_pred]
    false_positives = [
        pid for pi, (pid, _) in enumerate(pred_pts) if pi not in matched_pred
    ]
    missing = [gid for gi, (gid, _) in enumerate(gt_pts) if gi not in used_gt]
    return detected, missing, false_positives


def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _clamp_condense(result: dict) -> dict:
    return {str(k): (round(float(v), 4) if isinstance(v, float) else v) for k, v in result.items()}


def match_doors(
    geometry: FloorPlanGeometry, gt: GroundTruth, tol: float
) -> dict:
    pred = {d.id: d for d in geometry.doors}
    gtd = {d.id: d for d in gt.doors}
    pred_pts = [(d.id, (d.position.x, d.position.y)) for d in geometry.doors]
    gt_pts = [(d.id, (d.position.x, d.position.y)) for d in gt.doors]
    detected, missing, fp = _greedy_match(pred_pts, gt_pts, tol)

    wall_assoc_ok = sum(1 for d in geometry.doors if d.wall_id in {w.id for w in geometry.walls})

    return {
        "count": len(pred),
        "ground_truth_count": len(gtd),
        "detected": detected,
        "missing": missing,
        "false_positive": fp,
        "wall_association_ok": wall_assoc_ok,
        "wall_association_total": len(pred),
    }


def match_windows(geometry, gt, tol):
    pred_pts = [(w.id, (w.position.x, w.position.y)) for w in geometry.windows]
    gt_pts = [(w.id, (w.position.x, w.position.y)) for w in gt.windows]
    detected, missing, fp = _greedy_match(pred_pts, gt_pts, tol)
    return {
        "count": len(geometry.windows),
        "ground_truth_count": len(gt.windows),
        "detected": detected,
        "missing": missing,
        "false_positive": fp,
    }


def match_stairs(geometry, gt, tol):
    """Stair matching: approximate location via region centroid within tol."""
    import numpy as np

    def centroid(region: Sequence[Point]) -> tuple[float, float]:
        r = region
        if not r:
            return (0.0, 0.0)
        xs = [p.x for p in r]
        ys = [p.y for p in r]
        return (sum(xs) / len(xs), sum(ys) / len(ys))

    pred_pts = [(s.id, centroid(s.region)) for s in geometry.stairs]
    gt_pts = [(s.id, centroid(s.region)) for s in gt.stairs]
    detected, missing, fp = _greedy_match(pred_pts, gt_pts, tol * 1.5)
    return {
        "count": len(geometry.stairs),
        "ground_truth_count": len(gt.stairs),
        "detected": detected,
        "missing": missing,
        "false_positive": fp,
        "approximate_location": True,
    }


def match_walls(geometry, gt, tol) -> dict:
    """Wall proximity match: a predicted wall matches a GT segment within tol."""
    pred = list(geometry.walls)
    gtw = list(gt.walls)
    matched_gt: set[str] = set()
    pred_flags: list[tuple[str, bool]] = []

    for wall in pred:
        best = None
        best_d = float("inf")
        for i, w in enumerate(gtw):
            if w.id in matched_gt:
                continue
            d = segment_distance(wall.start, wall.end, w.start, w.end)
            if d < best_d:
                best_d = d
                best = i
        if best is not None and best_d <= tol:
            matched_gt.add(gtw[best].id)
            pred_flags.append((wall.id, True))
        else:
            pred_flags.append((wall.id, False))

    detected = [pid for pid, ok in pred_flags if ok]
    fp = [pid for pid, ok in pred_flags if not ok]
    missing = [w.id for w in gtw if w.id not in matched_gt]
    return {
        "count": len(pred),
        "ground_truth_count": len(gtw),
        "detected": detected,
        "missing": missing,
        "false_positive": fp,
        "match_tolerance_px": round(tol, 2),
    }


def match_rooms(geometry, gt, tol) -> dict:
    """Room matching: polygon IoU after centroid proximity gating."""
    pred = list(geometry.rooms)
    gtr = list(gt.rooms)
    matched_gt: set[str] = set()
    ious: dict[str, float] = {}

    def centroid(room: Room) -> tuple[float, float]:
        n = len(room.polygon)
        if n == 0:
            return (0.0, 0.0)
        return (sum(p.x for p in room.polygon) / n, sum(p.y for p in room.polygon) / n)

    for room in pred:
        pcx, pcy = centroid(room)
        best = None
        best_d = float("inf")
        best_iou = 0.0
        for i, g in enumerate(gtr):
            if g.id in matched_gt:
                continue
            gcx, gcy = centroid_from(g)
            d = math.hypot(pcx - gcx, pcy - gcy)
            if d <= tol:
                iou = polygon_iou(room.polygon, g.polygon)
                if iou > best_iou:
                    best_iou = iou
                    best_d = d
                    best = i
        if best is not None:
            matched_gt.add(gtr[best].id)
            ious[room.id] = best_iou

    detected = list(ious)
    fp = [r.id for r in pred if r.id not in ious]
    missing = [g.id for g in gtr if g.id not in matched_gt]
    mean_iou = sum(ious.values()) / len(ious) if ious else 0.0
    return {
        "count": len(pred),
        "ground_truth_count": len(gtr),
        "detected": detected,
        "missing": missing,
        "false_positive": fp,
        "mean_polygon_iou": round(mean_iou, 4),
    }


def centroid_from(gt_room) -> tuple[float, float]:
    n = len(gt_room.polygon)
    if n == 0:
        return (0.0, 0.0)
    return (sum(p.x for p in gt_room.polygon) / n, sum(p.y for p in gt_room.polygon) / n)


def compute_metrics(
    geometry: FloorPlanGeometry,
    ground_truth: Optional[GroundTruth] = None,
) -> dict:
    """Compute structural metrics for a predicted document.

    Returns a dict with counts, geometry validity and, when GT is present,
    per-type detection results (detected / missing / false positive).
    """
    tol = _tol(geometry)
    issues = validate_geometry(geometry)
    metrics: dict = {
        "geometry_valid": not issues,
        "validation_errors": issues,
        "counts": {
            "walls": len(geometry.walls),
            "rooms": len(geometry.rooms),
            "doors": len(geometry.doors),
            "windows": len(geometry.windows),
            "stairs": len(geometry.stairs),
            "labels": len(geometry.labels),
            "dimensions": len(geometry.dimensions),
        },
    }

    if ground_truth is None:
        return metrics

    metrics["walls"] = _clamp_condense(match_walls(geometry, ground_truth, tol))
    metrics["rooms"] = match_rooms(geometry, ground_truth, tol)
    metrics["doors"] = match_doors(geometry, ground_truth, tol)
    metrics["windows"] = match_windows(geometry, ground_truth, tol)
    metrics["stairs"] = match_stairs(geometry, ground_truth, tol)

    # summary line so results can be ranked on one number
    det = metrics["doors"]["detected"] if "doors" in metrics else []
    win_det = metrics["windows"]["detected"] if "windows" in metrics else []
    stair_det = metrics["stairs"]["detected"] if "stairs" in metrics else []
    missing = []
    fp = []
    for key in ("doors", "windows", "stairs"):
        if key in metrics:
            missing += metrics[key]["missing"]
            fp += metrics[key]["false_positive"]
    metrics["summary"] = {
        "detected_count": len(det) + len(win_det) + len(stair_det),
        "missing_count": len(missing),
        "false_positive_count": len(fp),
        "mean_room_iou": metrics["rooms"]["mean_polygon_iou"],
    }
    return metrics