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


def _door_on_wall(center, *, along, thickness, offset, confidence=0.92):
    """A door slab aligned with the plan's vertical divider wall (x=500).

    `offset` is the perpendicular distance of the door's centre from the wall
    centreline. The rectangle runs `along` px in the wall's direction and
    `thickness` px across it.
    """
    cx, cy = center
    half_a, half_t = along / 2, thickness / 2
    return {
        "outer": [
            [cx - half_t, cy - half_a],
            [cx + half_t, cy - half_a],
            [cx + half_t, cy + half_a],
            [cx - half_t, cy + half_a],
        ],
        "holes": [],
        "confidence": confidence,
        "area_mask_px": int(along * thickness),
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


# ---------------------------------------------------------------------------
# Phase 4: conservative candidate classification + preserved debug output
# ---------------------------------------------------------------------------


def test_slightly_misaligned_door_is_uncertain_not_deleted():
    """A door off its wall but within the conservative band stays a candidate.

    Phase 4 must not destroy a plausible opening just because it is not
    perfectly aligned: it is classified `uncertain` and kept in the debug
    output (and handed to the ambiguity path), not silently deleted.
    """
    # 40 px off the divider, aligned with it (valid dist ≈ 30px, hard dist
    # ≈ 77px): misaligned but not fabricated.
    doc = _doc(
        TWO_ROOM_PLAN["walls"],
        doors=[_door_on_wall((540, 380), along=90, thickness=20, offset=40)],
    )
    out = normalize_raw(doc)
    door_cands = out["candidates"]["openings"]["door"]
    _assert(len(door_cands) == 1, "candidate must be preserved")
    _assert(door_cands[0]["status"] == "uncertain", f"expected uncertain, got {door_cands[0]['status']}")
    _assert("off_wall_misaligned" in door_cands[0]["reasons"], "reasons must explain the uncertainty")
    _assert(door_cands[0]["id"] in out["candidates"]["ambiguous_opening_ids"], "uncertain candidate must be ambiguous")
    _assert(len(out["doors"]) == 0, "uncertain candidate is not emitted by default")


def test_far_door_is_invalid_but_preserved_with_reason():
    """A clear hallucination is invalid — but stays visible with its reason."""
    doc = _doc(TWO_ROOM_PLAN["walls"], doors=[_door((300, 250), width=120)])
    out = normalize_raw(doc)
    door_cands = out["candidates"]["openings"]["door"]
    _assert(len(door_cands) == 1, "invalid candidate must still be preserved")
    _assert(door_cands[0]["status"] == "invalid", "far door is invalid")
    _assert("too_far_from_wall" in door_cands[0]["reasons"], "reason must be visible")
    _assert(out["notes"]["openings_rejected"]["door"] == 1, "rejected counter kept for tooling")
    _assert(len(out["doors"]) == 0, "invalid candidate must not be emitted")


def test_room_candidates_preserve_rejected_faces():
    """Rejected faces remain in the debug candidate list with their cause."""
    # A tiny 30x30 alcove bump on the north wall creates a small enclosed
    # face (far below the room area gate) that must not become a room.
    walls = [
        {"start": [70.0, 70.0], "end": [200.0, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [240.0, 70.0], "end": [930.0, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [930.0, 70.0], "end": [930.0, 690.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [930.0, 690.0], "end": [70.0, 690.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        {"start": [70.0, 690.0], "end": [70.0, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.99},
        # outward alcove bump on the north wall (its own tiny enclosed face)
        {"start": [200.0, 70.0], "end": [200.0, 40.0], "thickness": 22, "type": "exterior", "confidence": 0.9},
        {"start": [200.0, 40.0], "end": [240.0, 40.0], "thickness": 22, "type": "exterior", "confidence": 0.9},
        {"start": [240.0, 40.0], "end": [240.0, 70.0], "thickness": 22, "type": "exterior", "confidence": 0.9},
        # divider making two main rooms
        {"start": [500.0, 71.0], "end": [500.0, 689.0], "thickness": 22, "type": "interior", "confidence": 0.97},
    ]
    out = normalize_raw(_doc(walls))
    candidates = out["candidates"]["rooms"]
    rejected = [c for c in candidates if c["status"] == "rejected"]
    _assert(len(rejected) == 1, f"expected one rejected room candidate, got {[c['reason'] for c in candidates]}")
    _assert(rejected[0]["reason"] in ("too_small", "too_thin"), f"tiny alcove must be gated, got {rejected[0]['reason']}")
    _assert(out["notes"]["rooms_rejected"] == 1, "rejected rooms counter must be kept")


def test_wall_band_artefact_face_rejected():
    """A face whose interior is filled with wall pixels can never be a room.

    Models a double wall boundary / closed wall-band hole: the wall mask
    covers the region inside the centerline loop, so the face must be filtered
    as `wall_artefact`.
    """
    walls = [
        {"start": [70.0, 70.0], "end": [130.0, 70.0], "thickness": 22, "type": "interior", "confidence": 0.9},
        {"start": [130.0, 70.0], "end": [130.0, 130.0], "thickness": 22, "type": "interior", "confidence": 0.9},
        {"start": [130.0, 130.0], "end": [70.0, 130.0], "thickness": 22, "type": "interior", "confidence": 0.9},
        {"start": [70.0, 130.0], "end": [70.0, 70.0], "thickness": 22, "type": "interior", "confidence": 0.9},
    ]
    doc = _doc(walls)
    doc["polygons"]["wall"] = [
        {"outer": [[66, 66], [134, 66], [134, 134], [66, 134]], "holes": [], "confidence": 0.9, "area_mask_px": 4624}
    ]
    out = normalize_raw(doc)
    candidates = out["candidates"]["rooms"]
    _assert(len(out["rooms"]) == 0, "an interior wall-filled face is not a room")
    _assert(any(c["status"] == "rejected" and c["reason"] == "wall_artefact" for c in candidates),
            "wall-filled face must be rejected as wall_artefact")


def test_valid_room_and_wall_ids_consistent():
    """Phase 4 fixes opening wall_id references to match normalized wall ids."""
    doc = _doc(
        TWO_ROOM_PLAN["walls"],
        windows=[_door((700, 58), width=160, height=10)],
    )
    out = normalize_raw(doc)
    wall_ids = {w["id"] for w in out["walls"]}
    _assert(len(out["windows"]) == 1, "window kept")
    _assert(out["windows"][0]["wall_id"] in wall_ids,
            f"window wall_id must reference a normalized wall, got {out['windows'][0]['wall_id']}")
    for room in out["rooms"]:
        for wid in room["wall_ids"]:
            _assert(wid in wall_ids, "room wall_ids must reference normalized walls")


class _AcceptingProvider:
    """Synthetic refinement provider that accepts every ambiguous candidate."""

    @property
    def name(self) -> str:
        return "fake-accept"

    def refine(self, *, candidate, candidates, image_bytes=None):
        from ..refinement import RefinementDecision
        return RefinementDecision(decision="accept", reason="test provider", confidence=0.99)


def test_refinement_accept_promotes_uncertain_candidate():
    """An ambiguous candidate accepted by a provider enters the final output."""
    doc = _doc(
        TWO_ROOM_PLAN["walls"],
        doors=[_door_on_wall((540, 380), along=90, thickness=20, offset=40)],
    )
    out = normalize_raw(doc)
    _assert(len(out["doors"]) == 0, "uncertain door not emitted by default")
    from ..normalize import apply_refinement
    out = apply_refinement(out, _AcceptingProvider(), image_bytes=None)
    _assert(len(out["doors"]) == 1, "refinement must promote the accepted door")
    _assert(out["refinement"]["provider"] == "fake-accept", "refinement provider must be documented")
    _assert(out["candidates"]["ambiguous_opening_ids"] == [], "no ambiguity remains after resolution")


def test_noop_refinement_changes_nothing():
    """The default provider leaves the deterministic result untouched."""
    doc = _doc(
        TWO_ROOM_PLAN["walls"],
        doors=[_door_on_wall((540, 380), along=90, thickness=20, offset=40)],
    )
    out = normalize_raw(doc)
    import json as _json
    snapshot = _json.dumps(out, sort_keys=True)
    from ..normalize import apply_refinement
    from ..refinement import NoOpRefinementProvider
    apply_refinement(out, NoOpRefinementProvider(), image_bytes=None)
    _assert(_json.dumps(out, sort_keys=True) == snapshot, "NoOp refinement must be a no-op")


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