"""Debug/visualization helpers: render the raw model output as PNGs.

These are used by the evaluation harness (not by the frontend) to visually
inspect how well the model aligns with the source floor plan.
"""

from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

from .labels import CLASS_COLORS, CLASS_NAMES


def colorize_mask(mask: np.ndarray) -> Image.Image:
    rgb = np.zeros((*mask.shape, 3), dtype=np.uint8)
    for idx, name in enumerate(CLASS_NAMES):
        rgb[mask == idx] = CLASS_COLORS[name]
    return Image.fromarray(rgb)


def draw_polygons_on(base: Image.Image, polygons, colors) -> Image.Image:
    """Overlay filled + outlined polygons (source-px coords) on an image."""
    canvas = base.convert("RGBA")
    ovl = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    odraw = ImageDraw.Draw(ovl)
    for cls, polys in polygons.items():
        color = colors.get(cls)
        if not color:
            continue
        fill = (*color, 70)
        for poly in polys:
            outer = [(x, y) for x, y in poly["outer"]]
            if len(outer) >= 3:
                odraw.polygon(outer, fill=fill)
            for hole in poly["holes"]:
                hpts = [(x, y) for x, y in hole]
                if len(hpts) >= 3:
                    odraw.polygon(hpts, fill=(0, 0, 0, 0))
    canvas = Image.alpha_composite(canvas, ovl)

    odraw = ImageDraw.Draw(canvas)
    for cls, polys in polygons.items():
        color = colors.get(cls)
        if not color:
            continue
        for poly in polys:
            rings = [poly["outer"]] + poly["holes"]
            for ring in rings:
                pts = [(x, y) for x, y in ring]
                if len(pts) >= 2:
                    odraw.line(pts + [pts[0]], fill=(*color, 255), width=2)
    return canvas.convert("RGB")


def draw_walls_on(base: Image.Image, walls) -> Image.Image:
    """Draw derived wall centerlines over an image."""
    canvas = base.convert("RGB")
    draw = ImageDraw.Draw(canvas)
    for w in walls:
        color = (200, 30, 30) if w["type"] == "exterior" else (230, 120, 50)
        draw.line(
            [tuple(w["start"]), tuple(w["end"])],
            fill=color,
            width=max(3, int(w["thickness"])),
        )
    return canvas


def draw_rooms_on(base: Image.Image, regions) -> Image.Image:
    canvas = base.convert("RGB")
    draw = ImageDraw.Draw(canvas)
    for r in regions:
        pts = [(x, y) for x, y in (r.get("outer") or r.get("polygon") or [])]
        if len(pts) >= 3:
            draw.polygon(pts, outline=(30, 150, 200), fill=(30, 150, 200, 0))
            draw.line(pts + [pts[0]], fill=(30, 150, 200), width=2)
    return canvas


def _point_along(start, end, fraction):
    return (
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
    )


def draw_doors_windows_on(base: Image.Image, doors, windows, walls) -> Image.Image:
    """Draw normalized door/window marks on their host wall centerlines."""
    canvas = base.convert("RGB")
    draw = ImageDraw.Draw(canvas)
    wall_by_id = {w["id"]: w for w in walls}

    def length(w):
        return math.hypot(w["end"][0] - w["start"][0], w["end"][1] - w["start"][1])

    for d in doors:
        w = wall_by_id.get(d["wall_id"])
        if not w:
            continue
        ln = max(length(w), 1e-6)
        a = _point_along(w["start"], w["end"], d["position"] - d["width"] / 2 / ln)
        b = _point_along(w["start"], w["end"], d["position"] + d["width"] / 2 / ln)
        draw.line([a, b], fill=(230, 120, 50), width=max(4, int(w["thickness"] // 2)))
    for wnd in windows:
        w = wall_by_id.get(wnd["wall_id"])
        if not w:
            continue
        ln = max(length(w), 1e-6)
        a = _point_along(w["start"], w["end"], wnd["position"] - wnd["width"] / 2 / ln)
        b = _point_along(w["start"], w["end"], wnd["position"] + wnd["width"] / 2 / ln)
        draw.line([a, b], fill=(60, 150, 220), width=max(4, int(w["thickness"] // 2)))
    return canvas


def hconcat(images: list[Image.Image], titles: list[str] | None = None):
    label_h = 22
    h = max(im.height for im in images)
    w = sum(im.width for im in images)
    out = Image.new("RGB", (w, h + label_h), (255, 255, 255))
    draw = ImageDraw.Draw(out)
    x = 0
    for i, im in enumerate(images):
        out.paste(im, (x, label_h))
        if titles:
            draw.text((x + 6, 4), titles[i], fill=(20, 20, 20))
        x += im.width
    return out