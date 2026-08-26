"""Phase 2+3 evaluation harness: run real inference across the fixtures.

For every fixture this writes:

    output/<name>.raw.json       — the full model document (raw + normalized)
    output/<name>.normalized.json — just the normalized geometry document
    output/<name>.debug.png      — source | predicted mask | raw overlay |
                                   normalized overlay
    output/evaluation-summary.md — compact per-image comparison table

Run:  python -m geometry_ai.evaluate [--output OUTPUT] [--device cpu]
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from pathlib import Path

from .extract import GeometryInference
from .labels import CLASS_COLORS
from .preprocess import load_source_rgb
from .visualize import (
    colorize_mask,
    draw_doors_windows_on,
    draw_polygons_on,
    draw_rooms_on,
    draw_walls_on,
    hconcat,
)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--fixtures", type=Path, default=Path(__file__).resolve().parent.parent / "fixtures")
    p.add_argument("--weights", type=Path, default=Path(__file__).resolve().parent.parent / "weights")
    p.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "output")
    p.add_argument("--device", default=None)
    args = p.parse_args()

    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    inf = GeometryInference(args.weights, device=args.device or None)

    images = sorted(args.fixtures.glob("*.png"))
    rows: list[dict] = []
    for img_path in images:
        print(f"\n=== {img_path.name} ===")
        image_bytes = img_path.read_bytes()
        t_start = time.perf_counter()
        result = inf.run(image_bytes)
        wall_clock_ms = round((time.perf_counter() - t_start) * 1000, 1)
        result["timing_ms"]["wall_clock"] = wall_clock_ms

        (out / f"{img_path.stem}.raw.json").write_text(json.dumps(result, indent=2))
        (out / f"{img_path.stem}.normalized.json").write_text(
            json.dumps(result["normalized"], indent=2)
        )
        _render_debug(img_path, image_bytes, result, inf, out)
        print(
            "raw:",
            result["raw"]["counts"],
            "| norm:",
            result["normalized"]["counts"],
            "| total_ms:",
            result["timing_ms"],
        )
        rows.append(_summarize(img_path, result))

    _write_summary(out, rows)
    print(f"\nDone. Output in {out}")


def _render_debug(
    img_path: Path, image_bytes: bytes, result: dict, inf: GeometryInference, out: Path
) -> None:
    source = load_source_rgb(image_bytes)
    max_side = 640
    if max(source.size) > max_side:
        k = max_side / max(source.size)
        source = source.resize((max(1, int(source.width * k)), max(1, int(source.height * k))))

    mask, _, content_rect, _, _, _ = inf._infer(image_bytes)
    mask_colored = colorize_mask(mask).resize(source.size)

    poly_colors = {k: CLASS_COLORS[k] for k in result["raw"]["polygons"]}

    raw_overlay = draw_polygons_on(source, result["raw"]["polygons"], poly_colors)
    raw_overlay = draw_walls_on(raw_overlay, result["raw"]["walls"])
    raw_overlay = draw_rooms_on(raw_overlay, result["raw"]["floor_regions"])

    norm = result["normalized"]
    norm_overlay = draw_walls_on(source, norm["walls"])
    norm_overlay = draw_rooms_on(norm_overlay, norm["rooms"])
    norm_overlay = draw_doors_windows_on(norm_overlay, norm["doors"], norm["windows"], norm["walls"])

    panel = hconcat(
        [source, mask_colored, raw_overlay, norm_overlay],
        [img_path.name, "predicted mask", "AI raw", "normalized"],
    )
    panel.save(out / f"{img_path.stem}.debug.png")


def _summarize(img_path: Path, result: dict) -> dict:
    raw = result["raw"]
    norm = result["normalized"]
    timing = result["timing_ms"]
    rw = raw["walls"]
    nw = norm["walls"]
    rr = raw["floor_regions"]
    nr = norm["rooms"]
    return {
        "file": img_path.name,
        "w": result["input"]["width"],
        "h": result["input"]["height"],
        "total_ms": timing["total"],
        "preprocess_ms": timing["preprocess"],
        "inference_ms": timing["inference"],
        "postprocess_ms": timing["postprocess"],
        "normalize_ms": timing.get("normalize"),
        # raw
        "raw_walls": len(rw),
        "raw_walls_exterior": sum(1 for w in rw if w["type"] == "exterior"),
        "raw_rooms": len(rr),
        "raw_doors": len(raw["polygons"]["door"]),
        "raw_windows": len(raw["polygons"]["window"]),
        "raw_wall_conf": round(sum(w["confidence"] for w in rw) / len(rw), 3) if rw else None,
        # normalized
        "norm_walls": len(nw),
        "norm_walls_exterior": sum(1 for w in nw if w["type"] == "exterior"),
        "norm_rooms": len(nr),
        "norm_doors": len(norm["doors"]),
        "norm_windows": len(norm["windows"]),
        "norm_wall_conf": (
            round(sum(w["confidence"] for w in nw) / len(nw), 3) if nw else None
        ),
        "norm_rooms_rejected": norm["notes"].get("rooms_rejected"),
        "rejected_doors": norm["notes"].get("openings_rejected", {}).get("door"),
        "rejected_windows": norm["notes"].get("openings_rejected", {}).get("window"),
    }


def _write_summary(out: Path, rows: list[dict]) -> None:
    lines = [
        "# Geometry AI — inference summary (Phase 2 raw + Phase 3 normalized)",
        "",
        f"- Hardware: {platform.node()} · {platform.processor()} · Python {platform.python_version()}",
        "- Device: CPU",
        "",
        "| Fixture | size | total(ms) | raw walls | norm walls | raw rooms | norm rooms | "
        "raw doors | norm doors | raw win | norm win | wall conf raw/norm |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            "| {file} | {w}×{h} | {total_ms} | {raw_walls} | {norm_walls} | {raw_rooms} | "
            "{norm_rooms} | {raw_doors} | {norm_doors} | {raw_windows} | {norm_windows} | "
            "{raw_wall_conf}/{norm_wall_conf} |".format(**r)
        )
    (out / "evaluation-summary.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()