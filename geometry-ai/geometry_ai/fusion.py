"""Phase 6 — deterministic semantic geometry fusion.

Combines the two validated sources from the previous phases:

    UNet (raw + deterministic normalization)  → geometric evidence
    VLM (validated + normalized semantics)     → semantic evidence
    this module                                → final VistaGeometry

The division of responsibility is strict: the VLM never produces pixel
geometry. It provides *semantic hints* (rooms, labels, types, doors, windows,
stairs, furniture, approximate relative locations) that select, name, and
classify geometry already produced by the deterministic UNet pipeline.
Nothing here fabricates a polygon, an opening, or a coordinate that the
geometric pipeline did not produce.

The module is deterministic and model-free: identical inputs produce
byte-identical outputs, so the evaluation in docs/geometry-ai-evaluation.md
is reproducible from saved VLM responses.

Responsibilities
----------------
* rooms      — semantic spaces are matched to accepted geometric room
               candidates by relative location (containment + anchor
               distance); matched rooms get `name` (the exact visible label)
               and `type` (the controlled VLM enum). Unmatched spaces stay
               unresolved candidates — no fabricated polygons.
* doors      — semantic doors are matched to valid/uncertain UNet door
               candidates via wall side, relative location, and room
               connectivity ("connects" names vs. the rooms bordering the
               candidate's host wall). Unmatched semantic doors stay
               unresolved.
* windows    — same principle: wall side + space + relative location against
               valid/uncertain UNet window candidates.
* stairs     — the UNet has no stair class; a semantic stair becomes an
               anchored region candidate (hosting room + anchor point +
               direction). No tread geometry is invented.
* furniture  — a pure exclusion signal: weak (uncertain/invalid) opening
               candidates whose centroid lies inside a furnished room that the
               VLM reports no openings of that kind for are suppressed.
               Valid geometry is never deleted because furniture is nearby.
* walls      — the interior/exterior classification is verified against the
               room-boundary ring; a wall hosting a matched *exterior* door is
               forced exterior on semantic evidence. No type is forced without
               evidence.
* provenance — every entity keeps `provenance: {geometric, semantic}` and the
               concrete `match_reason` explaining why it was selected.
               Confidence is never fabricated: a fused entity carries the
               UNet confidence it came from, or none.

Output document (schema `vista-geometry-fused-v1`):

    {
      "schema": ...,
      "counts": {walls, rooms, doors, windows, stairs},
      "walls": [...],          # normalized walls + type evidence
      "rooms": [...],          # matched rooms (name, type, provenance)
      "doors": [...],          # matched doors (+ semantic connects/type)
      "windows": [...],
      "stairs": [...],         # semantic/region stair candidates
      "dimensions": [...],     # VLM visual-text dimensions, not converted
      "furniture": [...],      # exclusion evidence
      "unresolved": {spaces, doors, windows},
      "suppressed_openings": [...],
      "debug": {room_matches, door_matches, window_matches, thresholds},
      "notes": {...}
    }
"""

from __future__ import annotations

import math
import re
from typing import Any, Sequence

from .normalize import (
    _point_in_polygon,
    _polygon_area,
    _polygon_centroid,
    _seg_segment_dist,
)
from .vlm_benchmark import normalize as normalize_semantics

FUSED_SCHEMA = "vista-geometry-fused-v1"

# ----------------------------------------------------------------------------
# Relative-location parsing (VLM free text → image-space hints)
# ----------------------------------------------------------------------------
# The VLM emits relative locations as free text ("top-left", "upper centre",
# "left side of the horizontal dividing wall"). This lexicon maps those onto
# deterministic image-fraction anchors + wall-side hints. Unknown words are
# ignored; nothing is ever guessed when no token matches.

_X_HINTS = {
    "left": 0.25,
    "west": 0.25,
    "right": 0.75,
    "east": 0.75,
    "centre": 0.5,
    "center": 0.5,
    "middle": 0.5,
    "central": 0.5,
}
_Y_HINTS = {
    "top": 0.25,
    "upper": 0.25,
    "north": 0.25,
    "bottom": 0.75,
    "lower": 0.75,
    "south": 0.75,
    "centre": 0.5,
    "center": 0.5,
    "middle": 0.5,
    "central": 0.5,
}
# "upper-left of centre" softens the corner to a 0.35 offset.
_OF_CENTRE_RE = re.compile(r"\bof\s+centre\b|\bof\s+center\b")

_WALL_SIDE_RE = re.compile(
    r"\b(left|right|north|south|east|west|top|bottom|upper|lower|outer)\s+wall\b"
)
# "south side of Heizung" → side + the room the wall belongs to.
_ROOM_SIDE_RE = re.compile(
    r"\b(north|south|east|west|top|bottom|upper|lower)\s+side\s+of\s+([a-zäöüß0-9][a-zäöüß0-9 /-]*)"
)
_WALL_SIDE_ALIASES = {
    "top": "north",
    "upper": "north",
    "bottom": "south",
    "lower": "south",
    "outer": "east",
    "right": "east",
    "left": "west",
}

_WORD_RE = re.compile(r"[a-zäöüß]+")


def _hints(text: str) -> tuple[float | None, float | None]:
    """(x_hint, y_hint) fractions from compass words, or None when absent.

    Compound forms resolve deterministically:
        * "centre-right" / "centre-left" / "top-centre" / "left-middle" —
          the non-centre directional word wins on its axis, so "left-middle"
          means left × middle-height (not centre-left);
        * "upper-left of centre" — the "of centre" phrase pulls the anchor
          toward the centre (0.35 instead of 0.25);
        * a bare "centre" (or no hint) means 0.5.
    """
    if not text:
        return None, None
    low = text.lower()
    words = _WORD_RE.findall(low)
    soft = bool(_OF_CENTRE_RE.search(low))

    def combine(hints: list[tuple[str, float]]) -> float | None:
        if not hints:
            return None
        non_center = [(w, v) for w, v in hints if v != 0.5]
        if not non_center:
            return 0.5
        if soft:
            v = non_center[-1][1]
            return round(v + 0.1 if v < 0.5 else v - 0.1, 4)
        return non_center[-1][1]

    xs = [(w, v) for w, v in _X_HINTS.items() if w in words]
    ys = [(w, v) for w, v in _Y_HINTS.items() if w in words]
    return combine(xs), combine(ys)


def parse_relative_location(
    text: str | None,
    *,
    src_w: int,
    src_h: int,
    content_rect: Sequence[int] | None = None,
) -> dict[str, Any]:
    """Turn VLM relative-location text into an image-space anchor + wall hints.

    The VLM describes the plan *as drawn*; the fractions are therefore mapped
    onto the plan's content region (content_rect), not the full image — this
    is what keeps letterboxed real scans aligned.

    Returns:
        x, y            anchor point in source pixels
        wall_side       "north"|"south"|"east"|"west"|None — only when the
                        text designates a specific wall ("right wall", ...)
        horizontal, vertical
                        explicit dividing-wall orientation hints
        along_fraction  position along the designated wall (0..1) from
                        left/right/upper/lower words, when a wall side exists
    """
    low = (text or "").lower()
    x_hint, y_hint = _hints(text)
    x = x_hint if x_hint is not None else 0.5
    y = y_hint if y_hint is not None else 0.5
    # A pure corner phrase ("top-left") is tighter than the generic 0.25
    # quadrant point — nudge it to 0.2 so narrow corner rooms (e.g. the Öl
    # strip of the authored basement plan) are not pushed past their wall.
    corner_words = {"top", "bottom", "left", "right", "upper", "lower", "corner"}
    low_words = set(_WORD_RE.findall(low))
    if (
        x in (0.25, 0.75)
        and y in (0.25, 0.75)
        and not ({"centre", "center", "central", "middle", "side"} & low_words)
        and low_words & corner_words
    ):
        x = 0.2 if x == 0.25 else 0.8
        y = 0.2 if y == 0.25 else 0.8

    if content_rect:
        left, top, inner_w, inner_h = content_rect
    else:
        left, top, inner_w, inner_h = 0, 0, src_w, src_h
    if not inner_w or not inner_h:
        left, top, inner_w, inner_h = 0, 0, src_w, src_h

    wall_side: str | None = None
    m = _WALL_SIDE_RE.search(low)
    if m:
        side = m.group(1)
        wall_side = _WALL_SIDE_ALIASES.get(side, side)
    room_side: tuple[str, str] | None = None
    m = _ROOM_SIDE_RE.search(low)
    if m:
        side = m.group(1)
        room_side = (_WALL_SIDE_ALIASES.get(side, side), m.group(2).strip())
    horizontal = bool(re.search(r"\bhorizontal\b", low)) and not re.search(r"\bvertical\b", low)
    vertical = bool(re.search(r"\bvertical\b", low))
    interior = bool(re.search(r"\binterior\b|\bpartition\b|\bdividing\b", low))

    along: float | None = None
    if wall_side:
        words = set(_WORD_RE.findall(low))
        if {"right", "east"} & words:
            along = 0.8
        elif {"left", "west"} & words:
            along = 0.2
        elif {"centre", "center", "central", "middle"} & words:
            along = 0.5
        elif {"upper", "top", "north"} & words:
            along = 0.2
        elif {"lower", "bottom", "south"} & words:
            along = 0.8

    return {
        "x": round(left + x * inner_w, 2),
        "y": round(top + y * inner_h, 2),
        "x_fraction": round(x, 4),
        "y_fraction": round(y, 4),
        "wall_side": wall_side,
        "room_side": room_side,
        "horizontal": horizontal,
        "vertical": vertical,
        "interior_partition": interior,
        "along_fraction": along,
    }


def _classify_wall_side(
    wall: dict[str, Any],
    src_w: int,
    src_h: int,
    content_rect: Sequence[int] | None = None,
) -> str:
    """Compass side of a normalized wall (north/south/east/west)."""
    dx = wall["end"][0] - wall["start"][0]
    dy = wall["end"][1] - wall["start"][1]
    mx = (wall["start"][0] + wall["end"][0]) / 2
    my = (wall["start"][1] + wall["end"][1]) / 2
    if content_rect:
        _left, top, _w, h = content_rect
        mid_x = _left + _w / 2
        mid_y = top + h / 2
    else:
        mid_x, mid_y = src_w / 2, src_h / 2
    if abs(dx) >= abs(dy):
        return "north" if my < mid_y else "south"
    return "west" if mx < mid_x else "east"


def _point_on_wall(wall: dict[str, Any], position: float) -> tuple[float, float]:
    return (
        wall["start"][0] + (wall["end"][0] - wall["start"][0]) * position,
        wall["start"][1] + (wall["end"][1] - wall["start"][1]) * position,
    )


def _wall_orientation(wall: dict[str, Any]) -> str:
    dx = abs(wall["end"][0] - wall["start"][0])
    dy = abs(wall["end"][1] - wall["start"][1])
    return "horizontal" if dx >= dy else "vertical"


# ----------------------------------------------------------------------------
# Room matching (Step 3–5)
# ----------------------------------------------------------------------------


def _room_contains(room: dict[str, Any], point: Sequence[float]) -> bool:
    return _point_in_polygon(point, room.get("polygon"))


def _anchor_distance(room: dict[str, Any], point: Sequence[float]) -> float:
    """Distance from the semantic anchor to the room polygon (0 when inside)."""
    poly = room.get("polygon") or []
    if _point_in_polygon(point, poly):
        return 0.0
    best = float("inf")
    for i in range(len(poly)):
        d, _t = _seg_segment_dist(point, poly[i], poly[(i + 1) % len(poly)])
        best = min(best, d)
    return best


def _match_rooms(
    rooms: list[dict[str, Any]],
    spaces: list[dict[str, Any]],
    *,
    src_w: int,
    src_h: int,
    diag: float,
    content_rect: Sequence[int] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Match semantic spaces to accepted geometric room candidates.

    Scoring is conservative and deterministic:
        * a candidate that *contains* the semantic anchor wins over one that
          merely is near it (containment is the strongest signal);
        * among containment ties, the anchor-to-polygon distance decides;
        * each candidate is claimed by at most one space (greedy by best
          score), so two spaces claiming one merged region are resolved
          honestly: the first claim wins, the second becomes unresolved.

    Returns (matched_rooms, unresolved_spaces, match_debug).
    """
    spaces = [dict(s) for s in spaces]
    for i, s in enumerate(spaces):
        s["_index"] = i
        s["_anchor"] = parse_relative_location(
            s.get("relative_location"),
            src_w=src_w,
            src_h=src_h,
            content_rect=content_rect,
        )

    claimed: set[int] = set()
    matched_space_indices: set[int] = set()
    matched: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    debug: list[dict[str, Any]] = []

    candidates_by_index = {i: room for i, room in enumerate(rooms)}
    # Stable evaluation order: labeled spaces first, then VLM output order.
    order = sorted(
        range(len(spaces)),
        key=lambda i: (0 if spaces[i].get("label") else 1, i),
    )

    for i in order:
        s = spaces[i]
        anchor = (s["_anchor"]["x"], s["_anchor"]["y"])
        scores: list[tuple[float, int]] = []
        for ci, room in candidates_by_index.items():
            if ci in claimed:
                continue
            contained = _room_contains(room, anchor)
            dist = _anchor_distance(room, anchor)
            # Containment dominates: contained candidates score >= 1.5, a
            # merely adjacent candidate can never exceed 0.5, so the
            # threshold cleanly separates "this region is this room" from
            # "this region is near that room".
            score = (1.5 if contained else 0.0) + 0.5 / (1.0 + dist / diag)
            scores.append((score, ci))
        if not scores:
            # Every candidate is claimed; report whether any of them
            # actually contains this semantic region.
            holder = None
            for other_i, other in candidates_by_index.items():
                if other_i in claimed and _room_contains(other, anchor):
                    holder = matched_room_name(matched, other_i)
                    break
            unresolved.append(
                _unresolved_space(
                    s,
                    f"region_shared_with_space:{holder}"
                    if holder
                    else "no_geometric_room_candidate",
                )
            )
            continue
        score, ci = max(scores, key=lambda t: (t[0], -t[1]))
        room = candidates_by_index[ci]
        contained = _room_contains(room, anchor)
        dist = _anchor_distance(room, anchor)
        if not contained:
            # The only way a non-contained candidate can win is when every
            # containing candidate is already claimed — diagnose that instead
            # of matching geometry that does not contain the semantic region.
            holder = None
            for other_i, other in candidates_by_index.items():
                if other_i in claimed and _room_contains(other, anchor):
                    holder = matched_room_name(matched, other_i)
            if holder:
                unresolved.append(
                    _unresolved_space(
                        s, f"region_shared_with_space:{holder}"
                    )
                )
            else:
                unresolved.append(
                    _unresolved_space(
                        s, f"no_sufficient_geometric_evidence score={score:.2f}"
                    )
                )
            continue
        claimed.add(ci)
        matched_space_indices.add(i)
        label = s.get("label")
        matched.append(
            {
                "id": room["id"],
                "polygon": room["polygon"],
                "area_px": room.get("area_px"),
                "wall_ids": room.get("wall_ids", []),
                "confidence": room.get("confidence"),
                "derived": True,
                "candidate_id": room.get("candidate_id"),
                "name": label,
                "label": label,
                "type": s.get("type", "unknown"),
                "enclosed": s.get("enclosed"),
                "usable": s.get("usable"),
                "relative_location": s.get("relative_location"),
                "space_index": i,
                "claimed_room_index": ci,
                "provenance": {"geometric": "unet", "semantic": "vlm"},
                "match_reason": (
                    f"semantic region '{s.get('relative_location')}' "
                    f"matches room {room['id']} "
                    f"(contained=True, anchor_distance_px={round(dist, 1)})"
                ),
            }
        )
        debug.append(
            {
                "space_index": i,
                "space_label": label,
                "space_type": s.get("type"),
                "space_relative_location": s.get("relative_location"),
                "anchor": [anchor[0], anchor[1]],
                "candidate_id": room["id"],
                "score": round(score, 4),
                "contained": True,
                "anchor_distance_px": round(dist, 1),
                "reason": "matched",
            }
        )

    for i, s in enumerate(spaces):
        if i in matched_space_indices or any(u["space_index"] == i for u in unresolved):
            continue
        unresolved.append(_unresolved_space(s, "candidate_claimed_by_other_space"))

    return matched, unresolved, debug


def matched_room_name(matched: list[dict[str, Any]], room_index: int) -> str | None:
    """Name of the matched room that claimed a given room-candidate index."""
    for m in matched:
        if m.get("claimed_room_index") == room_index:
            return m.get("name") or m["id"]
    return None


def _unresolved_space(space: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "space_index": space.get("_index", 0),
        "label": space.get("label"),
        "type": space.get("type"),
        "enclosed": space.get("enclosed"),
        "usable": space.get("usable"),
        "relative_location": space.get("relative_location"),
        "reason": reason,
    }


# ----------------------------------------------------------------------------
# Door / window matching (Step 6–7)
# ----------------------------------------------------------------------------
# Semantic openings are matched to *geometric candidates only* — the valid and
# uncertain UNet candidates preserved by the normalization layer. A semantic
# opening without a geometric candidate stays unresolved: no opening geometry
# is ever fabricated.


def _rooms_bordering_wall(
    rooms: list[dict[str, Any]], wall_id: str
) -> list[dict[str, Any]]:
    return [r for r in rooms if wall_id in (r.get("wall_ids") or [])]


_CONNECTS_SPLIT_RE = re.compile(r"\band\b|,|&|↔|\+|\bto\b|\bvs\.?\b|/", re.IGNORECASE)


def _name_segments(text: str | None) -> list[str]:
    """Split a "connects" field into room-name segments.

    "Heizung and Hobbyraum" → ["Heizung", "Hobbyraum"]. Segments, not bare
    word tokens, are matched against room names so "Kind I" does not match
    "Kind II / Arbeiten" through their shared "Kind" token.
    """
    if not text:
        return []
    segments = []
    for part in _CONNECTS_SPLIT_RE.split(text):
        seg = part.strip().lower()
        if len(seg) >= 2:
            segments.append(seg)
    return segments


def _names_match(a: str | None, b: str | None) -> bool:
    """Does a room-name reference match a room label (case-insensitive)?"""
    if not a or not b:
        return False
    ta = a.strip().lower()
    tb = b.strip().lower()
    if ta == tb:
        return True
    # Word-boundary substring: "kind i" must not match "kind ii / arbeiten"
    # (only complete word sequences do).
    def contains(needle: str, hay: str) -> bool:
        return (
            re.search(rf"(?<![a-zäöüß0-9]){re.escape(needle)}(?![a-zäöüß0-9])", hay)
            is not None
        )

    return contains(ta, tb) or contains(tb, ta)


def _connectivity_score(
    connects: str | None,
    rooms: list[dict[str, Any]],
    debug_parts: list[str],
) -> float:
    """How well the candidate's bordering rooms explain the semantic connects."""
    if not connects:
        return 0.0
    segments = _name_segments(connects)
    if not segments:
        return 0.0
    side_names = [r.get("name") for r in rooms]
    matched = 0
    for seg in segments:
        if any(_names_match(seg, n) for n in side_names):
            matched += 1
    if matched >= 2:
        debug_parts.append("connectivity:both_rooms_match")
        return 1.0
    if matched == 1:
        debug_parts.append("connectivity:one_room_matches")
        return 0.5
    debug_parts.append("connectivity:no_room_matches")
    return 0.0


def _room_side_wall_match(
    wall: dict[str, Any],
    rooms: list[dict[str, Any]],
    hint: dict[str, Any],
) -> tuple[float, str | None, dict[str, Any] | None]:
    """Score a candidate wall against a "south side of <room>" hint.

    The wall must (a) border the named matched room and (b) lie on the side
    of that room's centroid the hint names. Returns (score, debug_token,
    resolved_room). The resolved room is used to re-anchor the semantic
    entry at the room's centroid — much more precise than the plan-wide
    compass fraction.
    """
    room_side = hint.get("room_side")
    if not room_side:
        return 0.5, None, None
    side, room_name = room_side
    for room in rooms:
        if not _names_match(room.get("name"), room_name):
            continue
        wall_ids = room.get("wall_ids") or []
        if wall["id"] not in wall_ids:
            return 0.0, f"room_side:{side}:wall_not_bordering", room
        centroid = _polygon_centroid(room.get("polygon") or [])
        mid = (
            (wall["start"][0] + wall["end"][0]) / 2,
            (wall["start"][1] + wall["end"][1]) / 2,
        )
        orient = _wall_orientation(wall)
        if side in ("north", "south"):
            ok = orient == "horizontal" and (
                (side == "north" and mid[1] < centroid[1])
                or (side == "south" and mid[1] > centroid[1])
            )
        else:
            ok = orient == "vertical" and (
                (side == "west" and mid[0] < centroid[0])
                or (side == "east" and mid[0] > centroid[0])
            )
        return (1.0, f"room_side:{side}:{room_name}", room) if ok else (0.0, f"room_side:{side}:wrong_side", room)
    return 0.5, None, None  # named room unresolved → no side evidence


def _match_openings(
    kind: str,
    candidates: list[dict[str, Any]],
    semantic_openings: list[dict[str, Any]],
    rooms: list[dict[str, Any]],
    walls_by_id: dict[str, dict[str, Any]],
    *,
    src_w: int,
    src_h: int,
    diag: float,
    threshold: float,
    content_rect: Sequence[int] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Pair-lock greedy assignment of semantic openings to UNet candidates.

    Every (semantic entry, candidate) pair is scored; the globally best pair
    is locked first, then the next, so a strong semantic observation cannot
    be displaced by an earlier weaker one (this is what keeps e.g. the
    "Heizung ↔ Hobbyraum" door from stealing the "Hobbyraum ↔ Flur" door's
    candidate on the authored basement plan).
    """
    cand_records: list[dict[str, Any]] = []
    for c in candidates:
        if c.get("status") not in ("valid", "uncertain"):
            continue
        wi = c.get("nearest_wall_index")
        wall = None
        if wi is not None and kind == "door":
            wall = walls_by_id.get(f"n-wall-{wi}")
        elif kind == "window":
            wall = walls_by_id.get(c.get("nearest_wall_id") or "")
        if wall is None:
            continue
        cand_records.append({"candidate": c, "wall": wall})

    entries = [dict(s) for s in semantic_openings]
    for i, e in enumerate(entries):
        e["_index"] = i
        e["_anchor"] = parse_relative_location(
            e.get("relative_location"),
            src_w=src_w,
            src_h=src_h,
            content_rect=content_rect,
        )
        # Windows carry an explicit wall field ("north wall", "west wall") —
        # merge its side hints into the anchor even when a relative location
        # also exists (the wall field is the stronger signal).
        if e.get("wall") and e["_anchor"].get("wall_side") is None:
            wall_hint = parse_relative_location(
                e["wall"], src_w=src_w, src_h=src_h, content_rect=content_rect
            )
            if wall_hint.get("wall_side"):
                e["_anchor"] = {**e["_anchor"], "wall_side": wall_hint["wall_side"]}

    pairs: list[tuple[float, int, int, dict[str, Any]]] = []
    for si, e in enumerate(entries):
        for ci, rec in enumerate(cand_records):
            pair_debug: list[str] = []
            score = 0.0
            wall = rec["wall"]
            hint = e["_anchor"]

            # 1. wall side / orientation evidence
            side = _classify_wall_side(wall, src_w, src_h, content_rect)
            orient = _wall_orientation(wall)
            side_score = 0.5
            side_room: dict[str, Any] | None = None
            if hint["room_side"]:
                side_score, side_token, side_room = _room_side_wall_match(wall, rooms, hint)
                pair_debug.append(side_token or f"room_side:{hint['room_side'][0]}:unresolved")
            elif hint["interior_partition"]:
                side_score = 1.0 if wall.get("type") == "interior" else 0.0
                pair_debug.append(f"partition:{wall.get('type')}")
            elif hint["wall_side"]:
                side_score = 1.0 if side == hint["wall_side"] else 0.0
                pair_debug.append(f"wall_side:{side}vs{hint['wall_side']}")
            elif hint["horizontal"] and orient == "horizontal":
                side_score = 1.0
                pair_debug.append("orientation:horizontal")
            elif hint["vertical"] and orient == "vertical":
                side_score = 1.0
                pair_debug.append("orientation:vertical")
            else:
                pair_debug.append("wall_side:neutral")
            score += 0.30 * side_score

            # 2. relative location: anchor vs candidate point on its wall.
            position = rec["candidate"].get("position")
            if position is None and rec["candidate"].get("polygon"):
                cx, cy = _polygon_centroid(rec["candidate"]["polygon"])
                ux = wall["end"][0] - wall["start"][0]
                uy = wall["end"][1] - wall["start"][1]
                ln = math.hypot(ux, uy)
                if ln > 1e-6:
                    position = min(
                        1.0, max(0.0, ((cx - wall["start"][0]) * ux + (cy - wall["start"][1]) * uy) / (ln * ln))
                    )
            # A resolved room-side hint re-anchors at the room's centroid —
            # far more precise than the plan-wide compass fraction.
            if side_room is not None:
                centroid = _polygon_centroid(side_room["polygon"])
                hint = {**hint, "x": centroid[0], "y": centroid[1]}
            cand_point = _point_on_wall(wall, position or 0.0)
            d = math.hypot(hint["x"] - cand_point[0], hint["y"] - cand_point[1])
            loc_score = 1.0 - min(1.0, d / diag)
            pair_debug.append(f"anchor_distance_px:{round(d, 1)}")
            score += 0.25 * loc_score

            # 3. along-wall position when the semantic text names a wall
            along = hint.get("along_fraction")
            if along is not None and position is not None:
                pos_score = 1.0 - abs(along - position)
                pair_debug.append(f"along:{round(along, 2)}vs{round(position, 3)}")
                score += 0.10 * pos_score
            else:
                score += 0.05
                pair_debug.append("along:neutral")

            # 4. room connectivity from the semantic "connects" field (doors)
            #    or the "space" field (windows): does the candidate's wall
            #    border the matched rooms the VLM named?
            conn = _connectivity_score(
                e.get("connects"),
                _rooms_bordering_wall(rooms, wall["id"]),
                pair_debug,
            )
            if kind == "window" and conn < 1.0:
                space = e.get("space")
                if space:
                    for r in _rooms_bordering_wall(rooms, wall["id"]):
                        if _names_match(space, r.get("name")):
                            conn = max(conn, 0.5)
                            pair_debug.append("space:room_matches")
                            break
                    if conn == 0.0:
                        pair_debug.append("space:no_room_matches")
            score += 0.35 * conn

            pairs.append((score, si, ci, {"debug": pair_debug, "wall_id": wall["id"]}))

    pairs.sort(key=lambda t: (-t[0], t[1], t[2]))
    locked_cands: set[int] = set()
    locked_entries: set[int] = set()
    matched: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    debug: list[dict[str, Any]] = []
    for score, si, ci, info in pairs:
        if si in locked_entries or ci in locked_cands:
            continue
        if score < threshold:
            continue
        e = entries[si]
        rec = cand_records[ci]
        locked_entries.add(si)
        locked_cands.add(ci)
        c = rec["candidate"]
        entity: dict[str, Any] = {
            "candidate_id": c["id"],
            "wall_id": rec["wall"]["id"],
            "position": c.get("position") or round(_opening_position(c, rec["wall"]), 4),
            "width": round(c.get("extent_along_px") or 0.0, 2),
            "confidence": c.get("confidence"),
            "corrected": False,
            "semantic_index": si,
            "provenance": {"geometric": "unet", "semantic": "vlm"},
            "match_reason": (
                f"semantic {kind} at '{e.get('relative_location') or e.get('wall')}' "
                f"matches candidate {c['id']} on wall {rec['wall']['id']} "
                f"(score={round(score, 2)})"
            ),
            "score": round(score, 3),
        }
        if kind == "door":
            entity["semantic_type"] = e.get("type", "unknown")
            entity["connects"] = e.get("connects")
        if kind == "window":
            entity["space"] = e.get("space")
            entity["wall"] = e.get("wall")
        matched.append(entity)
        debug.append(
            {
                "semantic_index": si,
                "kind": kind,
                "connects": e.get("connects"),
                "space": e.get("space"),
                "wall": e.get("wall"),
                "relative_location": e.get("relative_location"),
                "candidate_id": c["id"],
                "wall_id": rec["wall"]["id"],
                "score": round(score, 3),
                "factors": info["debug"],
                "reason": "matched",
            }
        )

    for si, e in enumerate(entries):
        if si in locked_entries:
            continue
        unresolved.append(
            {
                "semantic_index": si,
                "kind": kind,
                "connects": e.get("connects"),
                "space": e.get("space"),
                "wall": e.get("wall"),
                "relative_location": e.get("relative_location"),
                "count": e.get("count"),
                "reason": "no_geometric_candidate",
            }
        )
    return matched, unresolved, debug


def _opening_position(candidate: dict[str, Any], wall: dict[str, Any]) -> float:
    poly = candidate.get("polygon") or []
    if not poly:
        return 0.0
    cx, cy = _polygon_centroid(poly)
    ux = wall["end"][0] - wall["start"][0]
    uy = wall["end"][1] - wall["start"][1]
    ln = math.hypot(ux, uy)
    if ln < 1e-6:
        return 0.0
    return min(1.0, max(0.0, ((cx - wall["start"][0]) * ux + (cy - wall["start"][1]) * uy) / (ln * ln)))


# ----------------------------------------------------------------------------
# Stairs (Step 8)
# ----------------------------------------------------------------------------


def _match_stairs(
    stairs: dict[str, Any],
    rooms: list[dict[str, Any]],
    *,
    src_w: int,
    src_h: int,
    content_rect: Sequence[int] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Semantic stair → anchored region candidate (no fabricated geometry)."""
    if not stairs or not stairs.get("present"):
        return [], None
    hint = parse_relative_location(
        stairs.get("relative_location"),
        src_w=src_w,
        src_h=src_h,
        content_rect=content_rect,
    )
    anchor = (hint["x"], hint["y"])
    host = None
    for room in rooms:
        if _room_contains(room, anchor):
            host = room
            break
    stair = {
        "anchor": [anchor[0], anchor[1]],
        "direction": stairs.get("direction"),
        "relative_location": stairs.get("relative_location"),
        "confidence": None,
        "geometric": False,
        "provenance": {"geometric": None, "semantic": "vlm"},
    }
    if host:
        stair["region_id"] = host["id"]
        stair["region_label"] = host.get("name")
    return [stair], hint


# ----------------------------------------------------------------------------
# Furniture exclusion (Step 9)
# ----------------------------------------------------------------------------
# Furniture is a *suppression signal*: a weak (uncertain/invalid) UNet opening
# candidate inside a room that the VLM reports furniture in — and reports no
# openings of that kind in — is a strong furniture-as-opening false positive
# (the known UNet failure). Suppressed candidates stay in the debug output
# with their reason; valid geometry is never touched.


def _furniture_by_space(furniture: Sequence[dict[str, Any]]) -> dict[str, list[str]]:
    by_space: dict[str, list[str]] = {}
    for f in furniture:
        space = f.get("space")
        if space:
            by_space.setdefault(space, []).append(f.get("item") or "unknown")
    return by_space


def _room_matches_space(room: dict[str, Any], space_name: str) -> bool:
    return _names_match(room.get("name"), space_name)


def _semantic_openings_in_space(
    semantic_openings: Sequence[dict[str, Any]], space_name: str
) -> bool:
    for o in semantic_openings:
        if _names_match(o.get("space"), space_name):
            return True
        if _names_match(o.get("connects"), space_name):
            return True
    return False


def _apply_furniture_exclusion(
    kind: str,
    candidates: list[dict[str, Any]],
    semantic_openings: list[dict[str, Any]],
    rooms: list[dict[str, Any]],
    furniture: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_space = _furniture_by_space(furniture)
    unattributed = any(not f.get("space") for f in furniture)
    no_semantic_openings_of_kind = not semantic_openings
    if not by_space and not unattributed:
        return []
    suppressed: list[dict[str, Any]] = []
    for c in candidates:
        if c.get("status") not in ("uncertain", "invalid"):
            continue
        if c.get("kind") != kind:
            continue
        # The candidate's room: containment of its centroid, or any matched
        # room bordering the candidate's host wall (an opening sits ON its
        # wall, at the room boundary).
        containing: list[dict[str, Any]] = []
        centroid = _polygon_centroid(c.get("polygon") or [])
        for room in rooms:
            if _room_contains(room, centroid):
                containing.append(room)
        if not containing and c.get("nearest_wall_id"):
            containing = [
                r
                for r in rooms
                if c["nearest_wall_id"] in (r.get("wall_ids") or [])
            ]
        if not containing:
            continue
        for room in containing:
            if by_space:
                for space_name, items in by_space.items():
                    if not _room_matches_space(room, space_name):
                        continue
                    if _semantic_openings_in_space(semantic_openings, space_name):
                        continue
                    c["status"] = "suppressed_by_furniture"
                    c["reasons"] = [
                        *(c.get("reasons") or []),
                        f"furniture_in_space:{space_name}",
                    ]
                    suppressed.append(
                        {
                            "candidate_id": c["id"],
                            "kind": kind,
                            "space": space_name,
                            "items": items[:5],
                            "reason": "furniture_as_opening",
                        }
                    )
                    break
                if c.get("status") == "suppressed_by_furniture":
                    break
            elif unattributed and no_semantic_openings_of_kind:
                # Furniture without a space attribution (unlabeled plans):
                # a weak opening inside a room while the VLM reports no
                # openings of this kind anywhere is still furniture-grade
                # evidence — suppress conservatively.
                c["status"] = "suppressed_by_furniture"
                c["reasons"] = [
                    *(c.get("reasons") or []),
                    "furniture_present_unattributed",
                ]
                suppressed.append(
                    {
                        "candidate_id": c["id"],
                        "kind": kind,
                        "space": None,
                        "items": [f.get("item") for f in furniture if f.get("item")][:5],
                        "reason": "furniture_as_opening",
                    }
                )
                break
    return suppressed


# ----------------------------------------------------------------------------
# Wall classification (Step 10)
# ----------------------------------------------------------------------------
# The UNet mask heuristic already classifies walls well on the fixtures. The
# fusion layer *verifies* that classification against the room-boundary ring
# and adds explicit semantic evidence: a wall hosting a matched exterior door
# is forced exterior. A wall whose classification cannot be verified keeps its
# heuristic type (evidence, not invention); nothing is forced without reason.


def _room_boundary_check(
    walls: list[dict[str, Any]], rooms: list[dict[str, Any]]
) -> dict[str, str]:
    """Verify each wall's type against the room polygons.

    A wall whose perpendicular neighbourhood reaches outside every room on
    exactly one side is on the building boundary (exterior). Both sides inside
    rooms → interior. Both sides outside → outside the shell entirely (only
    possible for stray geometry; stays `unknown`).
    """
    verdicts: dict[str, str] = {}
    for w in walls:
        ux, uy = w["end"][0] - w["start"][0], w["end"][1] - w["start"][1]
        ln = math.hypot(ux, uy)
        if ln < 1e-6:
            continue
        ux, uy = ux / ln, uy / ln
        mx = (w["start"][0] + w["end"][0]) / 2
        my = (w["start"][1] + w["end"][1]) / 2
        off = w.get("thickness", 8) / 2 + 2.0
        sides = []
        for sign in (1.0, -1.0):
            px, py = mx + sign * -uy * off, my + sign * ux * off
            inside = any(_point_in_polygon((px, py), r.get("polygon")) for r in rooms)
            sides.append(inside)
        if sides[0] and sides[1]:
            verdicts[w["id"]] = "interior"
        elif not sides[0] and not sides[1]:
            verdicts[w["id"]] = "unknown"
        else:
            verdicts[w["id"]] = "exterior"
    return verdicts


# ----------------------------------------------------------------------------
# Orchestration
# ----------------------------------------------------------------------------


def _seed_semantic_document(semantic: dict[str, Any]) -> dict[str, Any]:
    """Accept either a raw VLM payload or an already-normalized semantic
    document; always normalize through the Phase 5 gate so the fusion layer
    consumes exactly the validated schema."""
    if "schema" in semantic and semantic.get("schema", "").startswith("vista-geometry-semantic"):
        return semantic
    return normalize_semantics(semantic)


def _derive_plan_bounds(normalized: dict[str, Any]) -> list[float] | None:
    """Bounding box of the actual drawing in source pixels.

    The VLM describes relative locations *of the plan as drawn*, so anchors
    are computed against the drawing's own extent — derived from the wall
    centerlines (and room polygons) the UNet produced — not against the full
    image (which may contain margins/letterbox padding) and not against the
    mask-space letterbox content rect.
    """
    pts: list[Sequence[float]] = []
    for w in normalized.get("walls", []):
        pts.append(w["start"])
        pts.append(w["end"])
    for r in normalized.get("rooms", []):
        pts.extend(r.get("polygon", []))
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)]


def fuse(
    normalized: dict[str, Any],
    semantic: dict[str, Any],
    *,
    src_w: int | None = None,
    src_h: int | None = None,
    content_rect: Sequence[int] | None = None,
    door_threshold: float = 0.55,
    window_threshold: float = 0.55,
) -> dict[str, Any]:
    """Fuse normalized UNet geometry with the validated VLM semantic document.

    Returns the `vista-geometry-fused-v1` document. `normalized` must be a
    Phase 3/4 normalized document; `semantic` is the Phase 5 normalized VLM
    reading (or the raw payload, which is normalized here through the same
    gate). Deterministic: identical inputs ⇒ identical output.
    """
    src_w = src_w or int(normalized.get("src_w") or 0)
    src_h = src_h or int(normalized.get("src_h") or 0)
    if not src_w or not src_h:
        raise ValueError("fuse() requires src_w/src_h (or a normalized doc with them)")
    # `content_rect` here is the *plan bounds in source pixels*; when not
    # provided it is derived from the drawing itself (wall/room extents).
    cr = content_rect or _derive_plan_bounds(normalized) or [0, 0, src_w, src_h]
    _cl, _ct, cr_w, cr_h = cr
    if not cr_w or not cr_h:
        cr = [0, 0, src_w, src_h]
        cr_w, cr_h = src_w, src_h
    diag = math.hypot(cr_w, cr_h)

    sem = _seed_semantic_document(semantic)

    walls = [dict(w) for w in normalized["walls"]]
    walls_by_id = {w["id"]: w for w in walls}
    norm_rooms = [dict(r) for r in normalized["rooms"]]
    door_candidates = list(normalized.get("candidates", {}).get("openings", {}).get("door", []))
    window_candidates = list(normalized.get("candidates", {}).get("openings", {}).get("window", []))

    # --- rooms --------------------------------------------------------------
    matched_rooms, unresolved_spaces, room_debug = _match_rooms(
        norm_rooms,
        sem.get("spaces", []),
        src_w=src_w,
        src_h=src_h,
        diag=diag,
        content_rect=cr,
    )

    # --- doors / windows ----------------------------------------------------
    matched_doors, unresolved_doors, door_debug = _match_openings(
        "door",
        door_candidates,
        sem.get("doors", []),
        matched_rooms,
        walls_by_id,
        src_w=src_w,
        src_h=src_h,
        diag=diag,
        threshold=door_threshold,
        content_rect=cr,
    )
    matched_windows, unresolved_windows, window_debug = _match_openings(
        "window",
        window_candidates,
        sem.get("windows", []),
        matched_rooms,
        walls_by_id,
        src_w=src_w,
        src_h=src_h,
        diag=diag,
        threshold=window_threshold,
        content_rect=cr,
    )
    # Valid UNet openings that no semantic observation claimed are *kept* —
    # fusion must never destroy geometry the deterministic pipeline accepted;
    # they are simply marked as geometric-only.
    matched_door_ids = {d["candidate_id"] for d in matched_doors}
    matched_window_ids = {d["candidate_id"] for d in matched_windows}
    for c in door_candidates:
        if c.get("status") == "valid" and c["id"] not in matched_door_ids:
            wi = c.get("nearest_wall_index")
            wall = walls_by_id.get(f"n-wall-{wi}") if wi is not None else None
            if wall:
                matched_doors.append(
                    {
                        "candidate_id": c["id"],
                        "wall_id": wall["id"],
                        "position": c.get("position") or round(_opening_position(c, wall), 4),
                        "width": round(c.get("extent_along_px") or 0.0, 2),
                        "confidence": c.get("confidence"),
                        "corrected": False,
                        "semantic_match": False,
                        "provenance": {"geometric": "unet", "semantic": None},
                    }
                )
    for c in window_candidates:
        if c.get("status") == "valid" and c["id"] not in matched_window_ids:
            wall = walls_by_id.get(c.get("nearest_wall_id") or "")
            if wall:
                matched_windows.append(
                    {
                        "candidate_id": c["id"],
                        "wall_id": wall["id"],
                        "position": c.get("position") or round(_opening_position(c, wall), 4),
                        "width": round(c.get("extent_along_px") or 0.0, 2),
                        "confidence": c.get("confidence"),
                        "corrected": False,
                        "semantic_match": False,
                        "provenance": {"geometric": "unet", "semantic": None},
                    }
                )

    # --- stairs -------------------------------------------------------------
    stairs, stairs_hint = _match_stairs(
        sem.get("stairs", {}),
        matched_rooms,
        src_w=src_w,
        src_h=src_h,
        content_rect=cr,
    )

    # --- furniture exclusion ------------------------------------------------
    suppressed_doors = _apply_furniture_exclusion(
        "door", door_candidates, sem.get("doors", []), matched_rooms, sem.get("furniture", [])
    )
    suppressed_windows = _apply_furniture_exclusion(
        "window", window_candidates, sem.get("windows", []), matched_rooms, sem.get("furniture", [])
    )

    # --- wall classification -------------------------------------------------
    boundary = _room_boundary_check(walls, matched_rooms)
    wall_out: list[dict[str, Any]] = []
    for w in walls:
        evidence: list[str] = ["mask_heuristic"]
        wall_type = w.get("type", "unknown")
        verdict = boundary.get(w["id"])
        if verdict and verdict != wall_type:
            if verdict == "unknown":
                evidence.append("room_boundary:ambiguous")
            else:
                wall_type = verdict
                evidence.append("room_boundary")
        for door in matched_doors:
            if door.get("wall_id") == w["id"] and door.get("semantic_type") == "exterior":
                wall_type = "exterior"
                evidence.append("semantic_exterior_door")
        wall_out.append(
            {
                **w,
                "type": wall_type,
                "provenance": {
                    "geometric": "unet",
                    "semantic": "vlm" if any("semantic" in e for e in evidence) else None,
                },
                "type_evidence": evidence,
            }
        )

    # --- dimensions (Step 11): preserved, never converted -------------------
    dimensions = [
        {"value": d.get("value"), "unit": d.get("unit") or "unknown", "source": "visual_text"}
        for d in sem.get("dimensions", [])
        if d.get("value")
    ]

    unresolved: dict[str, Any] = {
        "spaces": unresolved_spaces,
        "doors": unresolved_doors,
        "windows": unresolved_windows,
    }
    suppressed = [*suppressed_doors, *suppressed_windows]

    return {
        "schema": FUSED_SCHEMA,
        "counts": {
            "walls": len(wall_out),
            "rooms": len(matched_rooms),
            "doors": len(matched_doors),
            "windows": len(matched_windows),
            "stairs": len(stairs),
            "unresolved_spaces": len(unresolved_spaces),
            "unresolved_doors": len(unresolved_doors),
            "unresolved_windows": len(unresolved_windows),
        },
        "walls": wall_out,
        "rooms": matched_rooms,
        "doors": matched_doors,
        "windows": matched_windows,
        "stairs": stairs,
        "dimensions": dimensions,
        "furniture": sem.get("furniture", []),
        "unresolved": unresolved,
        "suppressed_openings": suppressed,
        "debug": {
            "schema": "vista-geometry-fusion-debug-v1",
            "room_matches": room_debug,
            "door_matches": door_debug,
            "window_matches": window_debug,
            "thresholds": {
                "door": door_threshold,
                "window": window_threshold,
            },
            "stairs_hint": stairs_hint,
        },
        "notes": {
            "semantic_schema": sem.get("schema", "vista-geometry-semantic-v1"),
            "dimensions_preserved_only": True,
            "scale_calibration": "next_phase",
            "furniture_suppressed_openings": len(suppressed),
        },
    }