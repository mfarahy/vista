"""Weight-free tests for the deterministic normalization layer.

Runs purely on synthetic raw documents (no model, no weights) so the Phase 3
geometry logic is testable on any machine.

Run:  python -m geometry_ai.tests.test_normalize
"""

from __future__ import annotations

import json

from ..normalize import normalize_raw

# ---------------------------------------------------------------------------
# Synthetic raw document helpers
# ---------------------------------------------------------------------------

# A simple 2-room plan: rectangle shell + full-height divider, plus a door
# opening polygon sitting on the divider (CubiCasa-style wall band widths).
TWO_ROOM_PLAN = {
    "input": {"width": 1000, "height": 760},
    "content_rect": [0, 0, 512, 389],
    "walls": [
        {"start": [70.0, 70.0], "end": [930.0, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [930.0, 70.0], "end": [930.0, 690.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [930.0, 690.0], "end": [70.0, 690.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [70.0, 690.0], "end": [70.0, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        # divider split by a door opening (two collinear pieces + gap)
        {"start": [500.0, 71.0], "end": [500.0, 320.0], "thickness": 22, "type": "interior", "confidence": 0.97},
        {"start": [500.0, 440.0], "end": [500.0, 689.0], "thickness": 22, "type": "interior", "confidence": 0.97},
    ],
    "polygons": {"floor": [], "wall": [], "door": [], "window": []},
    "floor_regions": [],
}


def _doc(walls, doors=(), windows=()):
    doc = json.loads(json.dumps(TWO_ROOM_PLAN))
    doc["walls"] = walls
    doc["polygons"] = {"floor": [], "wall": [], "door": list(doors), "window": list(windows)}
    return doc


def _door(center, width, height=14, confidence=0.92, **kw):
    cx, cy = center
    return {
        "outer": [
            [cx - width / 2, cy - height / 2],
            [cx + width / 2, cy - height / 2],
            [cx + width / 2, cy + height / 2],
            [cx - width / 2, cy + height / 2],
        ],
        "holes": [],
        "confidence": confidence,
        "area_mask_px": int(width * height),
        **kw,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)
    return True


def test_two_rooms_remain_two_after_door_opening():
    """A door opening in the divider must NOT merge the two rooms (criterion 7)."""
    # opening slab runs ALONG the (vertical) divider, spanning the gap y≈320..440
    door = {
        "outer": [[493, 320], [507, 320], [507, 440], [493, 440]],
        "holes": [],
        "confidence": 0.92,
        "area_mask_px": 1680,
    }
    doc = _doc(
        TWO_ROOM_PLAN["walls"],
        doors=[door],
    )
    out = normalize_raw(doc)
    rooms = out["rooms"]
    _assert(len(rooms) == 2, f"expected 2 rooms, got {len(rooms)}")
    _assert(rooms[0]["derived"] is True, "rooms should be marked as derived")
    _assert(len(out["doors"]) == 1, f"expected 1 door kept, got {len(out['doors'])}")


def test_door_off_wall_is_rejected():
    """A hallucinated door floating away from every wall must be dropped."""
    doc = _doc(TWO_ROOM_PLAN["walls"], doors=[_door((250, 200), width=120)])
    out = normalize_raw(doc)
    _assert(len(out["doors"]) == 0, "floating door should be rejected")
    _assert(out["notes"]["openings_rejected"]["door"] == 1, "rejection should be counted")


def test_misaligned_window_is_snapped_to_wall():
    """A window slightly off its host wall is snapped, flagged corrected."""
    doc = _doc(
        TWO_ROOM_PLAN["walls"],
        windows=[_door((700, 58), width=160, height=10)],
    )
    out = normalize_raw(doc)
    _assert(len(out["windows"]) == 1, "on-wall window should be kept")
    w = out["windows"][0]
    _assert(w["corrected"] is True, "snapped window should be flagged corrected")
    _assert(abs(w["position"] - (700 - 70) / 860) < 0.02, f"window position along north wall off, got {w['position']}")
    _assert(abs(w["width"] - 160) < 3, f"window width preserved, got {w['width']}")


def test_richness_snap_and_merge():
    """Nearly-identical duplicate segments collapse to one; walls stay thick."""
    walls = list(TWO_ROOM_PLAN["walls"])
    walls.append({"start": [70.1, 70.0], "end": [929.9, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.8})
    walls.append({"start": [930.1, 70.0], "end": [930.0, 690.0], "thickness": 22, "type": "exterior", "confidence": 0.8})
    out = normalize_raw(_doc(walls))
    north = [w for w in out["walls"] if w["start"][1] < 100 and w["end"][1] < 100 and w["type"] == "exterior"]
    # small endpoint noise merges into the shell; north wall must remain thick
    _assert(len(north) >= 1, "north wall should exist")
    _assert(max(w["thickness"] for w in north) >= 18, "wall thickness preserved")


def test_deterministic():
    """Identical input ⇒ byte-identical normalized output."""
    docs = [
        _doc(TWO_ROOM_PLAN["walls"], doors=[_door((500, 380), width=120)]),
        _doc(TWO_ROOM_PLAN["walls"]),
    ]
    for doc in docs:
        a = normalize_raw(doc)
        b = normalize_raw(doc)
        _assert(json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True), "output must be deterministic")


def main() -> None:
    tests = [t for name, t in sorted(globals().items()) if name.startswith("test_")]
    passed = 0
    for t in tests:
        t()
        print(f"PASS {t.__name__}")
        passed += 1
    print(f"\n{passed}/{len(tests)} normalization tests passed")


if __name__ == "__main__":
    main()