"""Evaluation overlay renderer for geo2.

Given a floor-plan image and (validated) geometry, produce an `overlay.png`
that draws each entity type with a distinct visual marking:

- walls          → thick solid lines (exterior dark, interior lighter)
- rooms          → translucent fill + outline
- doors          → perpendicular double line + arc
- windows        → blue double line
- stairs         → hatch pattern in region
- labels         → text at position
- dimensions     → green line + value

The renderer is purely for qualitative evaluation; keep it simple.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .schema import FloorPlanGeometry

# RGBA colours per entity type (matching the README table)
COLORS = {
    "wall_exterior": (35, 35, 38, 255),
    "wall_interior": (130, 130, 140, 255),
    "wall_unknown": (170, 170, 180, 255),
    "room": (56, 120, 230, 90),
    "room_outline": (56, 120, 230, 255),
    "door": (230, 60, 60, 255),
    "window": (30, 120, 220, 255),
    "stair": (150, 80, 190, 200),
    "label": (20, 20, 24, 255),
    "dimension": (40, 160, 90, 255),
}


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("DejaVuSans.ttf", "Arial.ttf", "Helvetica.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_overlay(
    image: np.ndarray,
    geometry: FloorPlanGeometry,
    out_path: Path | str,
) -> Path:
    """Render the geometry overlay onto the source image and save as PNG."""
    h, w = image.shape[0], image.shape[1]
    base = Image.fromarray(image).convert("RGBA")
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    # rooms first (fills sit under lines)
    for room in geometry.rooms:
        pts = [(p.x, p.y) for p in room.polygon]
        if len(pts) >= 3:
            draw.polygon(pts, fill=COLORS["room"], outline=COLORS["room_outline"], width=2)
        if room.name:
            cx = sum(p.x for p in room.polygon) / len(room.polygon)
            cy = sum(p.y for p in room.polygon) / len(room.polygon)
            draw.text((cx, cy), room.name, fill=COLORS["label"], font=_font(18))

    # walls
    wall_colors = {
        "exterior": COLORS["wall_exterior"],
        "interior": COLORS["wall_interior"],
        "unknown": COLORS["wall_unknown"],
    }
    for wall in geometry.walls:
        c = wall_colors.get(wall.type, COLORS["wall_unknown"])
        width = max(3, int(wall.thickness)) if wall.thickness else 4
        draw.line(
            [(wall.start.x, wall.start.y), (wall.end.x, wall.end.y)],
            fill=c,
            width=width,
        )

    # stairs region hatch
    for stair in geometry.stairs:
        pts = [(p.x, p.y) for p in stair.region]
        if len(pts) >= 3:
            draw.polygon(pts, outline=COLORS["stair"], width=2)
            fill_hatch(draw, pts, COLORS["stair"], step=8, angle=45)

    # doors: perpendicular bar + arc
    for door in geometry.doors:
        c = COLORS["door"]
        wall = next((w for w in geometry.walls if w.id == door.wall_id), None)
        if wall is not None:
            dx, dy = wall.end.x - wall.start.x, wall.end.y - wall.start.y
            length = math.hypot(dx, dy)
            if length > 1e-6:
                nxe, nye = -dy / length, dx / length
                half = max(3.0, door.width * 0.35)
                p1 = (door.position.x + nxe * half, door.position.y + nye * half)
                p2 = (door.position.x - nxe * half, door.position.y - nye * half)
                draw.line([p1, p2], fill=c, width=6)
        draw.ellipse(
            [
                door.position.x - 5,
                door.position.y - 5,
                door.position.x + 5,
                door.position.y + 5,
            ],
            fill=c,
        )

    # windows: blue double line through the wall point
    for window in geometry.windows:
        c = COLORS["window"]
        wall = next((w for w in geometry.walls if w.id == window.wall_id), None)
        if wall is not None:
            dx, dy = wall.end.x - wall.start.x, wall.end.y - wall.start.y
            length = math.hypot(dx, dy)
            if length > 1e-6:
                ux, uy = dx / length, dy / length
                half = max(4.0, window.width * 0.5)
                p1 = (window.position.x - ux * half, window.position.y - uy * half)
                p2 = (window.position.x + ux * half, window.position.y + uy * half)
                draw.line([p1, p2], fill=c, width=3)
                draw.line(
                    [
                        (p1[0] + 4, p1[1] - 4),
                        (p2[0] + 4, p2[1] - 4),
                    ],
                    fill=c,
                    width=2,
                )
        draw.ellipse(
            [
                window.position.x - 5,
                window.position.y - 5,
                window.position.x + 5,
                window.position.y + 5,
            ],
            fill=(0, 0, 0, 255),
            outline=c,
            width=2,
        )

    # dimensions
    for dim in geometry.dimensions:
        c = COLORS["dimension"]
        draw.line(
            [(dim.start.x, dim.start.y), (dim.end.x, dim.end.y)],
            fill=c,
            width=2,
        )
        mid = ((dim.start.x + dim.end.x) / 2, (dim.start.y + dim.end.y) / 2)
        draw.text(mid, f"{dim.value:g}{dim.unit or ''}", fill=c, font=_font(16))

    base = Image.alpha_composite(base, overlay)
    out = Path(out_path)
    base.convert("RGB").save(out)
    return out


def fill_hatch(
    draw: ImageDraw.ImageDraw,
    polygon: list[tuple[float, float]],
    color: tuple[int, int, int, int],
    step: int = 8,
    angle: float = 45,
) -> None:
    """Draw a simple diagonal hatch across the polygon's bounding box."""
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    rad = math.radians(angle)
    a, b = math.cos(rad), math.sin(rad)
    diag = math.hypot(x1 - x0, y1 - y0)
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    # number of lines needed across the diagonal span
    n = int(diag / max(1, step))
    for i in range(-n, n + 1):
        t = i * step
        p1 = (cx + b * t - a * diag, cy - a * t - b * diag)
        p2 = (cx + b * t + a * diag, cy - a * t + b * diag)
        draw.line([p1, p2], fill=color, width=2)


def overlay_from_image_path(
    image_path: Path | str,
    geometry: FloorPlanGeometry,
    out_path: Path | str,
) -> Path:
    from .pipeline import load_image

    return render_overlay(load_image(image_path), geometry, out_path)