"""Shared pytest fixtures/helpers for geo2 tests."""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from geometry_ai.schema import (
    Door,
    FloorPlanGeometry,
    Point,
    Room,
    Source,
    Wall,
    Window,
)


@pytest.fixture
def tiny_image() -> np.ndarray:
    """A tiny RGB image (top-left origin, uint8)."""
    rng = np.random.default_rng(0)
    return rng.integers(0, 256, size=(120, 160, 3), dtype=np.uint8)


@pytest.fixture
def sample_image() -> np.ndarray:
    """A small white canvas with a few dark wall lines."""
    im = Image.new("RGB", (200, 150), (250, 250, 248))
    from PIL import ImageDraw

    d = ImageDraw.Draw(im)
    d.line([(20, 20), (180, 20)], fill=(35, 35, 38), width=8)
    d.line([(180, 20), (180, 130)], fill=(35, 35, 38), width=8)
    d.line([(180, 130), (20, 130)], fill=(35, 35, 38), width=8)
    d.line([(20, 130), (20, 20)], fill=(35, 35, 38), width=8)
    return np.asarray(im, dtype=np.uint8)


def make_geometry(cx: float = 100, cy: float = 75) -> FloorPlanGeometry:
    """A structurally valid 2-room geometry centred on (cx, cy)."""
    w, h = 200, 150
    walls = [
        Wall(id="w-top", start=Point(x=20, y=20), end=Point(x=180, y=20), thickness=8, type="exterior"),
        Wall(id="w-right", start=Point(x=180, y=20), end=Point(x=180, y=130), thickness=8, type="exterior"),
        Wall(id="w-bottom", start=Point(x=180, y=130), end=Point(x=20, y=130), thickness=8, type="exterior"),
        Wall(id="w-left", start=Point(x=20, y=130), end=Point(x=20, y=20), thickness=8, type="exterior"),
        Wall(id="w-div", start=Point(x=cx, y=20), end=Point(x=cx, y=130), thickness=6, type="interior"),
    ]
    rooms = [
        Room(
            id="r-l",
            polygon=[
                Point(x=20, y=20),
                Point(x=cx, y=20),
                Point(x=cx, y=130),
                Point(x=20, y=130),
            ],
            wall_ids=["w-top", "w-div", "w-bottom", "w-left"],
        ),
        Room(
            id="r-r",
            polygon=[
                Point(x=cx, y=20),
                Point(x=180, y=20),
                Point(x=180, y=130),
                Point(x=cx, y=130),
            ],
            wall_ids=["w-top", "w-right", "w-bottom", "w-div"],
        ),
    ]
    doors = [
        Door(id="d-1", wall_id="w-div", position=Point(x=cx, y=cy), width=30)
    ]
    windows = [
        Window(id="win-1", wall_id="w-top", position=Point(x=60, y=20), width=40)
    ]
    return FloorPlanGeometry(
        source=Source(width=w, height=h), walls=walls, rooms=rooms, doors=doors, windows=windows
    )