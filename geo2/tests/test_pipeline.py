"""Pipeline tests: image loading, provider→validate→canonical JSON, latency."""

from __future__ import annotations

import time

import numpy as np

from geometry_ai.pipeline import analyze_image, analyze_path, load_image, to_json
from geometry_ai.providers.baseline import BaselineProvider
from geometry_ai.schema import FloorPlanGeometry


def test_load_image_rgb_path(tmp_path):
    from PIL import Image

    p = tmp_path / "plan.png"
    Image.new("RGB", (140, 100), (240, 240, 240)).save(p)
    arr = load_image(p)
    assert arr.ndim == 3
    assert arr.shape == (100, 140, 3)
    assert arr.dtype == np.uint8


class _InvalidProvider:
    id = "invalid-mock"

    def analyze(self, image):
        # returns pure dict garbage (not even the schema)
        return {"walls": "nope"}


class _DirtyProvider:
    id = "dirty-mock"

    def analyze(self, image):
        g = {
            "source": {"width": 200, "height": 150},
            "walls": [
                {"id": "w", "start": {"x": 0, "y": 0}, "end": {"x": 5, "y": 0}, "thickness": 1}
            ],
            "doors": [
                {"id": "d", "wall_id": "missing", "position": {"x": 10, "y": 10}, "width": 2}
            ],
            "rooms": [],
        }
        return FloorPlanGeometry.model_validate(g)


def test_pipeline_success(sample_image):
    res = analyze_image(sample_image, BaselineProvider())
    assert res.success is True
    assert isinstance(res.geometry, FloorPlanGeometry)
    assert res.validation_errors == []
    assert res.provider_name == "baseline-mock"
    assert res.latency_ms >= 0


def test_pipeline_rejects_non_schema(sample_image):
    res = analyze_image(sample_image, _InvalidProvider())
    assert res.success is False
    assert any("not FloorPlanGeometry" in e for e in res.validation_errors)


def test_pipeline_rejects_invalid_geometry(sample_image):
    res = analyze_image(sample_image, _DirtyProvider())
    assert res.success is False
    assert any("references unknown wall" in e for e in res.validation_errors)


def test_pipeline_records_latency(sample_image):
    start = time.perf_counter()
    res = analyze_image(sample_image, BaselineProvider())
    assert res.latency_ms < (time.perf_counter() - start) * 1000.0 + 5
    assert res.latency_ms >= 0


def test_analyze_path_with_real_fixture(tmp_path):
    from PIL import Image

    p = tmp_path / "plan.png"
    Image.new("RGB", (100, 80), (250, 250, 248)).save(p)
    res = analyze_path(p, BaselineProvider())
    assert res.success is True
    assert res.geometry is not None
    assert (res.geometry.source.width, res.geometry.source.height) == (100, 80)


def test_to_json_roundtrip(sample_image):
    from geometry_ai.schema import FloorPlanGeometry

    res = analyze_image(sample_image, BaselineProvider())
    raw = to_json(res.geometry)
    g2 = FloorPlanGeometry.model_validate_json(raw)
    assert g2 == res.geometry


def test_pipeline_result_dict_fields(sample_image):
    res = analyze_image(sample_image, BaselineProvider())
    d = res.to_dict()
    assert d["provider_name"] == "baseline-mock"
    assert d["success"] is True
    assert d["estimated_cost_usd"] is None
    assert "latency_ms" in d
    assert "geometry" in d