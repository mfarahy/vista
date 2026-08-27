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


def _write_native_artifacts(result, out_dir: Path) -> None:
    """Persist a provider's *native* model output (Phase 3 requirement).

    Specialized providers record what the model itself produced in
    `usage.raw["native_output"]` (e.g. class masks + contours). We write it to
    `native_output/native.json` and decode any embedded mask PNG to
    `native_output/native_mask.png` so the model output is never hidden behind
    the canonical adapter. Nothing is dropped or repaired here.
    """
    raw = (result.usage.raw or {}) if result.usage else {}
    native = raw.get("native_output")
    if not native:
        return
    ndir = out_dir / "native_output"
    ndir.mkdir(parents=True, exist_ok=True)
    (ndir / "native.json").write_text(
        json.dumps(native, indent=2, default=str), encoding="utf-8"
    )
    mask_b64 = native.get("mask_png_b64_source_space")
    if mask_b64:
        import base64

        (ndir / "native_mask.png").write_bytes(base64.b64decode(mask_b64))


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * p
    f = int(k)
    c = f + 1 if f + 1 < len(s) else f
    return s[f] + (s[c] - s[f]) * (k - f)


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
        "ground_truth": bool(gt),
        "ground_truth_quality": fx.gt_quality,
    }
    if result.usage is not None:
        entry.update(result.usage.to_dict())
    else:
        entry["estimated_cost_usd"] = None
        entry["cost_status"] = "n/a"

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
            render_overlay(image, geo, out_dir / "overlay.png")
            metrics = compute_metrics(geo, gt)
            entry["metrics"] = metrics
            entry["geometry_keys"] = list(geo.model_dump().keys())
        else:
            entry["metrics"] = {"geometry_valid": "n/a - no geometry returned"}

    _write_native_artifacts(result, out_dir)
    _write_json(entry, out_dir / "metrics.json")
    return entry


def _build_summary(provider_id: str, entries: list[dict]) -> dict:
    lat = [e["latency_ms"] for e in entries if e["latency_ms"] is not None]
    costs = [
        e["estimated_cost_usd"]
        for e in entries
        if e.get("estimated_cost_usd") is not None
    ]
    input_tokens = sum(e.get("input_tokens") or 0 for e in entries)
    output_tokens = sum(e.get("output_tokens") or 0 for e in entries)

    summary = {
        "schema": "geo2-benchmark-v1",
        "geo2_version": GEO2_VERSION,
        "provider": provider_id,
        "fixture_count": len(entries),
        "success_count": sum(1 for e in entries if e["success"]),
        "geometry_valid_count": sum(
            1
            for e in entries
            if e.get("metrics", {}).get("geometry_valid") is True
        ),
        "latency_ms": {
            "mean": round(sum(lat) / len(lat), 3) if lat else None,
            "median": round(_percentile(lat, 0.5), 3) if lat else None,
            "p95": round(_percentile(lat, 0.95), 3) if lat else None,
            "min": round(min(lat), 3) if lat else None,
            "max": round(max(lat), 3) if lat else None,
        },
        "cost_usd": {
            "total": round(sum(costs), 6) if costs else None,
            "mean_per_image": round(sum(costs) / len(costs), 6) if costs else None,
        },
        "tokens": {"input": input_tokens, "output": output_tokens},
        "results": [
            {
                "name": e["fixture"],
                "success": e["success"],
                "latency_ms": e["latency_ms"],
                "estimated_cost_usd": e.get("estimated_cost_usd"),
                "input_tokens": e.get("input_tokens"),
                "output_tokens": e.get("output_tokens"),
                "image_tokens": e.get("image_tokens"),
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
    return summary


def _write_summary_files(summary: dict, output_dir: Path) -> None:
    out = Path(output_dir) / summary["provider"]
    _write_json(summary, out / "summary.json")
    _write_markdown(summary, out / "summary.md")


def run_benchmark(provider_id: str, output_dir: Path, names: Optional[list[str]] = None) -> list[dict]:
    fixtures = names or [f.name for f in manifest()]
    entries = [run_fixture(provider_id, name, output_dir) for name in fixtures]
    summary = _build_summary(provider_id, entries)
    _write_summary_files(summary, output_dir)
    return entries


def collect_existing(provider_id: str, output_dir: Path) -> list[dict]:
    """Re-read already-produced per-fixture metrics.json for a provider."""
    out = Path(output_dir) / provider_id
    entries: list[dict] = []
    for mj in sorted(out.glob("*/metrics.json")):
        entries.append(json.loads(mj.read_text(encoding="utf-8")))
    return entries


def resume_benchmark(provider_id: str, output_dir: Path) -> list[dict]:
    """Run only fixtures without a persisted metric entry, then rebuild the summary."""
    done = {e["fixture"] for e in collect_existing(provider_id, output_dir)}
    for fx in manifest():
        if fx.name not in done:
            run_fixture(provider_id, fx.name, output_dir)
    entries = collect_existing(provider_id, output_dir)
    summary = _build_summary(provider_id, entries)
    _write_summary_files(summary, output_dir)
    print(f"resumed {provider_id}: {len(entries)} fixtures recorded")
    return entries


def _write_markdown(summary: dict, path: Path) -> None:
    rows = []
    for f in summary["results"]:
        rows.append(
            f"| {f['name']} | {f['success']} | {f['latency_ms']:.1f} ms | "
            f"{f['estimated_cost_usd'] if f['estimated_cost_usd'] is not None else '-'} | "
            f"{f['counts']} | {f['summary'] if f['summary'] else '-'} |"
        )
    latency = summary["latency_ms"]
    cost = summary["cost_usd"]
    md = f"""# geo2 benchmark — provider `{summary['provider']}`

- schema: `{summary['schema']}`
- geo2 version: `{summary['geo2_version']}`
- fixtures: {summary['success_count']}/{summary['fixture_count']} success
- geometry valid: {summary['geometry_valid_count']}/{summary['fixture_count']}
- latency (ms): mean {latency['mean']} / median {latency['median']} / p95 {latency['p95']}
- cost (USD): total {cost['total']} / per image {cost['mean_per_image']}
- tokens: {summary['tokens']['input']} in / {summary['tokens']['output']} out

| fixture | success | latency | cost | counts | detection summary |
|---|---|---|---|---|---|
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
    p.add_argument(
        "--resume",
        action="store_true",
        help="run only providers' fixtures without a persisted metric entry, then rebuild the summary",
    )
    args = p.parse_args(argv)

    if args.list_providers:
        for pid in available_providers():
            lic = provider_licensing_json(pid)
            print(f"{pid}: {lic['inference_requirements']} (license {lic['license']})")
        return

    if args.resume:
        resume_benchmark(args.provider, Path(args.output))
        return

    entries = run_benchmark(args.provider, Path(args.output), args.fixtures)
    print(f"finished: {len(entries)} fixtures under {Path(args.output) / args.provider}")


if __name__ == "__main__":
    main()