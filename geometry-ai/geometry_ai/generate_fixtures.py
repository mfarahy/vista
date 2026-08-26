"""Generate a small, original set of representative floor-plan fixtures.

These images are authored by this script (drawn programmatically) — they are
not scraped or copied from any third-party source, so they can be committed
alongside the evaluation. They are deliberately simple proxies for the floor
plan styles Phase 3 targets:

    01-de-style (German/European real-estate) — already produced from
        `expose-service/public/demo/floorplan.svg`; not redrawn here.
    02-clean            — clean architectural drawing, no annotations.
    03-dimensions       — clean drawing with dimension lines and labels.
    04-furnished        — plan with furniture symbols.
    05-cubicasa-style   — CubiCasa-like CAD drawing with wall bands and
                          explicit door arcs / window double-lines.

Coordinate system: white canvas, dark walls, thin lines — mirroring the
distribution the CubiCasa5K-trained model expects.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "fixtures"


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("DejaVuSans.ttf", "Arial.ttf", "Helvetica.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _noise_floor(draw: ImageDraw.ImageDraw, w: int, h: int, color: int) -> None:
    """Light speckle so the floor is not a pure blank (matches scanner noise)."""
    import random

    rng = random.Random(7)
    for _ in range(2400):
        x = rng.randrange(0, w)
        y = rng.randrange(0, h)
        v = color - rng.choice((0, 0, 1, 1, 2, 3))
        draw.point((x, y), fill=(v, v, v))


def _draw_wall(draw, p1, p2, thickness, color=(35, 35, 38)):
    draw.line([p1, p2], fill=color, width=thickness)


def _door_arc(draw, hinge, leaf, color=(60, 60, 70), width=3):
    """Draw a door as a hinge + swing arc (CubiCasa-style)."""
    import math

    split = 12
    px, py = hinge
    lx, ly = leaf
    radius = math.hypot(lx - px, ly - py)
    base = math.atan2(ly - py, lx - px)
    draw.line([hinge, leaf], fill=color, width=width)
    for i in range(split):
        a0 = base + math.pi / 2 * (i / split)
        a1 = base + math.pi / 2 * ((i + 1) / split)
        draw.line(
            [
                (px + radius * math.cos(a0), py + radius * math.sin(a0)),
                (px + radius * math.cos(a1), py + radius * math.sin(a1)),
            ],
            fill=color,
            width=width,
        )


def _window_mark(draw, p1, p2, color=(90, 90, 100), width=4):
    """A window as the classic thin double line across a wall."""
    draw.line([p1, p2], fill=color, width=width)


def clean_plan(path: Path) -> None:
    W, H = 1000, 720
    im = Image.new("RGB", (W, H), (250, 250, 248))
    draw = ImageDraw.Draw(im)
    _noise_floor(draw, W, H, 250)
    t = 10
    m = 40
    # exterior shell
    _draw_wall(draw, (m, m), (W - m, m), t)
    _draw_wall(draw, (W - m, m), (W - m, H - m), t)
    _draw_wall(draw, (W - m, H - m), (m, H - m), t)
    _draw_wall(draw, (m, H - m), (m, m), t)
    # interior dividers
    _draw_wall(draw, (W // 2, m), (W // 2, int(H * 0.55)), t)  # top room split
    _draw_wall(draw, (W // 2, int(H * 0.7)), (W // 2, H - m), t)  # bottom split
    _draw_wall(draw, (m, int(H * 0.42)), (W // 2 - 60, int(H * 0.42)), t)  # left room
    im.save(path)


def dimensions_plan(path: Path) -> None:
    W, H = 1200, 800
    im = Image.new("RGB", (W, H), (252, 252, 250))
    draw = ImageDraw.Draw(im)
    _noise_floor(draw, W, H, 252)
    t = 12
    m = 90
    _draw_wall(draw, (m, m), (W - m, m), t)
    _draw_wall(draw, (W - m, m), (W - m, H - m), t)
    _draw_wall(draw, (W - m, H - m), (m, H - m), t)
    _draw_wall(draw, (m, H - m), (m, m), t)
    col = int(W * 0.55)
    _draw_wall(draw, (col, m), (col, int(H * 0.5)), t)
    _draw_wall(draw, (col, int(H * 0.66)), (col, H - m), t)
    # dimension lines outside the shell
    dim_color = (120, 120, 128)
    for y0 in (m, int(H * 0.5), H - m):
        draw.line([(m - 28, y0), (col - 28, y0)], fill=dim_color, width=1)
        draw.line([(col + 28, y0), (W - m + 28, y0)], fill=dim_color, width=1)
    draw.line([(m, m - 28), (m, H - m + 28)], fill=dim_color, width=1)
    draw.line([(W - m, m - 28), (W - m, H - m + 28)], fill=dim_color, width=1)
    f = _font(22)
    draw.text((int((m + col) / 2) - 30, m - 52), "8,40 m", fill=dim_color, font=f)
    draw.text((m - 52, H // 2), "6,10 m", fill=dim_color, font=f)
    # room label
    f26 = _font(30)
    draw.text((int((m + col) / 2) - 40, H // 2 - 60), "Wohnzimmer", fill=(70, 70, 76), font=f26)
    im.save(path)


def furnished_plan(path: Path) -> None:
    W, H = 1100, 780
    im = Image.new("RGB", (W, H), (249, 249, 247))
    draw = ImageDraw.Draw(im)
    _noise_floor(draw, W, H, 249)
    t = 10
    m = 45
    _draw_wall(draw, (m, m), (W - m, m), t)
    _draw_wall(draw, (W - m, m), (W - m, H - m), t)
    _draw_wall(draw, (W - m, H - m), (m, H - m), t)
    _draw_wall(draw, (m, H - m), (m, m), t)
    _draw_wall(draw, (W // 2, m), (W // 2, H - m), t)
    _draw_wall(draw, (m, int(H * 0.55)), (W // 2, int(H * 0.55)), t)

    furn_color = (168, 168, 176)
    # sofa
    draw.rounded_rectangle([m + 60, m + 50, m + 240, m + 130], radius=12, fill=furn_color)
    # table + chairs (circle)
    cx, cy = m + 420, m + 260
    draw.ellipse([cx - 52, cy - 52, cx + 52, cy + 52], outline=furn_color, width=6)
    draw.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=furn_color)
    # bed
    draw.rectangle([W // 2 + 60, m + 60, W // 2 + 60 + 200, m + 60 + 140], fill=furn_color)
    draw.line(
        [(W // 2 + 130, m + 60), (W // 2 + 130, m + 60 + 140)], fill=(220, 220, 224), width=2
    )
    # bathtub
    dx, dy = m + 80, H - m - 180
    draw.rounded_rectangle([dx, dy, dx + 180, dy + 80], radius=26, outline=furn_color, width=6)
    # kitchen counter
    draw.rectangle([m + 60, int(H * 0.75), m + 300, int(H * 0.75) + 55], fill=furn_color)
    for i in range(4):
        sx = m + 80 + i * 60
        draw.circle((sx, int(H * 0.75) + 27), 12, outline=furn_color, width=4)
    im.save(path)


def cubicasa_style_plan(path: Path) -> None:
    """CubiCasa-Nordic-style plan: filled wall bands + door arcs + window lines."""
    W, H = 1000, 760
    im = Image.new("RGB", (W, H), (252, 252, 250))
    draw = ImageDraw.Draw(im)
    _noise_floor(draw, W, H, 252)
    wall_fill = (45, 45, 50)
    wall_w = 22
    m = 70

    def band(p1, p2):
        draw.line([p1, p2], fill=wall_fill, width=wall_w)

    # exterior walls
    band((m, m), (W - m, m))
    band((W - m, m), (W - m, H - m))
    band((W - m, H - m), (m, H - m))
    band((m, H - m), (m, m))
    # interior wall with a door gap
    cx = int(W * 0.6)
    band((cx, m), (cx, int(H * 0.5) - 60))
    band((cx, int(H * 0.5) + 60), (cx, H - m))
    ymid = int(H * 0.5)
    band((m, ymid), (cx - 60, ymid))
    band((cx + 60, ymid), (W - m, ymid))

    # door: gap between (cx, ymid-60) and (cx, ymid+60)
    _door_arc(draw, (cx - 24, ymid + 50), (cx + 26, ymid + 50))
    draw.line([(cx, ymid - 55), (cx, ymid + 50)], fill=(250, 250, 248), width=20)  # erase wall

    # windows on exterior north + east
    for (ax, ay, bx, by) in [
        (m + 150, m, m + 320, m),
        (W - m - 320, m, W - m - 150, m),
        (W - m, int(H * 0.28), W - m, int(H * 0.42)),
    ]:
        _window_mark(draw, (ax, ay), (bx, by), color=(30, 110, 190), width=10)
    im.save(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    clean_plan(OUT / "02-clean.png")
    dimensions_plan(OUT / "03-dimensions.png")
    furnished_plan(OUT / "04-furnished.png")
    cubicasa_style_plan(OUT / "05-cubicasa-style.png")
    print("wrote fixtures to", OUT)


if __name__ == "__main__":
    main()