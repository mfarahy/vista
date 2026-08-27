"""Phase 7 — deterministic geometry candidate recovery.

Fusion (Phase 6) selects, names and classifies the UNet's geometric evidence
using VLM semantics, but a real floor plan still contains semantic observations
with **no geometric candidate at all**:

    VLM: window detected     UNet: windows = []
    VLM: stair detected      UNet: stairs = []
    VLM: multiple rooms      UNet: only one room candidate

This module adds a small, deterministic *recovery layer* that re-derives the
missing geometry from the source image and the existing wall topology — for
unresolved semantic observations only. It never reruns the VLM and it does not
add a second AI model. All recovered coordinates are expressed in the same
source-pixel system as the normalized geometry and the fused document.

Division of responsibility stays strict (the Phase 6 principle is preserved):

* the VLM provides *semantics* (entity, label, wall, room connectivity,
  approximate relative location) — never pixel geometry;
* geometry comes from the **image** (wall-opening detection on the source
  raster), the **existing UNet geometry** (normalized walls, opening
  candidates, room-candidate faces) and **deterministic reconstruction**
  (wall-gap profiles, parallel-line stair detection, face shape checks);
* if the evidence is insufficient the semantic observation stays
  **unresolved** — nothing is ever fabricated.

Recovery priority (Phase 7 spec): windows → doors → rooms → stairs.

Provenance: every recovered entity carries
`provenance = {geometric: "image_recovery", semantic: "vlm", recovery: True}`
plus a concise `recovered_reason` and an `evidence_level` (high / medium / low)
— never a fabricated probability.

The `recover()` entry point returns a copy of the fused document with the
recovered entities appended, `unresolved` updated (recovered items are removed,
the rest gain a `recovery_reason`), a `recovery` debug section and adjusted
counts. Deterministic: identical inputs ⇒ byte-identical output.
"""

from __future__ import annotations

import copy
import math
from typing import Any, Sequence

import numpy as np
from PIL import Image

from .fusion import (
    _classify_wall_side,
    _derive_plan_bounds,
    _name_segments,
    _names_match,
    parse_relative_location,
)
from .normalize import _point_in_polygon, _polygon_centroid

RECOVERY_SCHEMA = "vista-geometry-recovery-v1"

# Opening-detection thresholds (relative to the wall's own ink level, so the
# same constants work on authored band plans and real scanned double-line
# plans — no fixture-specific values).
_FRACTION_FLOOR = 0.10     # min ink break / wall baseline to count as a gap
_MEDIUM_FRACTION = 0.18    # ≥ this → evidence "medium"
_HIGH_FRACTION = 0.40      # ≥ this → evidence "high"
_BASELINE_PERCENTILE = 70  # dominant wall ink level
_MARGIN_THICKNESSES = 2.0  # gap must not touch the wall endpoints

# How far (relative to the host wall's length) a semantic anchor may drift from
# a detected gap's centre before the match is rejected.
_ANCHOR_TOLERANCE = 0.32

# Minimum host-wall strength for a wall to carry a recovered opening.
_MIN_HOST_THICKNESS_FRACTION = 0.55  # x the median normalized wall thickness
_MIN_HOST_LENGTH_THICKNESSES = 4.0

# Stair tread detection
_STAIR_REGION_PX = 200
_STAIR_MIN_PARALLEL_LINES = 3
_STAIR_MIN_LINE_LENGTH = 36
_STAIR_MAX_GAP = 12


# ----------------------------------------------------------------------------
# Image loading + small helpers
# ----------------------------------------------------------------------------


def load_grayscale_float(image: Image.Image | bytes | None) -> np.ndarray | None:
    """Grayscale float array in source pixel space, or None when unavailable."""
    if image is None:
        return None
    if isinstance(image, bytes):
        try:
            image = Image.open(__import__("io").BytesIO(image)).convert("L")
        except Exception:
            return None
    return np.asarray(image.convert("L")).astype(np.float32)


def _wall_unit(wall: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, float]:
    """(unit direction u, unit normal n, length) of the wall centerline."""
    s = np.array(wall["start"], dtype=np.float64)
    e = np.array(wall["end"], dtype=np.float64)
    d = e - s
    length = float(np.linalg.norm(d))
    if length < 1e-6:
        return np.array([1.0, 0.0]), np.array([0.0, 1.0]), 0.0
    u = d / length
    return u, np.array([-u[1], u[0]]), length


def _profile(
    gray: np.ndarray, wall: dict[str, Any]
) -> tuple[np.ndarray, np.ndarray, float, float]:
    """Ink profile along the wall centerline (source pixel space).

    Returns (ts, profile, wall_length, baseline) where `profile[i]` is the
    mean ink (255 − luminance) in a narrow band around the centerline at
    `ts[i]`. `baseline` is the wall's dominant ink level (70th percentile).
    """
    u, _n, length = _wall_unit(wall)
    if length < 1e-6:
        return np.array([]), np.array([]), 0.0, 0.0
    thickness = max(float(wall.get("thickness", 12.0)), 2.0)
    half = max(2, round(thickness * 0.20))  # narrow centreline band
    step = max(2.0, thickness * 0.33)
    ts = np.arange(0.0, length, step)
    prof = np.empty(len(ts), dtype=np.float64)
    h, w = gray.shape
    for i, t in enumerate(ts):
        px = float(wall["start"][0] + u[0] * t)
        py = float(wall["start"][1] + u[1] * t)
        y0, y1 = max(0, int(py) - half), min(h, int(py) + half + 1)
        x0, x1 = max(0, int(px) - half), min(w, int(px) + half + 1)
        if y1 <= y0 or x1 <= x0:
            prof[i] = 0.0
            continue
        prof[i] = float((255.0 - gray[y0:y1, x0:x1]).mean())
    if len(prof) == 0:
        return ts, prof, length, 0.0
    baseline = float(np.percentile(prof, _BASELINE_PERCENTILE))
    return ts, prof, length, baseline


def detect_wall_gaps(
    wall: dict[str, Any], gray: np.ndarray | None
) -> list[dict[str, Any]]:
    """Deterministic wall-opening detection on the source image.

    A window/door interrupts the wall's ink: on double-line drawings both
    strokes break (strong signal); on filled-band drawings a window is a
    lighter transverse line (weaker but still a local ink dip). Returns a list
    of `{t0, t1, width, strength, baseline, ratio}` sorted by position.
    """
    if gray is None:
        return []
    thickness = max(float(wall.get("thickness", 12.0)), 2.0)
    ts, prof, length, baseline = _profile(gray, wall)
    if len(ts) < 8 or baseline < 5.0:
        return []
    threshold = _FRACTION_FLOOR * baseline
    breakdown = baseline - prof
    step = max(2.0, thickness * 0.33)
    min_width = max(step * 2, thickness * 0.6)
    margin = thickness * _MARGIN_THICKNESSES

    gaps: list[dict[str, Any]] = []
    start: int | None = None
    lo = ts[-1] - margin
    for i, t in enumerate(ts):
        interior = t >= margin and t <= lo
        is_gap = interior and breakdown[i] > threshold
        if is_gap and start is None:
            start = i
        elif not is_gap and start is not None:
            if ts[i - 1] - ts[start] >= min_width:
                seg_max = float(breakdown[start:i].max())
                gaps.append(
                    {
                        "t0": round(float(ts[start]), 2),
                        "t1": round(float(ts[i - 1]), 2),
                        "width": round(float(ts[i - 1] - ts[start]), 2),
                        "strength": seg_max,
                        "baseline": round(baseline, 2),
                        "ratio": round(seg_max / baseline, 4),
                    }
                )
            start = None
    if start is not None and ts[-1] - ts[start] >= min_width:
        seg_max = float(breakdown[start:].max())
        gaps.append(
            {
                "t0": round(float(ts[start]), 2),
                "t1": round(float(ts[-1]), 2),
                "width": round(float(ts[-1] - ts[start]), 2),
                "strength": seg_max,
                "baseline": round(baseline, 2),
                "ratio": round(seg_max / baseline, 4),
            }
        )
    return gaps


def evidence_level(ratio: float) -> str | None:
    """Map an opening ink-break ratio onto high / medium / low, or None."""
    if ratio >= _HIGH_FRACTION:
        return "high"
    if ratio >= _MEDIUM_FRACTION:
        return "medium"
    if ratio >= _FRACTION_FLOOR:
        return "low"
    return None


# ----------------------------------------------------------------------------
# Occupancy: already-emitted openings must not be overlapped by recovery
# ----------------------------------------------------------------------------


def _occupied_spans(fused: dict[str, Any], walls: list[dict[str, Any]]) -> dict[str, list[tuple[float, float]]]:
    """Along-wall spans (px) already claimed by emitted openings per wall."""
    wall_len = {w["id"]: _wall_unit(w)[2] for w in walls}
    occupied: dict[str, list[tuple[float, float]]] = {}
    for kind in ("windows", "doors"):
        for o in fused.get(kind, []):
            wid = o.get("wall_id")
            if wid not in wall_len or wid is None:
                continue
            length = wall_len[wid]
            if length < 1e-6:
                continue
            center = float(o.get("position", 0.0)) * length
            width = float(o.get("width") or 0.0)
            occupied.setdefault(wid, []).append((center - width / 2, center + width / 2))
    return occupied


def _overlaps(span: tuple[float, float], occupied: Sequence[tuple[float, float]], tolerance: float) -> bool:
    for (a, b) in occupied:
        if span[1] + tolerance >= a and span[0] - tolerance <= b:
            return True
    return False


# ----------------------------------------------------------------------------
# Room recovery (Step 6/7) — wall-topology based, never fabricated
# ----------------------------------------------------------------------------


def _recover_rooms(normalized: dict[str, Any], unresolved: list[dict[str, Any]], *, src_w: int, src_h: int, content_rect: Sequence[int] | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Classify unresolved semantic spaces against the wall-graph faces.

    Reuses the normalized wall graph: every closed face is already available as
    a room candidate (`normalized["candidates"]["rooms"]`). A space whose
    anchor lies inside a candidate face that was rejected for a geometric
    reason, or inside the same accepted face another space claimed, has **no
    closed boundary of its own** — it stays unresolved with a precise reason.
    No polygon is ever invented (Step 7: a missing boundary ⇒ unresolved).
    """
    faces = normalized.get("candidates", {}).get("rooms", [])
    resolved: list[dict[str, Any]] = []
    remaining: list[dict[str, Any]] = []
    for u in unresolved:
        anchor = parse_relative_location(
            u.get("relative_location"), src_w=src_w, src_h=src_h, content_rect=content_rect
        )
        pt = (anchor["x"], anchor["y"])
        containing = [f for f in faces if _point_in_polygon(pt, f.get("polygon"))]
        containing.sort(key=lambda f: -float(f.get("area_px", 0)))
        if containing and any(f.get("status") == "accepted" for f in containing):
            holder = u.get("reason") or "region_shared_with_space"
            entry = {**u, "recovery_reason": holder}
            remaining.append(entry)
        elif containing:
            rejection = containing[0].get("reason", "geometrically_invalid")
            entry = {
                **u,
                "recovery_reason": f"no_closed_geometric_boundary:{rejection}",
            }
            remaining.append(entry)
        else:
            entry = {**u, "recovery_reason": "no_closed_geometric_boundary"}
            remaining.append(entry)
        # `resolved` stays empty: a face that geometrically exists was already
        # matched by fusion; a rejected face is not a room we may promote.
    return resolved, remaining


# ----------------------------------------------------------------------------
# Opening host-wall selection (shared by windows and doors)
# ----------------------------------------------------------------------------


def _median_wall_thickness(walls: list[dict[str, Any]]) -> float:
    """Robust wall-thickness baseline (75th percentile).

    The raw UNet wall field also contains thin fragment walls (stair treads,
    dashes, text crossings); the mean/median skews toward them. The 75th
    percentile tracks the dominant *real wall* band thickness on authored and
    scanned plans alike.
    """
    values = sorted(w["thickness"] for w in walls if (w.get("thickness") or 0) > 0)
    if not values:
        return 12.0
    idx = min(len(values) - 1, int(round(0.75 * (len(values) - 1))))
    return float(values[idx])


def _host_walls(
    walls: list[dict[str, Any]],
    *,
    src_w: int,
    src_h: int,
    median_th: float,
    content_rect: Sequence[int] | None,
) -> list[dict[str, Any]]:
    """Real walls from the normalized set (thickness/length gates only)."""
    min_th = max(2.0, _MIN_HOST_THICKNESS_FRACTION * median_th)
    min_len = max(12.0, _MIN_HOST_LENGTH_THICKNESSES * median_th)
    out = []
    for w in walls:
        if (w.get("thickness") or 0) < min_th:
            continue
        if _wall_unit(w)[2] < min_len:
            continue
        out.append(w)
    return out


def _anchor_t(wall: dict[str, Any], anchor: Sequence[float]) -> float:
    """Project the semantic anchor onto the wall, clamped to its length."""
    u, _n, length = _wall_unit(wall)
    if length < 1e-6:
        return 0.0
    rel = np.array([anchor[0] - wall["start"][0], anchor[1] - wall["start"][1]])
    return float(np.clip(np.dot(rel, u), 0.0, length))


def _rank_walls(
    walls: list[dict[str, Any]],
    anchor: Sequence[float],
    hint: dict[str, Any],
    *,
    src_w: int, src_h: int, diag: float,
    content_rect: Sequence[int] | None,
    interior_only: bool = False,
    exterior_ok: bool = True,
) -> list[dict[str, Any]]:
    """Rank host walls by side/orientation match then anchor proximity."""
    scored: list[tuple[float, int, dict[str, Any]]] = []
    for i, w in enumerate(walls):
        score = 0.0
        side = _classify_wall_side(w, src_w, src_h, content_rect)
        if hint.get("wall_side") and side == hint["wall_side"]:
            score += 4.0
        elif hint.get("wall_side") and side != hint["wall_side"]:
            score -= 2.0
        orient = "horizontal" if abs(w["end"][0] - w["start"][0]) >= abs(w["end"][1] - w["start"][1]) else "vertical"
        if hint.get("horizontal") and orient == "horizontal":
            score += 1.5
        if hint.get("vertical") and orient == "vertical":
            score += 1.5
        wtype = w.get("type", "unknown")
        if wtype == "exterior" and exterior_ok and not interior_only:
            score += 0.75
        if wtype == "interior" and interior_only:
            score += 0.75
        if interior_only and wtype == "exterior":
            score -= 2.0
        d, _t = _dist_to_seg(anchor, w["start"], w["end"])
        score += 1.0 / (1.0 + d / diag)
        scored.append((score, i, w))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [w for _s, _i, w in scored]


def _dist_to_seg(p: Sequence[float], a: Sequence[float], b: Sequence[float]) -> tuple[float, float]:
    abx = b[0] - a[0]
    aby = b[1] - a[1]
    len2 = abx * abx + aby * aby
    if len2 < 1e-9:
        return (math.hypot(p[0] - a[0], p[1] - a[1]), 0.0)
    t = min(1.0, max(0.0, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2))
    fx = a[0] + t * abx
    fy = a[1] + t * aby
    return (math.hypot(p[0] - fx, p[1] - fy), t)


# ----------------------------------------------------------------------------
# Window recovery (Step 4)
# ----------------------------------------------------------------------------


def _semantic_wall_side(entry: dict[str, Any], *, src_w: int, src_h: int, content_rect: Sequence[int] | None) -> str | None:
    """Extract a compass wall hint ("north wall") from the window's wall field."""
    wall_text = entry.get("wall")
    if not wall_text:
        return None
    hint = parse_relative_location(str(wall_text), src_w=src_w, src_h=src_h, content_rect=content_rect)
    return hint.get("wall_side")


def _plausible_opening(width: float, wall_len: float, thumb: float) -> bool:
    """A recovered opening must have a plausible width (relative to itself):
    it must be wider than a WALL is thick (an opening, not noise) yet shorter
    than most of its host wall (an eroded wall, not a gap candidate)."""
    return width >= thumb and width <= 0.40 * max(wall_len, 1.0)


def _recover_windows(
    normalized: dict[str, Any],
    fused: dict[str, Any],
    gray: np.ndarray | None,
    unresolved: list[dict[str, Any]],
    *,
    src_w: int, src_h: int, content_rect: Sequence[int] | None, diag: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Recover unresolved semantic windows from wall-opening image evidence."""
    walls = normalized["walls"]
    median_th = _median_wall_thickness(walls)
    host_walls = _host_walls(walls, src_w=src_w, src_h=src_h, median_th=median_th, content_rect=content_rect)
    occupied = _occupied_spans(fused, walls)
    wall_len = {w["id"]: _wall_unit(w)[2] for w in walls}
    thumb = max(4.0, 0.6 * median_th)

    recovered: list[dict[str, Any]] = []
    remaining: list[dict[str, Any]] = []

    for u in unresolved:
        hint = parse_relative_location(
            u.get("relative_location"), src_w=src_w, src_h=src_h, content_rect=content_rect
        )
        side = hint.get("wall_side") or _semantic_wall_side(u, src_w=src_w, src_h=src_h, content_rect=content_rect)
        if side and not hint.get("wall_side"):
            hint = {**hint, "wall_side": side}
        anchor = (hint["x"], hint["y"])
        # The window's `space` names the room it belongs to; when that room is
        # a matched geometric face, its boundary walls are the only credible
        # hosts (windows sit on the room's exterior shell).
        room_hosts: list[dict[str, Any]] = []
        if u.get("space"):
            for room in fused.get("rooms", []):
                if room.get("name") and _names_match(u["space"], room.get("name")):
                    room_hosts = [
                        w for w in host_walls
                        if w["id"] in (room.get("wall_ids") or [])
                    ]
                    break
        if room_hosts:
            if side:
                room_hosts = [
                    w for w in room_hosts
                    if _classify_wall_side(w, src_w, src_h, content_rect) == side
                ] or room_hosts
            candidates = _rank_walls(
                host_walls if not room_hosts else room_hosts,
                anchor, hint, src_w=src_w, src_h=src_h, diag=diag,
                content_rect=content_rect, interior_only=False, exterior_ok=True,
            )
        else:
            # No matched room — prefer the building's exterior shell: windows
            # are exterior openings on these plans. Fall back to interior walls
            # only when no exterior wall plausibly hosts the anchor.
            exterior = [w for w in host_walls if w.get("type") == "exterior"]
            pool = exterior if exterior else host_walls
            candidates = _rank_walls(
                pool, anchor, hint, src_w=src_w, src_h=src_h, diag=diag,
                content_rect=content_rect, interior_only=not bool(exterior),
                exterior_ok=bool(exterior),
            )
        # A window whose text names a specific wall ("west wall") must be on
        # one of the walls classifying to that side — a far-stronger constraint
        # than the anchor point, which is a plan fraction and inherently coarse.
        if side is not None:
            candidates = [
                w for w in candidates
                if _classify_wall_side(w, src_w, src_h, content_rect) == side
            ]

        best: dict[str, Any] | None = None
        for cand in candidates[:6]:
            gaps = detect_wall_gaps(cand, gray)
            if not gaps:
                continue
            anchor_t = _anchor_t(cand, anchor)
            for g in gaps:
                level = evidence_level(g["ratio"])
                if level is None:
                    continue
                width = g["width"]
                if not _plausible_opening(width, wall_len[cand["id"]], thumb):
                    continue
                center = (g["t0"] + g["t1"]) / 2
                if abs(center - anchor_t) > _ANCHOR_TOLERANCE * max(wall_len[cand["id"]], 1.0):
                    continue
                span = (g["t0"], g["t1"])
                if _overlaps(span, occupied.get(cand["id"], []), max(4.0, 0.5 * median_th)):
                    continue
                score = abs(center - anchor_t) * (1.0 if level == "high" else 2.0 if level == "medium" else 3.0)
                if best is None or score < best["score"]:
                    best = {
                        "score": score,
                        "wall": cand,
                        "gap": g,
                        "level": level,
                    }
        if best is None:
            remaining.append({**u, "recovery_reason": "no_reliable_opening_evidence"})
            continue
        wall = best["wall"]
        gap = best["gap"]
        length = wall_len[wall["id"]]
        position = round(((gap["t0"] + gap["t1"]) / 2) / max(length, 1e-6), 4)
        entity: dict[str, Any] = {
            "candidate_id": f"rec-win-{len(recovered)}",
            "wall_id": wall["id"],
            "position": position,
            "width": round(gap["width"], 2),
            "confidence": None,
            "corrected": True,
            "semantic_match": True,
            "recovery": True,
            "space": u.get("space"),
            "wall": u.get("wall"),
            "semantic_index": u.get("semantic_index"),
            "evidence_level": best["level"],
            "recovered_reason": (
                f"wall opening pattern t={gap['t0']:.0f}..{gap['t1']:.0f}px "
                f"on wall {wall['id']} (ink break ratio {gap['ratio']:.2f})"
            ),
            "provenance": {"geometric": "image_recovery", "semantic": "vlm", "recovery": True},
        }
        recovered.append(entity)
        occupied.setdefault(wall["id"], []).append((gap["t0"], gap["t1"]))

    recovered.sort(key=lambda e: e["candidate_id"])
    return recovered, remaining


# ----------------------------------------------------------------------------
# Door recovery (Step 5)
# ----------------------------------------------------------------------------


def _rooms_connected(connects: str | None, rooms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Matched rooms named in the door's connects field."""
    if not connects:
        return []
    segments = _name_segments(connects)
    return [r for r in rooms if any(_names_match(seg, r.get("name")) for seg in segments)]


def _shared_walls(rooms, walls_by_id) -> list[dict[str, Any]]:
    """Walls on the boundary between two matched rooms."""
    if len(rooms) < 2:
        return []
    id_a = set(rooms[0].get("wall_ids") or [])
    id_b = set(rooms[1].get("wall_ids") or [])
    return [walls_by_id.get(wid) for wid in sorted(id_a & id_b) if walls_by_id.get(wid)]


def _wall_separates(wall: dict[str, Any], room_a: dict[str, Any], room_b: dict[str, Any]) -> bool:
    """Does the wall's perpendicular neighbourhood separate the two room
    centroids (one on each side) rather than border them on the same side?"""
    c_a = _polygon_centroid(room_a.get("polygon") or [])
    c_b = _polygon_centroid(room_b.get("polygon") or [])
    u, n, _length = _wall_unit(wall)
    if _length < 1e-6:
        return False
    mid = (np.array(wall["start"]) + np.array(wall["end"])) / 2.0
    sa = float(np.dot(np.array(c_a) - mid, n))
    sb = float(np.dot(np.array(c_b) - mid, n))
    return math.copysign(1.0, sa) != math.copysign(1.0, sb) or abs(sa) < 1e-6 or abs(sb) < 1e-6



def _recover_doors(
    normalized: dict[str, Any],
    fused: dict[str, Any],
    gray: np.ndarray | None,
    unresolved: list[dict[str, Any]],
    *,
    src_w: int, src_h: int, content_rect: Sequence[int] | None, diag: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    walls = normalized["walls"]
    median_th = _median_wall_thickness(walls)
    host_walls = _host_walls(walls, src_w=src_w, src_h=src_h, median_th=median_th, content_rect=content_rect)
    occupied = _occupied_spans(fused, walls)
    wall_len = {w["id"]: _wall_unit(w)[2] for w in walls}
    walls_by_id = {w["id"]: w for w in walls}
    thumb = max(4.0, 0.6 * median_th)
    rooms = fused.get("rooms", [])

    recovered: list[dict[str, Any]] = []
    remaining: list[dict[str, Any]] = []

    for u in unresolved:
        hint = parse_relative_location(
            u.get("relative_location"), src_w=src_w, src_h=src_h, content_rect=content_rect
        )
        anchor = (hint["x"], hint["y"])
        is_exterior = u.get("type") == "exterior"
        connects = u.get("connects")
        connected = _rooms_connected(connects, rooms)

        ranked: list[tuple[dict[str, Any], float]] = []  # (wall, tolerance_factor)
        if len(connected) >= 2:
            shared = [w for w in _shared_walls(connected[:2], walls_by_id) if w is not None]
            r0, r1 = connected[0], connected[1]
            separators = [w for w in shared if _wall_separates(w, r0, r1)]
            if separators:
                # The connecting door sits on the wall that separates the two
                # named rooms. With a single separator the gap IS the door, so
                # the coarse plan-fraction anchor must not veto it.
                factor = 1.0 if len(separators) == 1 else 0.7
                ranked = [(w, factor) for w in separators]
            elif shared:
                ranked = [(w, 0.55) for w in shared]
            else:
                # fall back to anchor ranking on the first room's boundary
                first_wall_ids = connected[0].get("wall_ids") or []
                ranked = [(walls_by_id[w], 0.35) for w in first_wall_ids if walls_by_id.get(w)]
        elif len(connected) == 1:
            first_wall_ids = connected[0].get("wall_ids") or []
            ranked = [(walls_by_id[w], 0.55) for w in first_wall_ids if walls_by_id.get(w)]
        else:
            _ranked = _rank_walls(
                host_walls, anchor, hint, src_w=src_w, src_h=src_h, diag=diag,
                content_rect=content_rect,
                interior_only=not is_exterior, exterior_ok=is_exterior,
            )
            ranked = [(w, _ANCHOR_TOLERANCE) for w in _ranked[:6]]

        best: dict[str, Any] | None = None
        for cand, tol_factor in ranked:
            if cand is None:
                continue
            if (cand.get("thickness") or 0) < _MIN_HOST_THICKNESS_FRACTION * median_th:
                continue
            if _wall_unit(cand)[2] < max(12.0, _MIN_HOST_LENGTH_THICKNESSES * median_th):
                continue
            gaps = detect_wall_gaps(cand, gray)
            if not gaps:
                continue
            anchor_t = _anchor_t(cand, anchor)
            # Room connectivity already pinned the wall — the semantic anchor
            # is only a secondary signal and may be far from the exact opening.
            tolerance = tol_factor * max(wall_len[cand["id"]], 1.0)
            for g in gaps:
                level = evidence_level(g["ratio"])
                if level is None:
                    continue
                width = g["width"]
                if not _plausible_opening(width, wall_len[cand["id"]], thumb):
                    continue
                center = (g["t0"] + g["t1"]) / 2
                if abs(center - anchor_t) > tolerance:
                    continue
                span = (g["t0"], g["t1"])
                if _overlaps(span, occupied.get(cand["id"], []), max(4.0, 0.5 * median_th)):
                    continue
                if (cand.get("type") == "exterior") and not is_exterior and tol_factor <= _ANCHOR_TOLERANCE:
                    continue
                if (cand.get("type") != "exterior") and is_exterior and len(connected) >= 2:
                    continue
                score = abs(center - anchor_t) * (1.0 if level == "high" else 2.0 if level == "medium" else 3.0)
                if best is None or score < best["score"]:
                    best = {"score": score, "wall": cand, "gap": g, "level": level}
        if best is None:
            remaining.append({**u, "recovery_reason": "no_reliable_opening_evidence"})
            continue
        wall = best["wall"]
        gap = best["gap"]
        length = wall_len[wall["id"]]
        entity: dict[str, Any] = {
            "candidate_id": f"rec-door-{len(recovered)}",
            "wall_id": wall["id"],
            "position": round(((gap["t0"] + gap["t1"]) / 2) / max(length, 1e-6), 4),
            "width": round(gap["width"], 2),
            "confidence": None,
            "corrected": True,
            "semantic_match": True,
            "recovery": True,
            "semantic_type": u.get("type", "unknown"),
            "connects": u.get("connects"),
            "swing": "unknown",
            "semantic_index": u.get("semantic_index"),
            "evidence_level": best["level"],
            "recovered_reason": (
                f"wall opening pattern t={gap['t0']:.0f}..{gap['t1']:.0f}px "
                f"on wall {wall['id']} (ink break ratio {gap['ratio']:.2f})"
            ),
            "provenance": {"geometric": "image_recovery", "semantic": "vlm", "recovery": True},
        }
        recovered.append(entity)
        occupied.setdefault(wall["id"], []).append((gap["t0"], gap["t1"]))

    recovered.sort(key=lambda e: e["candidate_id"])
    return recovered, remaining


# ----------------------------------------------------------------------------
# Stair recovery (Step 8) — coarse region from repeated parallel treads
# ----------------------------------------------------------------------------


def _stair_region_evidence(gray: np.ndarray | None, anchor: Sequence[float]) -> dict[str, Any] | None:
    """Detect repeated parallel tread lines around the semantic stair anchor."""
    if gray is None:
        return None
    h, w = gray.shape
    cx, cy = int(round(anchor[0])), int(round(anchor[1]))
    half = _STAIR_REGION_PX // 2
    x0, x1 = max(0, cx - half), min(w, cx + half)
    y0, y1 = max(0, cy - half), min(h, cy + half)
    if x1 - x0 < 40 or y1 - y0 < 40:
        return None
    region = gray[y0:y1, x0:x1]
    mean = float(region.mean())
    binary = (region < max(1.0, mean * 0.82)).astype(np.uint8)
    try:
        import cv2
    except Exception:
        return None
    lines = cv2.HoughLinesP(
        binary,
        rho=1,
        theta=math.pi / 180,
        threshold=30,
        minLineLength=_STAIR_MIN_LINE_LENGTH,
        maxLineGap=_STAIR_MAX_GAP,
    )
    if lines is None or len(lines) == 0:
        return None
    segs: list[tuple[tuple[float, float], tuple[float, float], float]] = []
    for line in lines:
        arr = np.asarray(line, dtype=np.float64).ravel()
        if arr.shape != (4,):
            continue
        x1_, y1_, x2_, y2_ = arr.tolist()
        ax, ay = x1_ + x0, y1_ + y0
        bx, by = x2_ + x0, y2_ + y0
        if max(abs(bx - ax), abs(by - ay)) < _STAIR_MIN_LINE_LENGTH:
            continue
        length = math.hypot(bx - ax, by - ay)
        segs.append(((ax, ay), (bx, by), length))
    if len(segs) < _STAIR_MIN_PARALLEL_LINES:
        return None
    # Cluster by orientation (treads are near-parallel).
    def angle_deg(seg):
        (ax, ay), (bx, by), _ = seg
        return (math.degrees(math.atan2(by - ay, bx - ax)) + 90.0) % 180.0 - 90.0

    groups: list[list] = []
    for seg in sorted(segs, key=lambda s: angle_deg(s)):
        a = angle_deg(seg)
        placed = False
        for g in groups:
            if abs(a - angle_deg(g[0])) <= 6.0:
                g.append(seg)
                placed = True
                break
        if not placed:
            groups.append([seg])
    best_group = max(groups, key=len)
    if len(best_group) < _STAIR_MIN_PARALLEL_LINES:
        return None
    total_len = float(sum(s[2] for s in best_group))
    orientations = [angle_deg(s) for s in best_group]
    direction = "horizontal" if max(abs(o) for o in orientations) < 30 else "vertical"
    xs = [p[0] for s in best_group for p in (s[0], s[1])]
    ys = [p[1] for s in best_group for p in (s[0], s[1])]
    return {
        "orientation": direction,
        "extent_x": [float(min(xs)), float(max(xs))],
        "extent_y": [float(min(ys)), float(max(ys))],
        "line_count": len(best_group),
        "evidence_level": "high" if len(best_group) >= 5 else "medium",
        "total_length_px": round(total_len, 1),
    }


def _recover_stairs(
    fused: dict[str, Any],
    gray: np.ndarray | None,
    *,
    src_w: int, src_h: int, content_rect: Sequence[int] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    stairs = fused.get("stairs", [])
    if not stairs:
        return [], []
    recovered: list[dict[str, Any]] = []
    upgraded: list[dict[str, Any]] = []
    for i, stair in enumerate(stairs):
        if gray is None:
            entry = {**stair, "recovery_reason": "no_image_evidence"}
            upgraded.append(entry)
            continue
        anchor = stair.get("anchor")
        if not anchor:
            entry = {**stair, "recovery_reason": "no_anchor"}
            upgraded.append(entry)
            continue
        evidence = _stair_region_evidence(gray, anchor)
        if evidence is None:
            entry = {**stair, "recovery_reason": "no_repeated_tread_pattern"}
            upgraded.append(entry)
            continue
        entity: dict[str, Any] = {
            **stair,
            "geometric": True,
            "region": {
                "center": [round((evidence["extent_x"][0] + evidence["extent_x"][1]) / 2, 2),
                           round((evidence["extent_y"][0] + evidence["extent_y"][1]) / 2, 2)],
                "extent_x": [round(v, 2) for v in evidence["extent_x"]],
                "extent_y": [round(v, 2) for v in evidence["extent_y"]],
                "orientation": evidence["orientation"],
            },
            "evidence_level": evidence["evidence_level"],
            "recovered_reason": (
                f"repeated parallel tread pattern ({evidence['line_count']} lines, "
                f"{evidence['orientation']})"
            ),
            "provenance": {"geometric": "image_recovery", "semantic": "vlm", "recovery": True},
        }
        recovered.append(entity)
        upgraded.append(entity)
    return recovered, upgraded


# ----------------------------------------------------------------------------
# Orchestration
# ----------------------------------------------------------------------------


def recover(
    normalized: dict[str, Any],
    fused: dict[str, Any],
    image: Image.Image | bytes | None,
    *,
    src_w: int | None = None,
    src_h: int | None = None,
    content_rect: Sequence[int] | None = None,
) -> dict[str, Any]:
    """Recover missing geometry for unresolved semantic observations.

    Operates only on the *unresolved* entries of the fused document (Phase 6
    output): windows, doors, spaces and the (semantic) stair candidate. Returns
    a new document — the fused document with recovered entities appended,
    `unresolved` updated, counts adjusted and a `recovery` debug section.
    Deterministic for identical inputs.
    """
    out = copy.deepcopy(fused)
    src_w = src_w or int(normalized.get("src_w") or 0)
    src_h = src_h or int(normalized.get("src_h") or 0)
    if not src_w or not src_h:
        raise ValueError("recover() requires src_w/src_h (or a normalized doc with them)")
    cr = content_rect or _derive_plan_bounds(normalized) or [0, 0, src_w, src_h]
    diag = math.hypot(cr[2] if cr[2] else src_w, cr[3] if cr[3] else src_h)
    gray = load_grayscale_float(image)

    unresolved = out.setdefault("unresolved", {})
    unresolved.setdefault("spaces", [])
    unresolved.setdefault("doors", [])
    unresolved.setdefault("windows", [])
    out.setdefault("counts", {})

    # 1) windows
    rec_windows, rem_windows = _recover_windows(
        normalized, out, gray, unresolved.get("windows", []),
        src_w=src_w, src_h=src_h, content_rect=cr, diag=diag,
    )
    # 2) doors
    rec_doors, rem_doors = _recover_doors(
        normalized, out, gray, unresolved.get("doors", []),
        src_w=src_w, src_h=src_h, content_rect=cr, diag=diag,
    )
    # 3) rooms
    rec_rooms, rem_spaces = _recover_rooms(
        normalized, unresolved.get("spaces", []), src_w=src_w, src_h=src_h, content_rect=cr,
    )
    # 4) stairs
    rec_stairs, upgraded_stairs = _recover_stairs(
        out, gray, src_w=src_w, src_h=src_h, content_rect=cr,
    )

    out["windows"] = [*out.get("windows", []), *rec_windows]
    out["doors"] = [*out.get("doors", []), *rec_doors]
    out["rooms"] = [*out.get("rooms", []), *rec_rooms]
    out["stairs"] = upgraded_stairs  # semantic candidates, upgraded in place

    unresolved["windows"] = rem_windows
    unresolved["doors"] = rem_doors
    unresolved["spaces"] = rem_spaces

    counts = out["counts"]
    counts["windows"] = len(out["windows"])
    counts["doors"] = len(out["doors"])
    counts["rooms"] = len(out["rooms"])
    counts["stairs"] = len(out["stairs"])
    counts["recovered_windows"] = len(rec_windows)
    counts["recovered_doors"] = len(rec_doors)
    counts["recovered_rooms"] = len(rec_rooms)
    counts["recovered_stairs"] = len(rec_stairs)
    counts["unresolved_spaces"] = len(rem_spaces)
    counts["unresolved_doors"] = len(rem_doors)
    counts["unresolved_windows"] = len(rem_windows)

    out["recovery"] = {
        "schema": RECOVERY_SCHEMA,
        "counts": {
            "recovered_windows": len(rec_windows),
            "recovered_doors": len(rec_doors),
            "recovered_rooms": len(rec_rooms),
            "recovered_stairs": len(rec_stairs),
            "unresolved_windows": len(rem_windows),
            "unresolved_doors": len(rem_doors),
            "unresolved_spaces": len(rem_spaces),
        },
        "windows": rec_windows,
        "doors": rec_doors,
        "rooms": rec_rooms,
        "stairs": rec_stairs,
        "unresolved": {
            "windows": rem_windows,
            "doors": rem_doors,
            "spaces": rem_spaces,
        },
        "notes": {
            "image_used": gray is not None,
            "wall_count": len(normalized.get("walls", [])),
            "stairs": {"semantic_candidates": len(fused.get("stairs", [])), "recovered": len(rec_stairs)},
        },
    }
    out.setdefault("notes", {})["recovery"] = {
        "recovered": len(rec_windows) + len(rec_doors) + len(rec_rooms) + len(rec_stairs),
        "evidence_required": True,
        "vlm_never_geometry_source": True,
    }
    return out