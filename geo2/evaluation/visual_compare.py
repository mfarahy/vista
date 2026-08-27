"""Visual benchmark generator for geo2 Phase 3 (side-by-side comparison panels).

Produces, under ``output/visual/``:

- ``phase3-<fixture>.png``   — source | cubicasa-unet overlay | openbim-unet overlay
- ``phase3-<fixture>-mask-<provider>.png`` — source | native class mask | overlay

These are evaluation-only artifacts: they let a human judge geometric alignment
for every fixture and every specialized candidate at a glance. The overlay
renderer and coordinate system are the same ones used for every candidate in
Phases 1–3 (see ``geometry_ai/visualize.py``).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    from geometry_ai.pipeline import load_image
    from evaluation.manifest import manifest

    _OUT = Path(__file__).resolve().parent.parent / "output" / "visual"
except ImportError:  # pragma: no cover - script bootstrap
    _OUT = None

PROVIDERS = ("cubicasa-unet", "openbim-unet")

CLASS_COLORS = {
    0: (240, 240, 235),
    1: (40, 40, 45),
    2: (230, 120, 50),
    3: (60, 150, 220),
}


def _font(size: int = 16):
    for name in ("DejaVuSans.ttf", "Arial.ttf", "Helvetica.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _title(img: Image.Image, text: str) -> Image.Image:
    out = Image.new("RGB", (img.width, img.height + 22), (245, 245, 245))
    out.paste(img, (0, 22))
    ImageDraw.Draw(out).text((8, 4), text, fill=(30, 30, 30), font=_font())
    return out


def _native_mask_image(output_dir: Path, provider: str, fx: str) -> Image.Image:
    mask_png = output_dir / provider / fx / "native_output" / "native_mask.png"
    src_png = output_dir / provider / fx / "overlay.png"
    src = Image.open(src_png)

    if not mask_png.exists():
        return Image.new("RGB", src.size, (120, 120, 120))
    mask = np.array(Image.open(mask_png))
    rgb = np.zeros((*mask.shape, 3), dtype=np.uint8)
    for c, color in CLASS_COLORS.items():
        rgb[mask == c] = color
    return Image.fromarray(rgb).resize(src.size)


def _stack(images: list[Image.Image], titles: list[str], total_width: int) -> Image.Image:
    titled = [_title(im, t) for im, t in zip(images, titles)]
    height = max(im.height for im in titled)
    pad = max(im.width for im in titled)
    out = Image.new("RGB", (min(total_width, pad * len(titled)), height), (255, 255, 255))
    x = 0
    for im in titled:
        out.paste(im, (x, 0))
        x += im.width
    return out


def build_visuals(output_dir: Path) -> None:
    out_dir = output_dir / "visual"
    out_dir.mkdir(parents=True, exist_ok=True)

    for fx in manifest():
        name = fx.name
        src = load_image(_source_image(output_dir, name))
        src_img = Image.fromarray(src)

        panels_phase3 = [src_img]
        titles_phase3 = ["source"]
        for prov in PROVIDERS:
            overlay = Image.open(output_dir / prov / name / "overlay.png")
            panels_phase3.append(overlay.resize(src_img.size))
            titles_phase3.append(prov)
        _stack(panels_phase3, titles_phase3, 4200).save(out_dir / f"phase3-{name}.png")

        for prov in PROVIDERS:
            overlay = Image.open(output_dir / prov / name / "overlay.png").resize(src_img.size)
            native = _native_mask_image(output_dir, prov, name).resize(src_img.size)
            _stack([src_img, native, overlay], ["source", "native mask", f"{prov} overlay"], 3000).save(
                out_dir / f"phase3-{name}-{prov}.png"
            )

    print(f"visuals written under {out_dir}")


def _source_image(output_dir: Path, name: str) -> Path:
    fx = [f for f in manifest() if f.name == name][0]
    import pathlib

    return output_dir.parent.parent / "fixtures" / fx.image


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--output", default=_OUT)
    args = p.parse_args(argv)
    build_visuals(Path(args.output).parent if str(args.output).endswith("visual") else Path(args.output))


if __name__ == "__main__":
    main()