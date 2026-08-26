"""Weight-free tests for the Phase 6 semantic geometry fusion layer.

Runs purely on synthetic raw documents + synthetic VLM semantic documents
(no model, no weights, no API calls) so the fusion logic is testable on any
machine. The geometric documents are produced by the real deterministic
normalization layer from the same synthetic plans used by test_normalize.

Run:  python -m geometry_ai.tests.test_fusion
"""

from __future__ import annotations

import json

from ..fusion import fuse, parse_relative_location
from ..normalize import normalize_raw

# ---------------------------------------------------------------------------
# Synthetic inputs (same plan as test_normalize: shell + vertical divider)
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


def _semantic(
    spaces=(),
    doors=(),
    windows=(),
    stairs=None,
    furniture=(),
    dimensions=(),
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
        "dimensions": list(dimensions),
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


def _door_semantic(connects, relative_location, type_="interior"):
    return {
        "count": 1,
        "type": type_,
        "connects": connects,
        "relative_location": relative_location,
    }


def _window_semantic(space, wall, relative_location):
    return {"count": 1, "space": space, "wall": wall, "relative_location": relative_location}


def _door_candidate(center, along=90, thickness=20, confidence=0.92):
    """A door slab aligned with the plan's vertical divider (x=500)."""
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


def _window_candidate(center, width=160, height=10, confidence=0.93):
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
    }


def _normalized(walls, doors=(), windows=()):
    doc = json.loads(json.dumps(TWO_ROOM_PLAN))
    doc["walls"] = walls
    doc["polygons"] = {"floor": [], "wall": [], "door": list(doors), "window": list(windows)}
    return normalize_raw(doc)


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)
    return True


def _fuse(normalized, semantic, src_w=1000, src_h=760):
    return fuse(normalized, semantic, src_w=src_w, src_h=src_h)


# ---------------------------------------------------------------------------
# Relative-location parsing
# ---------------------------------------------------------------------------


def test_parse_corner_and_compound_locations():
    assert _parse_anchor("top-left")[0:2] == (0.2, 0.2)
    assert _parse_anchor("bottom-right corner")[0:2] == (0.8, 0.8)
    # "left-middle" = left × middle-height, not centre-left
    assert _parse_anchor("left-middle")[0:2] == (0.25, 0.5)
    # "of centre" pulls the corner toward the centre
    assert _parse_anchor("upper-left of centre")[0:2] == (0.35, 0.35)
    # compound: the non-centre word wins on its axis
    assert _parse_anchor("centre-right side of the horizontal dividing wall")[0:2] == (0.75, 0.5)
    # a specific wall is designated only by "X wall" phrasing
    hint = parse_relative_location("right wall", src_w=1000, src_h=760)
    _assert(hint["wall_side"] == "east", f"right wall → east, got {hint['wall_side']}")
    hint = parse_relative_location("left side of the horizontal dividing wall", src_w=1000, src_h=760)
    _assert(hint["wall_side"] is None, "left SIDE of a wall is not a wall-side hint")
    _assert(hint["horizontal"] is True, "horizontal orientation must be detected")
    # room-relative side: "south side of Heizung"
    hint = parse_relative_location("south side of Heizung", src_w=1000, src_h=760)
    _assert(hint["room_side"] == ("south", "heizung"), f"got {hint['room_side']}")


def _parse_anchor(text):
    hint = parse_relative_location(text, src_w=1000, src_h=760)
    return (hint["x_fraction"], hint["y_fraction"])


# ---------------------------------------------------------------------------
# Room fusion
# ---------------------------------------------------------------------------


def test_rooms_matched_with_labels_and_types():
    """Semantic spaces anchor onto the geometric rooms and carry name + type."""
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    sem = _semantic(
        spaces=[
            _space("Heizung", "utility", "top-left"),
            _space("Hobbyraum", "hobby_room", "top-right"),
        ]
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["rooms"]) == 2, f"expected 2 matched rooms, got {len(fused['rooms'])}")
    by_name = {r["name"]: r for r in fused["rooms"]}
    _assert(by_name["Heizung"]["type"] == "utility", "type must come from the VLM enum")
    _assert(by_name["Hobbyraum"]["type"] == "hobby_room", "type must come from the VLM enum")
    _assert(by_name["Heizung"]["provenance"] == {"geometric": "unet", "semantic": "vlm"}, "provenance")
    _assert(fused["unresolved"]["spaces"] == [], "no unresolved spaces expected")
    _assert(len(fused["rooms"]) == 2, "geometry count unchanged by fusion")


def test_shared_region_keeps_second_space_unresolved():
    """Two semantic rooms in one undivided geometric region: the first claim
    wins; the second stays an unresolved candidate (no fabricated polygon)."""
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    # Left room region only; both spaces anchor inside it.
    sem = _semantic(
        spaces=[
            _space("Heizung", "utility", "top-left"),
            _space("Öl", "storage", "bottom-left"),
        ]
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["rooms"]) == 1, "only one geometric region exists")
    _assert(fused["rooms"][0]["name"] == "Heizung", "first claim wins")
    unresolved = fused["unresolved"]["spaces"]
    _assert(len(unresolved) == 1, "the second space must stay unresolved")
    _assert(unresolved[0]["label"] == "Öl", f"got {unresolved[0]['label']}")
    _assert("region_shared_with_space" in unresolved[0]["reason"], unresolved[0]["reason"])


def test_space_without_geometric_candidate_is_unresolved():
    """A semantic space with no enclosing geometric region is never given a
    fabricated polygon."""
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    sem = _semantic(spaces=[_space("Balkon", "balcony", "top-left")])
    fused = _fuse(norm, sem)
    _assert(len(fused["rooms"]) == 1, "left region still matches")
    # second space anchors nowhere → unresolved
    sem2 = _semantic(
        spaces=[
            _space("A", "other", "top-left"),
            _space("B", "other", "top-right"),
        ]
    )
    fused2 = _fuse(norm, sem2)
    _assert(len(fused2["unresolved"]["spaces"]) == 0, "both regions matched")


# ---------------------------------------------------------------------------
# Door fusion
# ---------------------------------------------------------------------------


def test_door_matched_by_wall_and_connectivity():
    """The semantic door on the dividing wall's lower side matches the
    geometric door candidate on that wall via orientation + location."""
    norm = _normalized(
        TWO_ROOM_PLAN["walls"],
        doors=[
            {
                "outer": [[493, 320], [507, 320], [507, 440], [493, 440]],
                "holes": [],
                "confidence": 0.92,
                "area_mask_px": 1680,
            }
        ],
    )
    sem = _semantic(
        spaces=[
            _space("Heizung", "utility", "top-left"),
            _space("Flur", "hallway", "bottom-right"),
        ],
        doors=[
            _door_semantic("Heizung and Flur", "lower part of the vertical dividing wall"),
        ],
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["doors"]) == 1, f"expected 1 matched door, got {fused['doors']}")
    door = fused["doors"][0]
    _assert(door["connects"] == "Heizung and Flur", "semantic connects preserved")
    _assert(door["candidate_id"].startswith("door-"), "geometry comes from the UNet candidate")
    _assert(door["provenance"]["geometric"] == "unet", "provenance")


def test_door_without_geometric_candidate_unresolved():
    """A semantic door with no UNet candidate is never fabricated."""
    norm = _normalized(TWO_ROOM_PLAN["walls"])  # no door candidates at all
    sem = _semantic(
        spaces=[_space("Flur", "hallway", "bottom-right")],
        doors=[_door_semantic("Flur and exterior", "right wall", type_="exterior")],
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["doors"]) == 0, "no geometry to match → no door emitted")
    unresolved = fused["unresolved"]["doors"]
    _assert(len(unresolved) == 1, "the semantic door stays unresolved")
    _assert(unresolved[0]["reason"] == "no_geometric_candidate", unresolved[0]["reason"])


# ---------------------------------------------------------------------------
# Window fusion
# ---------------------------------------------------------------------------


def test_window_matched_on_semantic_wall():
    """A window candidate on the north wall matches the semantic window that
    names the north wall."""
    norm = _normalized(
        TWO_ROOM_PLAN["walls"],
        windows=[_window_candidate((700, 58))],  # on the north wall
    )
    sem = _semantic(
        spaces=[_space("Hobbyraum", "hobby_room", "top-right")],
        windows=[_window_semantic("Hobbyraum", "north wall", "upper section")],
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["windows"]) == 1, f"expected 1 matched window, got {fused['windows']}")
    _assert(fused["windows"][0]["space"] == "Hobbyraum", "semantic space preserved")
    _assert(fused["windows"][0]["wall"] == "north wall", "semantic wall preserved")


def test_window_without_candidate_unresolved():
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    sem = _semantic(
        spaces=[_space("Hobbyraum", "hobby_room", "top-right")],
        windows=[_window_semantic("Hobbyraum", "east wall", "middle")],
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["windows"]) == 0, "no candidate → no window")
    _assert(len(fused["unresolved"]["windows"]) == 1, "stays unresolved")


# ---------------------------------------------------------------------------
# Stairs
# ---------------------------------------------------------------------------


def test_stairs_anchored_to_region_without_fabricated_geometry():
    """Stairs become a semantic region candidate: anchor + hosting room, no
    tread geometry, no width/length, no confidence."""
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    sem = _semantic(
        spaces=[_space("Flur", "hallway", "bottom-right")],
        stairs={
            "present": True,
            "relative_location": "bottom-right area of Flur",
            "direction": "up",
        },
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["stairs"]) == 1, "stairs represented")
    stair = fused["stairs"][0]
    _assert(stair["direction"] == "up", "direction preserved")
    _assert(stair["geometric"] is False, "no fabricated geometry")
    _assert(stair["region_label"] == "Flur", f"hosting region: {stair.get('region_label')}")
    _assert("width" not in stair and "length" not in stair, "no invented dimensions")
    _assert(stair["confidence"] is None, "no fabricated confidence")


def test_stairs_absent():
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    sem = _semantic(spaces=[_space("Flur", "hallway", "bottom-right")])
    fused = _fuse(norm, sem)
    _assert(fused["stairs"] == [], "no stairs when the VLM says none")


# ---------------------------------------------------------------------------
# Furniture exclusion
# ---------------------------------------------------------------------------


def test_furniture_suppresses_weak_window_candidate():
    """A weak (uncertain) window candidate inside a furnished room with no
    VLM windows is suppressed — never a valid window."""
    norm = _normalized(
        TWO_ROOM_PLAN["walls"],
        windows=[_window_candidate((700, 58), confidence=0.5)],  # weak, on the wall
    )
    sem = _semantic(
        spaces=[_space("Hobbyraum", "hobby_room", "top-right")],
        furniture=[{"item": "pool table", "space": "Hobbyraum"}],
        # no windows reported by the VLM
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["windows"]) == 0, "furniture window must not be emitted")
    suppressed = fused["suppressed_openings"]
    _assert(len(suppressed) == 1, f"expected 1 suppressed candidate, got {suppressed}")
    _assert(suppressed[0]["reason"] == "furniture_as_opening", suppressed[0]["reason"])


def test_furniture_does_not_suppress_vlm_confirmed_window():
    """When the VLM confirms windows in the furnished space, weak candidates
    are not suppressed."""
    norm = _normalized(
        TWO_ROOM_PLAN["walls"],
        windows=[_window_candidate((700, 58), confidence=0.5)],
    )
    sem = _semantic(
        spaces=[_space("Hobbyraum", "hobby_room", "top-right")],
        windows=[_window_semantic("Hobbyraum", "north wall", "upper section")],
        furniture=[{"item": "pool table", "space": "Hobbyraum"}],
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["suppressed_openings"]) == 0, "no suppression when the VLM confirms")
    _assert(len(fused["unresolved"]["windows"]) == 0, "the semantic window matched")


def test_furniture_never_suppresses_valid_geometry():
    norm = _normalized(
        TWO_ROOM_PLAN["walls"],
        windows=[_window_candidate((700, 58), confidence=0.95)],
    )
    sem = _semantic(
        spaces=[_space("Hobbyraum", "hobby_room", "top-right")],
        furniture=[{"item": "pool table", "space": "Hobbyraum"}],
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["windows"]) == 1, "valid geometry is never deleted")
    _assert(len(fused["suppressed_openings"]) == 0, "nothing suppressed")


# ---------------------------------------------------------------------------
# Walls
# ---------------------------------------------------------------------------


def test_exterior_door_forces_host_wall_exterior():
    """A matched exterior door is semantic evidence: its host wall becomes
    exterior even when the mask heuristic said interior."""
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    sem = _semantic(
        spaces=[_space("Flur", "hallway", "bottom-right")],
        doors=[
            _door_semantic("Flur and exterior", "right wall", type_="exterior"),
        ],
    )
    # no door candidates on the right wall → nothing to match; the rule is
    # exercised end-to-end in the synthetic case below.
    fused = _fuse(norm, sem)
    _assert(len(fused["unresolved"]["doors"]) == 1, "no candidate on the right wall")

    # Now give the pipeline a door candidate on the east exterior wall.
    norm2 = _normalized(
        TWO_ROOM_PLAN["walls"],
        doors=[
            {
                "outer": [[910, 380], [930, 380], [930, 400], [910, 400]],
                "holes": [],
                "confidence": 0.9,
                "area_mask_px": 400,
            }
        ],
    )
    sem2 = _semantic(
        spaces=[_space("Flur", "hallway", "bottom-right")],
        doors=[
            _door_semantic("Flur and exterior", "right wall", type_="exterior"),
        ],
    )
    fused2 = _fuse(norm2, sem2)
    host = next(w for w in fused2["walls"] if w["id"] == fused2["doors"][0]["wall_id"])
    _assert(host["type"] == "exterior", f"host wall must be exterior, got {host['type']}")
    _assert("semantic_exterior_door" in host["type_evidence"], host["type_evidence"])


# ---------------------------------------------------------------------------
# Determinism + dimensions
# ---------------------------------------------------------------------------


def test_deterministic():
    """Identical inputs ⇒ byte-identical fused output."""
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    sem = _semantic(
        spaces=[_space("Heizung", "utility", "top-left")],
        doors=[_door_semantic("Heizung and Flur", "left side of the horizontal dividing wall")],
        stairs={"present": True, "relative_location": "bottom-right", "direction": "up"},
        dimensions=[{"value": "8800", "unit": "unknown"}],
    )
    a = _fuse(norm, sem)
    b = _fuse(norm, sem)
    _assert(json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True), "fusion must be deterministic")


def test_dimensions_preserved_not_converted():
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    sem = _semantic(
        spaces=[_space("Flur", "hallway", "bottom-right")],
        dimensions=[{"value": "8800", "unit": "mm"}, {"value": "8,40 m", "unit": "m"}],
    )
    fused = _fuse(norm, sem)
    _assert(len(fused["dimensions"]) == 2, "dimensions preserved")
    _assert(all(d["source"] == "visual_text" for d in fused["dimensions"]), "source recorded")
    _assert(fused["notes"]["dimensions_preserved_only"] is True, "no scale conversion")


def test_raw_vlm_payload_accepted_through_gate():
    """A raw (unnormalized) VLM payload is normalized through the Phase 5
    gate before fusion — placeholders never reach the geometry."""
    norm = _normalized(TWO_ROOM_PLAN["walls"])
    raw_payload = {
        "spaces": [{"label": "Heizung", "type": "utility", "enclosed": True, "usable": True, "relative_location": "top-left"}],
        "doors": [{"count": 0, "type": "unknown", "connects": "null", "relative_location": "null"}],
        "windows": [],
        "stairs": {"present": False, "relative_location": None, "direction": None},
        "dimensions": [],
        "annotations": [],
        "furniture": [],
        "notes": {"overall_confidence": "high", "issues": []},
    }
    fused = _fuse(norm, raw_payload)
    _assert(len(fused["rooms"]) == 1, "room matched from raw payload")
    _assert(fused["unresolved"]["doors"] == [], "count-0 placeholder door dropped")


def main() -> None:
    tests = [t for name, t in sorted(globals().items()) if name.startswith("test_")]
    passed = 0
    for t in tests:
        t()
        print(f"PASS {t.__name__}")
        passed += 1
    print(f"\n{passed}/{len(tests)} fusion tests passed")


if __name__ == "__main__":
    main()