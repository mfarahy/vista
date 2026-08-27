"""Metrics tests: counts, validity, detection vs ground truth."""

from __future__ import annotations

from geometry_ai.metrics import GroundTruth, compute_metrics
from geometry_ai.schema import Point, Stair

from conftest import make_geometry


def _gt(**kwargs) -> GroundTruth:
    return GroundTruth.model_validate(kwargs)


def test_metrics_no_gt_reports_counts_only():
    m = compute_metrics(make_geometry(), ground_truth=None)
    assert m["geometry_valid"] is True
    assert m["counts"]["walls"] == 5
    assert m["counts"]["rooms"] == 2
    assert m["counts"]["doors"] == 1
    assert m["counts"]["windows"] == 1
    assert "doors" not in m  # no detection section without GT
    assert "summary" not in m


def test_metrics_invalid_geometry():
    g = make_geometry()
    g.doors[0].wall_id = "nope"
    m = compute_metrics(g, ground_truth=None)
    assert m["geometry_valid"] is False
    assert m["validation_errors"]


def test_metrics_perfect_vs_gt():
    """Prediction identical to GT → everything detected, nothing missing."""
    p = make_geometry()
    gt_doc = _gt(
        walls=[w.model_dump() for w in p.walls],
        rooms=[r.model_dump() for r in p.rooms],
        doors=[d.model_dump() for d in p.doors],
        windows=[w.model_dump() for w in p.windows],
    )
    m = compute_metrics(p, gt_doc)
    assert m["geometry_valid"] is True
    assert m["walls"]["detected"] == [w.id for w in p.walls]
    assert m["walls"]["missing"] == []
    assert m["doors"]["detected"] == ["d-1"]
    assert m["doors"]["missing"] == []
    assert m["doors"]["false_positive"] == []
    assert m["windows"]["detected"] == ["win-1"]
    assert m["rooms"]["mean_polygon_iou"] > 0.99
    assert m["summary"]["missing_count"] == 0


def test_metrics_missing_and_fp():
    """GT doors far from any prediction → 2 missing, prediction is FP."""
    p = make_geometry()
    gt_doc = _gt(
        doors=[
            {"id": "d-x", "position": {"x": 500, "y": 500}, "width": 30},
            {"id": "d-y", "position": {"x": 600, "y": 600}, "width": 30},
        ]
    )
    m = compute_metrics(p, gt_doc)
    assert sorted(m["doors"]["missing"]) == ["d-x", "d-y"]
    assert m["doors"]["false_positive"] == ["d-1"]
    assert m["doors"]["detected"] == []
    assert m["summary"]["missing_count"] == 2
    # door FP (1) + window FP (GT has no windows) = 2
    assert m["summary"]["false_positive_count"] == 2


def test_metrics_wall_proximity():
    p = make_geometry()
    gt_doc = _gt(walls=[w.model_dump() for w in p.walls])
    m = compute_metrics(p, gt_doc)
    assert m["walls"]["detected"] == [w.id for w in p.walls]
    assert m["walls"]["missing"] == []
    assert m["walls"]["false_positive"] == []


def test_metrics_room_iou_zero_for_different_layout():
    p = make_geometry()
    gt_doc = _gt(
        rooms=[
            {
                "id": "r-far",
                "polygon": [
                    {"x": 900, "y": 900},
                    {"x": 910, "y": 900},
                    {"x": 910, "y": 910},
                    {"x": 900, "y": 910},
                ],
            }
        ]
    )
    m = compute_metrics(p, gt_doc)
    assert m["rooms"]["missing"] == ["r-far"]
    assert m["rooms"]["false_positive"] == ["r-l", "r-r"]
    assert m["rooms"]["mean_polygon_iou"] == 0.0


def test_metrics_stairs():
    p = make_geometry()
    p.stairs = [
        Stair(
            id="s-1",
            region=[Point(x=30, y=90), Point(x=60, y=90), Point(x=60, y=130), Point(x=30, y=130)],
        )
    ]
    gt_doc = _gt(
        stairs=[
            {
                "id": "s-gt",
                "region": [{"x": 33, "y": 93}, {"x": 63, "y": 93}, {"x": 63, "y": 133}, {"x": 33, "y": 133}],
            }
        ]
    )
    m = compute_metrics(p, gt_doc)
    assert m["stairs"]["detected"] == ["s-1"]
    assert m["stairs"]["missing"] == []