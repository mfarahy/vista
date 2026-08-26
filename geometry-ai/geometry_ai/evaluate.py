"""Phase 2 feasibility evaluation: run real inference across the fixtures.

For every fixture this writes:

    output/<name>.raw.json   — the full raw model output document
    output/<name>.debug.png  — side-by-side: source | predicted mask |
                               polygon overlay | wall centerlines
    output/evaluation-summary.md — compact per-image evaluation table

Run:  python -m geometry_ai.evaluate [--output OUTPUT] [--device cpu]
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from pathlib import Path

from PIL import Image

from .extract import GeometryInference
from .labels import CLASS_COLORS
from .preprocess import load_source_rgb
from .visualize import (
    colorize_mask,
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
        _render_debug(img_path, image_bytes, result, inf, out)
        print("counts:", result["counts"], "| total_ms:", result["timing_ms"])
        rows.append(_summarize(img_path, result))

    _write_summary(out, rows)
    print(f"\nDone. Output in {out}")


def _render_debug(img_path: Path, image_bytes: bytes, result: dict, inf: GeometryInference, out: Path) -> None:
    source = load_source_rgb(image_bytes)
    # Resize very large sources down for the side-by-side panel.
    max_side = 900
    if max(source.size) > max_side:
        k = max_side / max(source.size)
        source = source.resize((max(1, int(source.width * k)), max(1, int(source.height * k))))

    mask, _, content_rect, _, _, _ = inf._infer(image_bytes)
    mask_colored = colorize_mask(mask).resize(source.size)

    scale = source.size[0] / (result["content_rect"][2] or 1)
    poly_colors = {k: CLASS_COLORS[k] for k in result["polygons"]}

    overlay = draw_polygons_on(source, result["polygons"], poly_colors)
    overlay = draw_walls_on(overlay, result["walls"])
    overlay = draw_rooms_on(overlay, result["floor_regions"])

    panel = hconcat(
        [source, mask_colored, overlay],
        [img_path.name, "predicted mask", "polygons + walls + rooms"],
    )
    panel.save(out / f"{img_path.stem}.debug.png")


def _summarize(img_path: Path, result: dict) -> dict:
    walls = result["walls"]
    rooms = result["floor_regions"]
    timing = result["timing_ms"]
    return {
        "file": img_path.name,
        "w": result["input"]["width"],
        "h": result["input"]["height"],
        "total_ms": timing["total"],
        "preprocess_ms": timing["preprocess"],
        "inference_ms": timing["inference"],
        "postprocess_ms": timing["postprocess"],
        "walls": len(walls),
        "walls_exterior": sum(1 for w in walls if w["type"] == "exterior"),
        "rooms": len(rooms),
        "doors": len(result["polygons"]["door"]),
        "windows": len(result["polygons"]["window"]),
        "wall_conf_mean": round(
            sum(w["confidence"] for w in walls) / len(walls), 3
        )
        if walls
        else None,
        "room_conf_mean": round(
            sum(r["confidence"] for r in rooms) / len(rooms), 3
        )
        if rooms
        else None,
    }


def _write_summary(out: Path, rows: list[dict]) -> None:
    lines = [
        "# Geometry AI — feasibility inference summary",
        "",
        f"- Hardware: {platform.node()} · {platform.processor()} · Python {platform.python_version()}",
        f"- Device: CPU" ,
        "",
        "| Fixture | size | preproc(ms) | infer(ms) | post(ms) | total(ms) | walls (ext/int) | rooms | doors | windows | wall conf | room conf |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            "| {file} | {w}×{h} | {preprocess_ms} | {inference_ms} | {postprocess_ms} | "
            "{total_ms} | {walls} ({walls_exterior} ext) | {rooms} | {doors} | {windows} | "
            "{wall_conf_mean} | {room_conf_mean} |".format(**r)
        )
    (out / "evaluation-summary.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()