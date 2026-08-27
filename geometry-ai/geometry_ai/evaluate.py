"""Phase 2+3+4+6 evaluation harness: run real inference across the fixtures.

For every fixture this writes:

    output/<name>.raw.json       — the full model document (raw + normalized)
    output/<name>.normalized.json — just the normalized geometry document
    output/<name>.candidates.json — Phase 4 candidate/debug document (accepted,
                                    ambiguous and rejected entities with reasons)
    output/<name>.debug.png      — source | predicted mask | raw overlay |
                                   normalized overlay
    output/evaluation-summary.md — compact per-image comparison table

Phase 6 adds the semantic fusion pass over the *saved Phase 5 VLM responses*
(no new API calls): when `output/phase5/responses/<name>.gpt-5.6-luna.json`
(or the gpt-4o-mini fallback) exists, the same normalized geometry is fused
with the validated VLM semantics and written to:

    output/phase6/<name>.fused.json — the fused document (rooms/doors/windows/
                                      stairs, unresolved candidates, provenance)
    output/phase6/<name>.fusion.png — source | normalized | fused overlay
    output/phase6/fusion-summary.md — Phase 6 comparison table

Run:  python -m geometry_ai.evaluate [--output OUTPUT] [--device cpu]
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from pathlib import Path

from .extract import GeometryInference
from .fusion import fuse
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

FUSION_MODELS = ("gpt-5.6-luna", "gpt-4o-mini")


def _find_semantic_response(stem: str, phase5: Path) -> tuple[Path | None, str | None]:
    for model in FUSION_MODELS:
        p = phase5 / "responses" / f"{stem}.{model}.json"
        if p.exists():
            return p, model
    return None, None


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--fixtures", type=Path, default=Path(__file__).resolve().parent.parent / "fixtures")
    p.add_argument("--weights", type=Path, default=Path(__file__).resolve().parent.parent / "weights")
    p.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "output")
    p.add_argument("--device", default=None)
    args = p.parse_args()

    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    phase5 = out / "phase5"
    phase6 = out / "phase6"
    phase6.mkdir(parents=True, exist_ok=True)
    inf = GeometryInference(args.weights, device=args.device or None)

    images = sorted(args.fixtures.glob("*.png")) + sorted(args.fixtures.glob("*.jpg"))
    rows: list[dict] = []
    fused_rows: list[dict] = []
    for img_path in images:
        print(f"\n=== {img_path.name} ===")
        image_bytes = img_path.read_bytes()
        t_start = time.perf_counter()
        result = inf.run(image_bytes)
        wall_clock_ms = round((time.perf_counter() - t_start) * 1000, 1)
        result["timing_ms"]["wall_clock"] = wall_clock_ms

        (out / f"{img_path.stem}.raw.json").write_text(
            json.dumps(result, indent=2), encoding="utf-8"
        )
        (out / f"{img_path.stem}.normalized.json").write_text(
            json.dumps(result["normalized"], indent=2), encoding="utf-8"
        )
        (out / f"{img_path.stem}.candidates.json").write_text(
            json.dumps(result["normalized"].get("candidates", {}), indent=2),
            encoding="utf-8",
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
        row = _summarize(img_path, result)
        rows.append(row)

        resp_path, model = _find_semantic_response(img_path.stem, phase5)
        if resp_path is not None:
            resp = json.loads(resp_path.read_text(encoding="utf-8"))
            semantic = resp.get("normalized") or resp.get("payload") or {}
            fused_doc = fuse(
                result["normalized"],
                semantic,
                src_w=result["input"]["width"],
                src_h=result["input"]["height"],
            )
            (phase6 / f"{img_path.stem}.fused.json").write_text(
                json.dumps(fused_doc, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            _render_fusion(img_path, image_bytes, result, fused_doc, phase6)
            fused_rows.append(_summarize_fusion(img_path, fused_doc, model))
            print(
                "fused:",
                fused_doc["counts"],
                "| unresolved:",
                {k: len(v) for k, v in fused_doc["unresolved"].items()},
            )

    _write_summary(out, rows)
    _write_fusion_summary(phase6, fused_rows)
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


def _render_fusion(
    img_path: Path, image_bytes: bytes, result: dict, fused: dict, out: Path
) -> None:
    """Phase 6 overlay: normalized | fused rooms with labels + openings + stairs."""
    source = load_source_rgb(image_bytes)
    max_side = 640
    if max(source.size) > max_side:
        k = max_side / max(source.size)
        source = source.resize((max(1, int(source.width * k)), max(1, int(source.height * k))))

    norm = result["normalized"]
    norm_overlay = draw_walls_on(source, norm["walls"])
    norm_overlay = draw_rooms_on(norm_overlay, norm["rooms"])
    norm_overlay = draw_doors_windows_on(norm_overlay, norm["doors"], norm["windows"], norm["walls"])

    from PIL import Image, ImageDraw, ImageFont

    fused_overlay = draw_walls_on(source, fused["walls"])
    draw = ImageDraw.Draw(fused_overlay)
    for r in fused["rooms"]:
        pts = [(x, y) for x, y in r["polygon"]]
        if len(pts) >= 3:
            draw.polygon(pts, outline=(40, 170, 90), fill=(40, 170, 90, 0))
            draw.line(pts + [pts[0]], fill=(40, 170, 90), width=3)
        name = r.get("name") or f"({r.get('type')})"
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        draw.text((cx - 40, cy - 8), str(name), fill=(10, 90, 40))
    draw_doors_windows_on(fused_overlay, fused["doors"], fused["windows"], fused["walls"])
    for u in fused["unresolved"]["spaces"]:
        if u.get("label"):
            draw.text((30, 30), f"unresolved: {u['label']} ({u['reason']})", fill=(180, 40, 40))
    for s in fused["stairs"]:
        ax, ay = s["anchor"]
        draw.ellipse([ax - 8, ay - 8, ax + 8, ay + 8], outline=(150, 60, 200), width=3)
        draw.text((ax + 10, ay - 10), f"stairs {s.get('direction') or ''}", fill=(150, 60, 200))

    panel = hconcat(
        [norm_overlay, fused_overlay],
        ["normalized", "fused"],
    )
    panel.save(out / f"{img_path.stem}.fusion.png")


def _summarize_fusion(img_path: Path, fused: dict, model: str | None) -> dict:
    rooms = fused["rooms"]
    unresolved = fused["unresolved"]
    doors = fused["doors"]
    windows = fused["windows"]
    return {
        "file": img_path.name,
        "semantic_model": model or "none",
        "rooms_matched": len(rooms),
        "rooms_named": sum(1 for r in rooms if r.get("name")),
        "rooms_labeled": sum(1 for r in rooms if r.get("label")),
        "rooms_types": sorted({r.get("type", "unknown") for r in rooms}),
        "room_names": [r.get("name") for r in rooms],
        "rooms_unresolved": len(unresolved["spaces"]),
        "unresolved_reasons": _count_reasons(unresolved["spaces"]),
        "doors_matched": sum(1 for d in doors if d.get("semantic_match") is not False and "score" in d),
        "doors_geometric_only": sum(1 for d in doors if d.get("semantic_match") is False),
        "doors_total": len(doors),
        "doors_unresolved": len(unresolved["doors"]),
        "windows_matched": sum(1 for w in windows if w.get("semantic_match") is not False and "score" in w),
        "windows_geometric_only": sum(1 for w in windows if w.get("semantic_match") is False),
        "windows_total": len(windows),
        "windows_unresolved": len(unresolved["windows"]),
        "stairs": len(fused["stairs"]),
        "stairs_region": [s.get("region_label") for s in fused["stairs"]],
        "dimensions": len(fused["dimensions"]),
        "suppressed_openings": len(fused["suppressed_openings"]),
    }


def _count_reasons(entries: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for e in entries:
        reason = e.get("reason", "unknown")
        counts[reason] = counts.get(reason, 0) + 1
    return counts


def _write_fusion_summary(out: Path, rows: list[dict]) -> None:
    lines = [
        "# Phase 6 — Semantic geometry fusion summary",
        "",
        f"- Hardware: {platform.node()} · {platform.processor()} · Python {platform.python_version()}",
        "- Semantics: saved Phase 5 VLM responses (validation-gated), fused "
        "deterministically with the UNet normalization output of this run",
        "",
        "## Rooms",
        "",
        "| Fixture | semantic model | matched | named | unresolved | room names | unresolved reasons |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        reasons = ", ".join(f"{k}:{v}" for k, v in sorted(r["unresolved_reasons"].items())) or "—"
        names = ", ".join(str(n) for n in r["room_names"]) or "—"
        lines.append(
            "| {file} | {semantic_model} | {rooms_matched} | {rooms_named} | {rooms_unresolved} | "
            "{names} | {reasons} |".format(names=names, reasons=reasons, **r)
        )
    lines += [
        "",
        "## Doors / windows / stairs",
        "",
        "Doors/windows: `matched` = semantic observation selected a geometric candidate; ",
        "`kept` = valid UNet openings that no semantic observation claimed (never deleted, ",
        "marked geometric-only). `unresolved` = semantic observations with no geometric candidate.",
        "",
        "| Fixture | doors matched | doors kept (geo-only) | doors unresolved | windows matched | "
        "windows kept (geo-only) | windows unresolved | stairs | stairs region | dimensions | suppressed openings |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            "| {file} | {doors_matched} | {doors_geometric_only} | {doors_unresolved} | "
            "{windows_matched} | {windows_geometric_only} | {windows_unresolved} | "
            "{stairs} | {stairs_region} | {dimensions} | {suppressed_openings} |".format(**r)
        )
    (out / "fusion-summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _summarize(img_path: Path, result: dict) -> dict:
    raw = result["raw"]
    norm = result["normalized"]
    timing = result["timing_ms"]
    rw = raw["walls"]
    nw = norm["walls"]
    rr = raw["floor_regions"]
    nr = norm["rooms"]
    candidates = norm.get("candidates", {})
    open_cands = candidates.get("openings", {})
    room_cands = candidates.get("rooms", [])
    door_cands = open_cands.get("door", [])
    window_cands = open_cands.get("window", [])
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
        # Phase 4 candidate breakdown
        "rooms_accepted": sum(1 for c in room_cands if c["status"] == "accepted"),
        "rooms_rejected_cand": sum(1 for c in room_cands if c["status"] == "rejected"),
        "room_rejection_causes": norm["notes"].get("room_rejection_causes"),
        "door_candidates": len(door_cands),
        "door_valid": sum(1 for c in door_cands if c["status"] == "valid"),
        "door_uncertain": sum(1 for c in door_cands if c["status"] == "uncertain"),
        "door_invalid": sum(1 for c in door_cands if c["status"] == "invalid"),
        "window_candidates": len(window_cands),
        "window_valid": sum(1 for c in window_cands if c["status"] == "valid"),
        "window_uncertain": sum(1 for c in window_cands if c["status"] == "uncertain"),
        "window_invalid": sum(1 for c in window_cands if c["status"] == "invalid"),
        "ambiguous": len(candidates.get("ambiguous_opening_ids", [])),
        "rejected_doors": norm["notes"].get("openings_rejected", {}).get("door"),
        "rejected_windows": norm["notes"].get("openings_rejected", {}).get("window"),
    }


def _write_summary(out: Path, rows: list[dict]) -> None:
    lines = [
        "# Geometry AI — inference summary (Phase 2 raw · Phase 3 normalized · Phase 4 candidates)",
        "",
        f"- Hardware: {platform.node()} · {platform.processor()} · Python {platform.python_version()}",
        "- Device: CPU",
        "",
        "## Raw → normalized counts",
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
    lines += [
        "",
        "## Phase 4 candidate classification",
        "",
        "Room candidates: every bounded face is kept as a candidate with a status. "
        "Opening candidates are classified conservatively (`valid` / `uncertain` / "
        "`invalid`) and the rejected ones remain available for inspection.",
        "",
        "| Fixture | room cand (acc/adv) | room reasons | door cand (v/u/i) | window cand (v/u/i) | ambiguous |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        causes = r["room_rejection_causes"] or {}
        cause_str = ", ".join(f"{k}:{v}" for k, v in sorted(causes.items())) or "—"
        lines.append(
            "| {file} | {rooms_accepted}/{rooms_rejected_cand} | {cause_str} | "
            "{door_candidates} ({door_valid}/{door_uncertain}/{door_invalid}) | "
            "{window_candidates} ({window_valid}/{window_uncertain}/{window_invalid}) | "
            "{ambiguous} |".format(cause_str=cause_str, **r)
        )
    (out / "evaluation-summary.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()