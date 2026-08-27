"""Benchmark runner for geo2.

Command:

    python -m evaluation.run --provider baseline-mock --output output

For every fixture image in the manifest this produces, under
`output/<provider>/<fixture>/`:

    result.json   — image, provider, success, latency_ms, validation_errors,
                    estimated_cost_usd (null for local models)
    overlay.png   — geometry overlay on the source image (only when valid)
    metrics.json  — structural metrics (counts + validity, plus detection
                    against ground truth when a GT document exists)

plus `output/<provider>/summary.json` and `output/<provider>/summary.md`.

The runner is model-agnostic: it only talks to the `FloorPlanProvider`
interface, so any future provider (specialised CV / VLM / open multimodal /
external API / hybrid) is benchmarked with the exact same path:

    provider → FloorPlanGeometry → validator → metrics → overlay
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional

from geometry_ai.metrics import compute_metrics, GroundTruth
from geometry_ai.pipeline import analyze_image, load_image
from geometry_ai.providers import available_providers, get_provider, provider_licensing
from geometry_ai.visualize import render_overlay
from geometry_ai import __version__ as GEO2_VERSION

from .manifest import (
    FIXTURES,
    fixture_by_name,
    fixture_image_path,
    fixture_ground_truth_path,
    load_ground_truth,
    manifest,
)


def _write_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")


def run_fixture(provider_id: str, fx_name: str, output_dir: Path) -> dict:
    fx = fixture_by_name(fx_name)
    provider = get_provider(provider_id)
    image = load_image(fixture_image_path(fx))

    result = analyze_image(image, provider, image_path=fx.image)
    out_dir = output_dir / provider_id / fx.name
    out_dir.mkdir(parents=True, exist_ok=True)

    geo = result.geometry
    gt: Optional[GroundTruth] = load_ground_truth(fx)

    entry: dict = {
        "fixture": fx.name,
        "image": fx.image,
        "provider_name": result.provider_name,
        "success": result.success,
        "latency_ms": round(result.latency_ms, 3),
        "validation_errors": result.validation_errors,
        "estimated_cost_usd": None,
        "ground_truth": bool(gt),
        "ground_truth_quality": fx.gt_quality,
    }

    if result.success and geo is not None:
        metrics = compute_metrics(geo, gt)
        _write_json(geo.model_dump(), out_dir / "result.json")
        render_overlay(image, geo, out_dir / "overlay.png")
        entry["metrics"] = metrics
        entry["geometry_keys"] = list(geo.model_dump().keys())
    else:
        # record the failure visibly; keep result.json so invalid output is not lost
        if geo is not None:
            _write_json(geo.model_dump(), out_dir / "result.json")
            metrics = compute_metrics(geo, gt)
            entry["metrics"] = metrics
        else:
            entry["metrics"] = {"geometry_valid": "n/a - no geometry returned"}

    _write_json(entry, out_dir / "metrics.json")
    return entry


def run_benchmark(provider_id: str, output_dir: Path, names: Optional[list[str]] = None) -> list[dict]:
    fixtures = names or [f.name for f in manifest()]
    entries = [run_fixture(provider_id, name, output_dir) for name in fixtures]

    summary = {
        "schema": "geo2-benchmark-v1",
        "geo2_version": GEO2_VERSION,
        "provider": provider_id,
        "fixture_count": len(entries),
        "success_count": sum(1 for e in entries if e["success"]),
        "mean_latency_ms": round(
            sum(e["latency_ms"] for e in entries) / len(entries), 3
        ) if entries else None,
        "estimated_cost_usd": [e["estimated_cost_usd"] for e in entries],
        "results": [
            {
                "name": e["fixture"],
                "success": e["success"],
                "latency_ms": e["latency_ms"],
                "validation_errors": e["validation_errors"],
                "counts": {
                    k: v for k, v in e.get("metrics", {}).get("counts", {}).items()
                }
                if e.get("metrics")
                else None,
                "summary": e.get("metrics", {}).get("summary"),
            }
            for e in entries
        ],
    }
    out = Path(output_dir) / provider_id
    _write_json(summary, out / "summary.json")
    _write_markdown(summary, out / "summary.md")
    return entries


def _write_markdown(summary: dict, path: Path) -> None:
    rows = []
    for f in summary["results"]:
        rows.append(
            f"| {f['name']} | {f['success']} | {f['latency_ms']:.1f} ms | "
            f"{f['counts']} | {f['summary'] if f['summary'] else '-'} |"
        )
    md = f"""# geo2 benchmark — provider `{summary['provider']}`

- schema: `{summary['schema']}`
- geo2 version: `{summary['geo2_version']}`
- fixtures: {summary['success_count']}/{summary['fixture_count']} success
- mean latency: {summary['mean_latency_ms']} ms
- estimated cost (USD): {summary['estimated_cost_usd']}

| fixture | success | latency | counts | detection summary |
|---|---|---|---|---|
{chr(10).join(rows)}
"""
    path.write_text(md, encoding="utf-8")


def provider_licensing_json(provider_id: str) -> dict:
    lic = provider_licensing(provider_id)
    return lic.model_dump()


def main(argv: Optional[list[str]] = None) -> None:
    p = argparse.ArgumentParser(description="geo2 benchmark runner")
    p.add_argument("--provider", default="baseline-mock", help="provider id (see --list-providers)")
    p.add_argument("--output", default=Path(__file__).resolve().parent.parent / "output")
    p.add_argument(
        "--fixtures",
        nargs="*",
        default=None,
        help="limit to named fixtures (default: all in manifest)",
    )
    p.add_argument("--list-providers", action="store_true", help="print available providers and exit")
    args = p.parse_args(argv)

    if args.list_providers:
        for pid in available_providers():
            lic = provider_licensing_json(pid)
            print(f"{pid}: {lic['inference_requirements']} (license {lic['license']})")
        return

    entries = run_benchmark(args.provider, Path(args.output), args.fixtures)
    print(f"finished: {len(entries)} fixtures under {Path(args.output) / args.provider}")


if __name__ == "__main__":
    main()