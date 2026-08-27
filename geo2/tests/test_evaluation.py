"""Evaluation harness tests: manifest + benchmark output files."""

from __future__ import annotations

import json

from evaluation.manifest import fixture_image_path, manifest
from evaluation.run import run_benchmark


def test_manifest_has_multiple_visual_variants():
    names = [f.name for f in manifest()]
    assert len(names) >= 6
    # several visually different plans required (not just one image)
    kinds = {f.image.split("-")[0] for f in manifest()}
    assert len(kinds) >= 4
    for f in manifest():
        assert fixture_image_path(f).exists(), f"missing fixture image {f.image}"


def test_manifest_ground_truth_files_exist():
    gt = [f for f in manifest() if f.ground_truth]
    assert gt, "expected at least one ground-truth fixture"
    from evaluation.manifest import fixture_ground_truth_path, load_ground_truth

    for f in gt:
        assert fixture_ground_truth_path(f).exists()
        gt_doc = load_ground_truth(f)
        assert gt_doc is not None
        assert gt_doc.version == "geo2-gt-v1"


def test_benchmark_outputs_per_fixture(tmp_path):
    entries = run_benchmark("baseline-mock", tmp_path, names=["06-basement"])
    assert len(entries) == 1
    e = entries[0]
    assert e["fixture"] == "06-basement"
    assert e["provider_name"] == "baseline-mock"
    assert e["success"] is True
    assert e["latency_ms"] >= 0.0
    assert e["estimated_cost_usd"] is None

    out_dir = tmp_path / "baseline-mock" / "06-basement"
    for fname in ("result.json", "overlay.png", "metrics.json"):
        assert (out_dir / fname).exists(), f"missing {fname}"

    summary = json.loads((tmp_path / "baseline-mock" / "summary.json").read_text())
    assert summary["success_count"] == 1
    assert summary["provider"] == "baseline-mock"
    assert summary["geo2_version"].startswith("0.1")


def test_benchmark_with_ground_truth_metrics(tmp_path):
    entries = run_benchmark("baseline-mock", tmp_path, names=["06-basement"])
    metrics = entries[0]["metrics"]
    assert metrics["geometry_valid"] is True
    assert "doors" in metrics  # GT present → detection sections exist
    assert "stairs" in metrics
    assert "summary" in metrics
    assert metrics["counts"]["walls"] >= 4


def test_benchmark_failure_recorded(tmp_path):
    # a fixture with no GT and the baseline: counts + validity only
    entries = run_benchmark("baseline-mock", tmp_path, names=["07-basement-real"])
    metrics = entries[0]["metrics"]
    assert metrics["geometry_valid"] is True
    assert "doors" not in metrics  # no GT → no detection section
    assert "summary" not in metrics