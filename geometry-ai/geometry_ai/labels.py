"""Class taxonomy of the UNet segmentation model.

Four classes following the source model (training on CubiCasa5K):

    floor  — room interior and everything that is not wall/opening.
             In CubiCasa-style drawings this also covers the white background
             outside the building, which the room extraction step filters out.
    wall   — structural wall bands (solid fill).
    door   — door openings (drawn on top of walls).
    window — window openings (drawn on top of walls).

`floor` is the default fill: every pixel starts there and walls/doors/windows
are painted on top, so openings overwrite walls where they overlap.
"""

from __future__ import annotations

from collections import OrderedDict

CLASS_NAMES: tuple[str, ...] = ("floor", "wall", "door", "window")
CLASS_TO_ID: dict[str, int] = {name: i for i, name in enumerate(CLASS_NAMES)}
NUM_CLASSES: int = len(CLASS_NAMES)

FLOOR_ID: int = CLASS_TO_ID["floor"]
WALL_ID: int = CLASS_TO_ID["wall"]
DOOR_ID: int = CLASS_TO_ID["door"]
WINDOW_ID: int = CLASS_TO_ID["window"]

# RGB colors for visualization only — must not be used to store meaning.
CLASS_COLORS: dict[str, tuple[int, int, int]] = {
    "floor": (240, 240, 235),
    "wall": (40, 40, 45),
    "door": (230, 120, 50),
    "window": (60, 150, 220),
}

# Model output order: {name: index} inverse of CLASS_NAMES.
ID_TO_CLASS: dict[int, str] = {i: name for i, name in enumerate(CLASS_NAMES)}