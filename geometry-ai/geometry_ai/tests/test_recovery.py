"""Weight-free tests for the Phase 7 deterministic geometry recovery layer.

Runs purely on synthetic raw documents + synthetic VLM semantic documents and
small **drawn-on-the-fly plan images** (no model, no weights, no API calls):
the normalization layer produces the geometry, fusion produces the unresolved
semantic observations, and recovery must re-derive the missing openings and
the coarse stair region from wall-opening / parallel-line image evidence —
without ever fabricating geometry.

Run:  python -m geometry_ai.tests.test_recovery
"""

from __future__ import annotations

import io
import json

from PIL import Image, ImageDraw

from ..fusion import fuse
from ..normalize import normalize_raw
from ..recovery import (
    detect_wall_gaps,
    evidence_level,
    load_grayscale_float,
    recover,
)

# ---------------------------------------------------------------------------
# Synthetic plan document (same two-room plan as test_normalize / test_fusion)
# ---------------------------------------------------------------------------

TWO_ROOM_PLAN = {
    "input": {"width": 1000, "height": 760},
    "content_rect": [0, 0, 512, 389],
    "walls": [
        {"start": [70.0, 70.0], "end": [930.0, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [930.0, 70.0], "end": [930.0, 690.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [930.0, 690.0], "end": [70.0, 690.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [70.0, 690.0], "end": [70.0, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        # divider split by a door opening
        {"start": [500.0, 71.0], "end": [500.0, 320.0], "thickness": 22, "type": "interior", "confidence": 0.97},
        {"start": [500.0, 440.0], "end": [500.0, 689.0], "thickness": 22, "type": "interior", "confidence": 0.97},
    ],
    "polygons": {"floor": [], "wall": [], "door": [], "window": []},
    "floor_regions": [],
}

WALL_FILL = (45, 45, 50)
WINDOW_LINE = (90, 90, 100)


def _draw_plan(door_gap=True, window_on_north=True, window_on_east=False, stairs=False):
    """Draw the synthetic two-room plan (matching TWO_ROOM_PLAN coordinates).

    The door is a real *gap* in the vertical divider (y 320..440); windows are
    thin lighter transverse lines across the exterior walls; stairs are a set
    of repeated parallel tread lines in the right room.
    """
    im = Image.new("RGB", (1000, 760), (252, 252, 250))
    draw = ImageDraw.Draw(im)
    # exterior shell
    for (p1, p2) in [
        ((70, 70), (930, 70)),
        ((930, 70), (930, 690)),
        ((930, 690), (70, 690)),
        ((70, 690), (70, 70)),
    ]:
        draw.line([p1, p2], fill=WALL_FILL, width=22)
    # vertical divider: continuous band, or split by a real door opening
    if door_gap:
        draw.line([(500, 71), (500, 320)], fill=WALL_FILL, width=22)
        draw.line([(500, 440), (500, 689)], fill=WALL_FILL, width=22)
        # erase the wall to open a real gap at y 320..440 (the drawn door)
        draw.line([(500, 322), (500, 438)], fill=(252, 252, 250), width=22)
        draw.line([(500, 335), (515, 335)], fill=(60, 60, 70), width=4)  # leaf
    else:
        draw.line([(500, 71), (500, 689)], fill=WALL_FILL, width=22)
    # windows: thin lighter lines across the band (a "window double-line")
    if window_on_north:
        draw.line([(700, 70), (830, 70)], fill=WINDOW_LINE, width=6)
    if window_on_east:
        draw.line([(930, 150), (930, 280)], fill=WINDOW_LINE, width=6)
    # stairs: repeated parallel treads near the bottom-right room
    if stairs:
        sx, sy = 730, 560
        for i in range(8):
            draw.line([(sx, sy + i * 16), (sx + 110, sy + i * 16)], fill=(80, 80, 88), width=3)
    return im


def _image_bytes(**kw) -> bytes:
    buf = io.BytesIO()
    _draw_plan(**kw).save(buf, format="PNG")
    return buf.getvalue()


def _semantic(
    spaces=(),
    doors=(),
    windows=(),
    stairs=None,
    furniture=(),
):
    return {
        "schema": "vista-geometry-semantic-v1",
        "spaces": list(spaces),
        "doors": list(doors),
        "windows": list(windows),
        "stairs": (
            stairs
            if stairs is not None
            else {"present": False, "relative_location": None, "direction": None}
        ),
        "dimensions": [],
        "annotations": [],
        "furniture": list(furniture),
        "notes": {"overall_confidence": "high", "issues": []},
    }


def _space(label, type_, relative_location, **kw):
    return {
        "label": label,
        "type": type_,
        "enclosed": True,
        "usable": True,
        "relative_location": relative_location,
        **kw,
    }


def _door(connects, relative_location, type_="interior"):
    return {"count": 1, "type": type_, "connects": connects, "relative_location": relative_location}


def _window(space, wall, relative_location):
    return {"count": 1, "space": space, "wall": wall, "relative_location": relative_location}


def _normalized():
    doc = json.loads(json.dumps(TWO_ROOM_PLAN))
    return normalize_raw(doc)


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)
    return True


def _fuse_recover(image_bytes, norm, sem):
    fused = fuse(norm, sem, src_w=1000, src_h=760)
    return recover(norm, fused, image_bytes, src_w=1000, src_h=760)


# ---------------------------------------------------------------------------
# Opening detection (image → geometry evidence)
# ---------------------------------------------------------------------------


def test_door_gap_detected_on_drawn_wall():
    """A real gap in a drawn wall band is detected at the drawn position.

    Uses the *normalized* divider (the two raw segments are merged through the
    opening) — the same wall representation recovery operates on."""
    gray = load_grayscale_float(_image_bytes(door_gap=True))
    wall = next(w for w in _normalized()["walls"] if w["type"] == "interior")
    gaps = detect_wall_gaps(wall, gray)
    _assert(any(g["width"] >= 50 for g in gaps), f"expected a wide door gap, got {gaps}")


def test_no_gap_on_solid_wall():
    gray = load_grayscale_float(_image_bytes(door_gap=True))
    wall = next(w for w in _normalized()["walls"] if w["type"] == "exterior" and w["id"] == "n-wall-4")
    gaps = detect_wall_gaps(wall, gray)
    _assert(gaps == [], f"solid south wall must have no gaps, got {gaps}")


def test_evidence_level_maps_ratios():
    _assert(evidence_level(0.9) == "high", "strong break → high")
    _assert(evidence_level(0.20) == "medium", "moderate break → medium")
    _assert(evidence_level(0.11) == "low", "weak break → low")
    _assert(evidence_level(0.03) is None, "below floor → no evidence")


# ---------------------------------------------------------------------------
# Window recovery (Step 4)
# ---------------------------------------------------------------------------


def test_window_recovered_from_image_evidence():
    """VLM says window on the north wall; no UNet window; the image's wall
    opening recovers it — with provenance, never a VLM coordinate."""
    norm = _normalized()
    img = _image_bytes(window_on_north=True, door_gap=False)
    sem = _semantic(
        spaces=[_space("Flur", "hallway", "bottom-right")],
        windows=[_window("Flur", "north wall", "upper-right")],
    )
    rec = _fuse_recover(img, norm, sem)
    _assert(rec["counts"]["recovered_windows"] == 1, f"expected 1 recovered window, got {rec['counts']}")
    win = rec["recovery"]["windows"][0]
    _assert(win["wall_id"] == "n-wall-0", f"recovered on the north wall, got {win['wall_id']}")
    _assert(win["provenance"] == {"geometric": "image_recovery", "semantic": "vlm", "recovery": True}, win["provenance"])
    _assert(win["confidence"] is None, "no fabricated confidence")
    _assert("recovered_reason" in win and win["evidence_level"] in ("high", "medium", "low"), win)


def test_window_without_image_evidence_remains_unresolved():
    """No opening drawn on the wall → the semantic window stays unresolved."""
    norm = _normalized()
    img = _image_bytes(door_gap=False, window_on_north=False)
    sem = _semantic(spaces=[_space("Flur", "hallway", "bottom-right")], windows=[_window("Flur", "north wall", "upper-right")])
    rec = _fuse_recover(img, norm, sem)
    _assert(rec["counts"]["recovered_windows"] == 0, "no image evidence → nothing recovered")
    _assert(len(rec["unresolved"]["windows"]) == 1, "stays unresolved")
    _assert(rec["unresolved"]["windows"][0]["recovery_reason"], "with an explicit reason")


def test_window_does_not_claim_door_gap_on_interior_wall():
    """A 'north wall' window must not claim the door gap on an interior wall."""
    norm = _normalized()
    img = _image_bytes(door_gap=True, window_on_north=True)
    sem = _semantic(spaces=[_space("Flur", "hallway", "bottom-right")], windows=[_window("Flur", "north wall", "upper-right")])
    rec = _fuse_recover(img, norm, sem)
    win = rec["recovery"]["windows"]
    _assert(len(win) == 1, f"exactly one window, got {win}")
    _assert(win[0]["wall_id"] == "n-wall-0", f"on north wall only, got {win[0]['wall_id']}")


# ---------------------------------------------------------------------------
# Door recovery (Step 5)
# ---------------------------------------------------------------------------


def test_door_recovered_by_room_connectivity():
    """Two matched rooms connected by a semantic door → the door is recovered
    on the wall that separates them (the divider's real gap)."""
    norm = _normalized()
    img = _image_bytes(door_gap=True)
    sem = _semantic(
        spaces=[
            _space("Heizung", "utility", "top-left"),
            _space("Flur", "hallway", "bottom-right"),
        ],
        doors=[_door("Heizung and Flur", "central divider", "interior")],
    )
    rec = _fuse_recover(img, norm, sem)
    _assert(rec["counts"]["recovered_doors"] == 1, f"expected 1 recovered door, got {rec['counts']}")
    door = rec["recovery"]["doors"][0]
    _assert(door["connects"] == "Heizung and Flur", door)
    _assert(door["swing"] == "unknown", "swing is never invented")
    _assert(door["width"] >= 80, f"door width plausible, got {door['width']}")


def test_door_swing_not_invented():
    norm = _normalized()
    img = _image_bytes(door_gap=True)
    sem = _semantic(
        spaces=[_space("Heizung", "utility", "top-left"), _space("Flur", "hallway", "bottom-right")],
        doors=[_door("Heizung and Flur", "central divider", "interior")],
    )
    rec = _fuse_recover(img, norm, sem)
    door = rec["recovery"]["doors"][0]
    _assert(door["swing"] == "unknown", "no swing value is ever fabricated")


def test_interior_door_not_recovered_from_shell():
    """An interior semantic door must not be matched to an exterior wall."""
    norm = _normalized()
    img = _image_bytes(door_gap=False, window_on_north=False)
    sem = _semantic(
        spaces=[_space("Heizung", "utility", "top-left"), _space("Flur", "hallway", "bottom-right")],
        doors=[_door("Heizung and Flur", "central divider", "interior")],
    )
    rec = _fuse_recover(img, norm, sem)
    _assert(rec["counts"]["recovered_doors"] == 0, "no divider gap → door stays unresolved")
    _assert(len(rec["unresolved"]["doors"]) == 1, rec["unresolved"]["doors"])


# ---------------------------------------------------------------------------
# Room recovery (Step 6/7)
# ---------------------------------------------------------------------------


def test_room_without_closed_boundary_stays_unresolved():
    """The 'Öl' case: two semantic spaces share one undivided geometric region.
    There is no drawn wall separating them — recovery must NOT fabricate a
    second room polygon; the space stays an unresolved candidate."""
    norm = _normalized()
    img = _image_bytes(door_gap=False)
    sem = _semantic(
        spaces=[
            _space("Heizung", "utility", "top-left"),
            _space("Öl", "storage", "bottom-left"),
        ]
    )
    rec = _fuse_recover(img, norm, sem)
    _assert(rec["counts"]["recovered_rooms"] == 0, "no room is fabricated")
    unresolved = rec["unresolved"]["spaces"]
    _assert(len(unresolved) == 1, f"Öl stays unresolved, got {unresolved}")
    _assert(unresolved[0]["label"] == "Öl", unresolved[0])
    _assert("region_shared" in unresolved[0]["recovery_reason"], unresolved[0]["recovery_reason"])


def test_space_anchoring_nowhere_gets_no_boundary_reason():
    """A semantic space with no enclosing wall-graph face stays unresolved with
    `no_closed_geometric_boundary` — no polygon is invented for it."""
    norm = _normalized()
    # no accepted geometry region and no closed-face candidates at all
    norm["rooms"] = []
    norm["candidates"] = {}

    sem = _semantic(spaces=[_space("Balkon", "balcony", "bottom-right")])
    img = _image_bytes(door_gap=False)
    fused = fuse(norm, sem, src_w=1000, src_h=760)
    rec = recover(norm, fused, img, src_w=1000, src_h=760)
    unresolved = rec["unresolved"]["spaces"]
    _assert(len(unresolved) == 1, f"no closed boundary → unresolved, got {unresolved}")
    _assert("no_closed_geometric_boundary" in unresolved[0]["recovery_reason"], unresolved[0]["recovery_reason"])


# ---------------------------------------------------------------------------
# Stair recovery (Step 8)
# ---------------------------------------------------------------------------


def test_stairs_recovered_from_parallel_treads():
    norm = _normalized()
    img = _image_bytes(stairs=True, door_gap=False)
    sem = _semantic(
        spaces=[_space("Flur", "hallway", "bottom-right")],
        stairs={"present": True, "relative_location": "bottom-right of Flur", "direction": "up"},
    )
    rec = _fuse_recover(img, norm, sem)
    _assert(rec["counts"]["recovered_stairs"] == 1, f"stairs recovered, got {rec['counts']}")
    stair = rec["recovery"]["stairs"][0]
    _assert(stair["geometric"] is True, "stair now has geometric evidence")
    _assert(stair["region"]["orientation"] == "horizontal", stair["region"])
    _assert(stair["direction"] == "up", "VLM direction preserved, never invented")


# ---------------------------------------------------------------------------
# Provenance + determinism
# ---------------------------------------------------------------------------


def test_recovered_entities_never_carry_vlm_coordinates():
    """The recovered position/width are the *detector's* values, so the VLM's
    approximate relative location can never become authoritative geometry."""
    norm = _normalized()
    img = _image_bytes(window_on_north=True, door_gap=False)
    sem = _semantic(spaces=[_space("Flur", "hallway", "bottom-right")], windows=[_window("Flur", "north wall", "upper-right")])
    fused = fuse(norm, sem, src_w=1000, src_h=760)
    rec = recover(norm, fused, img, src_w=1000, src_h=760)
    win = rec["recovery"]["windows"][0]
    # compute the expected position from the drawn window (x 700..830 on y=70)
    expected = round(((700 + 830) / 2 - 70) / (930 - 70), 2)
    _assert(abs(win["position"] - expected) < 0.05, f"position from image, got {win['position']}")


def test_recovery_deterministic():
    norm = _normalized()
    img = _image_bytes(door_gap=True, window_on_north=True, stairs=True)
    sem = _semantic(
        spaces=[_space("Heizung", "utility", "top-left"), _space("Flur", "hallway", "bottom-right")],
        doors=[_door("Heizung and Flur", "central divider", "interior")],
        windows=[_window("Flur", "north wall", "upper-right")],
        stairs={"present": True, "relative_location": "bottom-right of Flur", "direction": "up"},
    )
    a = _fuse_recover(img, norm, sem)
    b = _fuse_recover(img, norm, sem)
    _assert(json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True), "recovery must be deterministic")


def test_detection_gating_on_evidence_floor():
    gray = load_grayscale_float(_image_bytes(door_gap=False, window_on_north=False))
    wall = {"start": [930.0, 70.0], "end": [930.0, 690.0], "thickness": 22}
    _assert(len(detect_wall_gaps(wall, gray)) == 0, "no opening → no gap list entry")


# ---------------------------------------------------------------------------
# Coordinate transformations (Step 9)
# ---------------------------------------------------------------------------


def test_source_to_mask_roundtrip():
    """Letterbox source→mask→source mapping is an identity on interior points."""
    from ..preprocess import mask_to_source_points, to_input_tensor

    image = _draw_plan(door_gap=True)
    import numpy as np

    tensor, content_rect = to_input_tensor(image, image_size=(512, 512))
    src_w, src_h = image.size
    left, top, inner_w, inner_h = content_rect
    # map source points into mask space (forward letterbox), then back
    sources = np.array([[70.0, 70.0], [500.0, 400.0], [930.0, 690.0]])
    mask_pts = np.stack(
        [
            left + (sources[:, 0] * inner_w) / src_w,
            top + (sources[:, 1] * inner_h) / src_h,
        ],
        axis=-1,
    )
    back = mask_to_source_points(mask_pts, content_rect, (src_w, src_h))
    for (sx, sy), (bx, by) in zip(sources.tolist(), back):
        _assert(abs(sx - bx) < 1.5 and abs(sy - by) < 1.5, f"roundtrip drift for ({sx},{sy}) → ({bx},{by})")


def test_recovery_sampling_stays_in_image_bounds():
    """Recovery profiles the source image at wall coordinates that map exactly
    to drawn pixels — no OOB sampling and no coordinate-system mismatch."""
    import numpy as np

    gray = load_grayscale_float(_image_bytes(window_on_north=True, door_gap=True))
    wall = {"start": [70.0, 70.0], "end": [930.0, 70.0], "thickness": 22}
    from ..recovery import _profile

    ts, prof, length, baseline = _profile(gray, wall)
    _assert(abs(length - 860) < 1.0, f"wall length {length}")
    _assert(len(ts) > 50, "sampled the full wall")
    _assert(bool(np.all(np.isfinite(prof))), "profile finite within image bounds")


def test_anchor_fraction_maps_within_plan_bounds():
    """VLM relative locations resolve to source points inside the drawing."""
    norm = _normalized()
    from ..fusion import _derive_plan_bounds, parse_relative_location

    cr = _derive_plan_bounds(norm)
    _assert(cr is not None, "plan bounds derived from walls")
    hint = parse_relative_location("upper-right", src_w=1000, src_h=760, content_rect=cr)
    _assert(cr[0] + 1 <= hint["x"] <= cr[0] + cr[2], f"x within plan bounds, got {hint['x']}")
    _assert(cr[1] <= hint["y"] <= cr[1] + cr[3], f"y within plan bounds, got {hint['y']}")


def main() -> None:
    tests = [t for name, t in sorted(globals().items()) if name.startswith("test_")]
    passed = 0
    for t in tests:
        t()
        print(f"PASS {t.__name__}")
        passed += 1
    print(f"\n{passed}/{len(tests)} recovery tests passed")


if __name__ == "__main__":
    main()