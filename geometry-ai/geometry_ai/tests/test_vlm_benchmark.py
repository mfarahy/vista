"""Weight-free tests for the Phase 5 VLM benchmark harness: the strict-schema
validation gate and the documented normalization of raw model output.

Run:  python -m geometry_ai.tests.test_vlm_benchmark
"""

from __future__ import annotations

from ..vlm_benchmark import normalize, validate


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)
    return True


def _payload(**overrides) -> dict:
    base = {
        "spaces": [{"label": "Flur", "type": "hallway", "enclosed": True, "usable": True, "relative_location": "centre"}],
        "doors": [],
        "windows": [],
        "stairs": {"present": False, "relative_location": None, "direction": None},
        "dimensions": [],
        "annotations": [],
        "furniture": [],
        "notes": {"overall_confidence": "high", "issues": []},
    }
    base.update(overrides)
    return base


def test_valid_payload_passes():
    result = validate(_payload())
    _assert(result["ok"], "clean payload must validate")
    _assert(result["errors"] == [], "no errors on clean payload")


def test_missing_required_field_is_caught():
    payload = _payload()
    del payload["stairs"]
    result = validate(payload)
    _assert(not result["ok"], "missing stairs must fail")
    _assert(any("stairs" in e for e in result["errors"]), "error names the field")


def test_invalid_room_type_is_caught():
    payload = _payload(spaces=[{"label": "Foo", "type": "banana", "enclosed": True, "usable": True, "relative_location": "centre"}])
    result = validate(payload)
    _assert(not result["ok"], "out-of-enum room type must fail")


def test_count_zero_placeholder_rows_are_rejected():
    payload = _payload(doors=[{"count": 0, "type": "unknown", "connects": "null", "relative_location": "null"}])
    result = validate(payload)
    _assert(not result["ok"], "count-0 placeholder rows must be flagged")


def test_normalize_drops_placeholder_rows():
    payload = _payload(
        doors=[
            {"count": 0, "type": "unknown", "connects": "null", "relative_location": "null"},
            {"count": 2, "type": "interior", "connects": "Heizung to Flur", "relative_location": "centre"},
        ],
        windows=[{"count": 0, "space": None, "wall": "unknown", "relative_location": "unknown"}],
        dimensions=[{"value": "null", "unit": "unknown"}, {"value": "8800", "unit": "mm"}],
        annotations=[{"text": "null", "kind": "note"}],
        spaces=[{"label": "null", "type": "unknown", "enclosed": True, "usable": True, "relative_location": "top-left"}],
        stairs={"present": False, "relative_location": "null", "direction": "unknown"},
    )
    normalized = normalize(payload)
    _assert(len(normalized["doors"]) == 1, "count-0 door rows are dropped")
    _assert(normalized["doors"][0]["count"] == 2, "real door kept")
    _assert(normalized["doors"][0]["connects"] == "Heizung to Flur", "real connects kept")
    _assert(len(normalized["windows"]) == 0, "count-0 window rows are dropped")
    _assert(len(normalized["dimensions"]) == 1, "'null' dimension values are dropped")
    _assert(len(normalized["annotations"]) == 0, "'null' annotation text is dropped")
    _assert(normalized["spaces"][0]["label"] is None, "'null' string label maps to None")
    _assert(normalized["stairs"]["relative_location"] is None, "stairs 'null' maps to None")
    _assert(normalized["stairs"]["direction"] is None, "stairs 'unknown' maps to None")


def test_normalize_keeps_null_real_values():
    payload = _payload(spaces=[{"label": None, "type": "unknown", "enclosed": True, "usable": True, "relative_location": "bottom-left"}])
    normalized = normalize(payload)
    _assert(normalized["spaces"][0]["label"] is None, "JSON null stays None")
    _assert(normalized["spaces"][0]["type"] == "unknown", "type preserved")


def main() -> None:
    tests = [t for name, t in sorted(globals().items()) if name.startswith("test_")]
    for t in tests:
        t()
        print(f"PASS {t.__name__}")
    print(f"\n{len(tests)}/{len(tests)} vlm benchmark tests passed")


if __name__ == "__main__":
    main()