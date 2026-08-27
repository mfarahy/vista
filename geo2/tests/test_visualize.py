"""Overlay renderer tests."""

from __future__ import annotations

from PIL import Image

from geometry_ai.visualize import render_overlay

from conftest import make_geometry


def test_overlay_created(tmp_path, sample_image):
    out = tmp_path / "overlay.png"
    render_overlay(sample_image, make_geometry(), out)
    assert out.exists()
    im = Image.open(out)
    assert im.size == (sample_image.shape[1], sample_image.shape[0])
    assert im.mode in ("RGB", "RGBA")


def test_overlay_with_rooms_doors_windows(tmp_path, sample_image):
    import numpy as np

    g = make_geometry()
    out = tmp_path / "overlay2.png"
    render_overlay(sample_image, g, out)
    # non-trivial output: some pixels differ from a plain image
    plain = np.asarray(Image.fromarray(sample_image).convert("RGB"))
    over = np.asarray(Image.open(out).convert("RGB"))
    assert int(np.abs(plain.astype(int) - over.astype(int)).sum()) > 0


def test_overlay_empty_geometry(tmp_path, sample_image):
    from geometry_ai.schema import FloorPlanGeometry, Source

    g = FloorPlanGeometry(source=Source(width=200, height=150))
    out = tmp_path / "overlay-empty.png"
    render_overlay(sample_image, g, out)
    assert out.exists()


def test_overlay_with_stairs_and_dimensions(tmp_path, sample_image):
    from geometry_ai.schema import Dimension, Point, Stair

    g = make_geometry()
    g.stairs = [
        Stair(
            id="s-1",
            region=[
                Point(x=30, y=90),
                Point(x=60, y=90),
                Point(x=60, y=130),
                Point(x=30, y=130),
            ],
            direction="up",
        )
    ]
    g.dimensions = [Dimension(id="dim-1", value=8.4, unit="m", start=Point(x=10, y=50), end=Point(x=120, y=50))]
    out = tmp_path / "overlay-full.png"
    render_overlay(sample_image, g, out)
    assert out.exists()