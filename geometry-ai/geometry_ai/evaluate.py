"""Phase 2+3+4+6+7 evaluation harness: run real inference across the fixtures.

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

When no saved Phase 5 response exists, the evaluation falls back to the
authored semantic documents in `fixtures/semantics/<name>.json` (derived from
the documented Phase 5 readings — identical structure, validation-gated).
Phase 7 adds the deterministic recovery pass whenever fusion runs:

    output/phase7/<name>.recovered.json — the fused + recovered document
    output/phase7/<name>.recovery.png   — normalized | fused | recovered overlay
    output/phase7/recovery-summary.md   — before/after comparison table

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
from .recovery import recover
from .visualize import (
    colorize_mask,
    draw_doors_windows_on,
    draw_polygons_on,
    draw_rooms_on,
    draw_walls_on,
    hconcat,
)

FUSION_MODELS = ("gpt-5.6-luna", "gpt-4o-mini")


def _find_semantic_source(stem: str, phase5: Path, fixtures: Path) -> tuple[Path | None, str | None]:
    """Locate a semantic document for a fixture.

    Prefers a saved Phase 5 VLM response (reproducible API run); falls back to
    the authored semantic documents in `fixtures/semantics/` (derived from the
    documented Phase 5 readings and validation-gated identically).
    """
    for model in FUSION_MODELS:
        p = phase5 / "responses" / f"{stem}.{model}.json"
        if p.exists():
            return p, model
    for p in (fixtures / "semantics").glob(f"{stem}.json"):
        return p, "authored-fixture-semantics"
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
    phase7 = out / "phase7"
    phase7.mkdir(parents=True, exist_ok=True)
    inf = GeometryInference(args.weights, device=args.device or None)

    images = sorted(args.fixtures.glob("*.png")) + sorted(args.fixtures.glob("*.jpg"))
    rows: list[dict] = []
    fused_rows: list[dict] = []
    recovery_rows: list[dict] = []
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

        resp_path, model = _find_semantic_source(img_path.stem, phase5, args.fixtures)
        if resp_path is not None:
            raw_resp = json.loads(resp_path.read_text(encoding="utf-8"))
            if model.startswith("authored"):
                semantic = raw_resp
            else:
                semantic = raw_resp.get("normalized") or raw_resp.get("payload") or {}
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

            recovered_doc = recover(
                result["normalized"],
                fused_doc,
                image_bytes,
                src_w=result["input"]["width"],
                src_h=result["input"]["height"],
            )
            (phase7 / f"{img_path.stem}.recovered.json").write_text(
                json.dumps(recovered_doc, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            _render_recovery(img_path, image_bytes, result, recovered_doc, phase7)
            recovery_rows.append(_summarize_recovery(img_path, fused_doc, recovered_doc, model))
            print(
                "recovered:",
                {k: v for k, v in recovered_doc["counts"].items() if k.startswith("recovered") or k.startswith("unresolved")},
            )

    _write_summary(out, rows)
    _write_fusion_summary(phase6, fused_rows)
    _write_recovery_summary(phase7, recovery_rows)
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

    from PIL import ImageDraw

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


def _render_recovery(
    img_path: Path, image_bytes: bytes, result: dict, recovered: dict, out: Path
) -> None:
    """Phase 7 overlay: normalized | fused | recovered (distinct orange marks).

    Recovered entities are drawn in a distinct colour so the improvement is
    visible by eye: turquoise/orange openings and a stair region box on top of
    the same geometry, instead of merely an increased count.
    """
    from PIL import ImageDraw

    source = load_source_rgb(image_bytes)
    max_side = 640
    if max(source.size) > max_side:
        k = max_side / max(source.size)
        source = source.resize((max(1, int(source.width * k)), max(1, int(source.height * k))))

    norm = result["normalized"]
    norm_overlay = draw_walls_on(source, norm["walls"])
    norm_overlay = draw_rooms_on(norm_overlay, norm["rooms"])
    norm_overlay = draw_doors_windows_on(norm_overlay, norm["doors"], norm["windows"], norm["walls"])

    fused = recovered.get("fused") or recovered  # recovered doc is the fused doc extended
    fused_overlay = draw_walls_on(source, fused["walls"])
    draw = ImageDraw.Draw(fused_overlay)
    for r in fused["rooms"]:
        pts = [(x, y) for x, y in r["polygon"]]
        if len(pts) >= 3:
            draw.polygon(pts, outline=(40, 170, 90), fill=(40, 170, 90, 0))
            draw.line(pts + [pts[0]], fill=(40, 170, 90), width=3)
    draw_doors_windows_on(fused_overlay, fused["doors"], fused["windows"], fused["walls"])

    rec_overlay = draw_walls_on(source, recovered["walls"])
    rd = ImageDraw.Draw(rec_overlay)
    for r in recovered["rooms"]:
        pts = [(x, y) for x, y in r["polygon"]]
        if len(pts) >= 3:
            draw.polygon(pts, outline=(40, 170, 90), fill=(40, 170, 90, 0))
            draw.line(pts + [pts[0]], fill=(40, 170, 90), width=3)
    walls_by_id = {w["id"]: w for w in recovered["walls"]}
    found_any = False

    def _point_along(start, end, f):
        return (start[0] + (end[0] - start[0]) * f, start[1] + (end[1] - start[1]) * f)

    for wnd in recovered["windows"]:
        wall = walls_by_id.get(wnd["wall_id"])
        if not wall or not wnd.get("recovery"):
            continue
        ln = math_hypot(wall)
        a = _point_along(wall["start"], wall["end"], max(0.0, wnd["position"] - wnd["width"] / 2 / ln))
        b = _point_along(wall["start"], wall["end"], min(1.0, wnd["position"] + wnd["width"] / 2 / ln))
        rd.line([a, b], fill=(255, 140, 0), width=12)
        found_any = True
    for dr in recovered["doors"]:
        wall = walls_by_id.get(dr["wall_id"])
        if not wall or not dr.get("recovery"):
            continue
        ln = math_hypot(wall)
        a = _point_along(wall["start"], wall["end"], max(0.0, dr["position"] - dr["width"] / 2 / ln))
        b = _point_along(wall["start"], wall["end"], min(1.0, dr["position"] + dr["width"] / 2 / ln))
        rd.line([a, b], fill=(255, 60, 60), width=10)
        found_any = True
    for s in recovered["stairs"]:
        if not s.get("recovery"):
            continue
        region = s.get("region") or {}
        if region:
            x0 = region["extent_x"][0]
            x1 = region["extent_x"][1]
            y0 = region["extent_y"][0]
            y1 = region["extent_y"][1]
            rd.rectangle([x0, y0, x1, y1], outline=(200, 60, 200), width=3)
        else:
            ax, ay = s["anchor"]
            rd.ellipse([ax - 10, ay - 10, ax + 10, ay + 10], outline=(200, 60, 200), width=3)
        found_any = True
    if not found_any:
        rd.text((20, 20), "no recovered entities", fill=(140, 140, 140))

    panel = hconcat(
        [norm_overlay, fused_overlay, rec_overlay],
        ["normalized", "fused", "recovered"],
    )
    panel.save(out / f"{img_path.stem}.recovery.png")


def math_hypot(wall) -> float:
    import math

    return max(math.hypot(wall["end"][0] - wall["start"][0], wall["end"][1] - wall["start"][1]), 1e-6)


def _summarize_recovery(img_path: Path, fused: dict, recovered: dict, model: str | None) -> dict:
    """Phase 7 per-fixture metrics: before (fused) vs after (recovered)."""
    counts = recovered["counts"]
    resolution = recovered.get("recovery", {})
    unresolved = recovered["unresolved"]
    reasons = {
        "windows": _count_recovery_reasons(unresolved["windows"]),
        "doors": _count_recovery_reasons(unresolved["doors"]),
        "spaces": _count_recovery_reasons(unresolved["spaces"]),
    }
    return {
        "file": img_path.name,
        "semantic_model": model or "authored-fixture-semantics",
        # before (fused)
        "fused_rooms": fused["counts"].get("rooms", len(fused["rooms"])),
        "fused_doors": fused["counts"].get("doors", len(fused["doors"])),
        "fused_windows": fused["counts"].get("windows", len(fused["windows"])),
        "fused_stairs": fused["counts"].get("stairs", len(fused["stairs"])),
        "fused_unresolved_spaces": len(fused["unresolved"].get("spaces", [])),
        "fused_unresolved_doors": len(fused["unresolved"].get("doors", [])),
        "fused_unresolved_windows": len(fused["unresolved"].get("windows", [])),
        # recovered additions
        "recovered_windows": counts.get("recovered_windows", 0),
        "recovered_doors": counts.get("recovered_doors", 0),
        "recovered_rooms": counts.get("recovered_rooms", 0),
        "recovered_stairs": counts.get("recovered_stairs", 0),
        # after
        "rooms": counts.get("rooms", 0),
        "doors": counts.get("doors", 0),
        "windows": counts.get("windows", 0),
        "stairs": counts.get("stairs", 0),
        "unresolved_spaces": counts.get("unresolved_spaces", 0),
        "unresolved_doors": counts.get("unresolved_doors", 0),
        "unresolved_windows": counts.get("unresolved_windows", 0),
        "unresolved_reasons": reasons,
        "window_levels": _count_levels(resolution.get("windows", [])),
        "door_levels": _count_levels(resolution.get("doors", [])),
        "window_walls": [f"{w['wall_id']}@{w['position']:.2f}" for w in resolution.get("windows", [])],
        "door_walls": [f"{d['wall_id']}@{d['position']:.2f}" for d in resolution.get("doors", [])],
    }


def _count_recovery_reasons(entries: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for e in entries:
        reason = e.get("recovery_reason") or e.get("reason") or "unknown"
        key = reason.split(":")[0] if ":" in reason else reason
        counts[key] = counts.get(key, 0) + 1
    return counts


def _count_levels(entities: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for e in entities:
        level = e.get("evidence_level", "unknown")
        counts[level] = counts.get(level, 0) + 1
    return counts


def _write_recovery_summary(out: Path, rows: list[dict]) -> None:
    lines = [
        "# Phase 7 — Geometry candidate recovery summary",
        "",
        f"- Hardware: {platform.node()} · {platform.processor()} · Python {platform.python_version()}",
        "- Semantics: saved Phase 5 VLM responses, else authored fixture "
        "semantics derived from the documented Phase 5 readings; fused "
        "deterministically, then the recovery layer re-derives missing geometry "
        "from the source image (evidence-gated). No VLM coordinate is used.",
        "",
        "## Before (fusion) → after (fusion + recovery)",
        "",
        "`fused_*` = Phase 6 output; `recovered_*` = entities the recovery "
        "layer added with independent image evidence; `*_unresolved` = semantic "
        "observations that stayed unresolved **after** recovery (with reasons).",
        "",
        "| Fixture | semantic | fused rooms | fused doors | fused win | fused stairs | "
        "rec rooms | rec doors | rec win | rec stairs | after doors | after win | "
        "unresolved spaces | unresolved doors | unresolved windows |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    legend = [
        "",
        "## Unresolved reasons after recovery",
        "",
        "| Fixture | space reasons | door reasons | window reasons |",
        "|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            "| {file} | {semantic_model} | {fused_rooms} | {fused_doors} | {fused_windows} | {fused_stairs} | "
            "{recovered_rooms} | {recovered_doors} | {recovered_windows} | {recovered_stairs} | {doors} | {windows} | "
            "{unresolved_spaces} | {unresolved_doors} | {unresolved_windows} |".format(**r)
        )
        reasons = r["unresolved_reasons"]
        legend.append(
            "| {file} | {spaces} | {doors} | {windows} |".format(
                file=r["file"],
                spaces=", ".join(f"{k}:{v}" for k, v in sorted(reasons["spaces"].items())) or "—",
                doors=", ".join(f"{k}:{v}" for k, v in sorted(reasons["doors"].items())) or "—",
                windows=", ".join(f"{k}:{v}" for k, v in sorted(reasons["windows"].items())) or "—",
            )
        )
    lines += legend
    lines += [
        "",
        "## Recovered opening evidence levels",
        "",
        "| Fixture | window levels | door levels | recovered windows (wall@pos) | recovered doors (wall@pos) |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        wl = ", ".join(f"{k}:{v}" for k, v in sorted(r["window_levels"].items())) or "—"
        dl = ", ".join(f"{k}:{v}" for k, v in sorted(r["door_levels"].items())) or "—"
        lines.append(
            "| {file} | {wl} | {dl} | {ww} | {dw} |".format(
                file=r["file"], wl=wl, dl=dl,
                ww=", ".join(r["window_walls"]) or "—",
                dw=", ".join(r["door_walls"]) or "—",
            )
        )
    (out / "recovery-summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


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