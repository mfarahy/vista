"""Baseline deterministic provider for geo2.

Phase 1 deliberately does *not* optimise the model. This provider exists to
validate the full infrastructure end-to-end (image loading, provider
interface, schema validation, output generation, overlay, benchmark): it
builds a small, always-valid structural geometry derived deterministically
from the image size — an exterior wall rectangle, one interior divider, one
door (on the divider) and one window (on the top exterior wall) referencing
those walls.

It is a placeholder, not a floor-plan understanding system.
"""

from __future__ import annotations

import numpy as np

from ..schema import Door, FloorPlanGeometry, Point, Room, Source, Wall, Window
from .base import FloorPlanProvider


class BaselineProvider(FloorPlanProvider):
    """Deterministic mock provider for infrastructure validation.

    Tuned so that the produced document exercises several validation paths
    (wall references, polygon rooms, bounds) while remaining trivially simple.
    """

    id = "baseline-mock"

    def analyze(self, image: np.ndarray) -> FloorPlanGeometry:
        h, w = image.shape[0], image.shape[1]
        wf, hf = float(w), float(h)

        margin = min(wf, hf) * 0.06
        x0, y0 = margin, margin
        x1, y1 = wf - margin, hf - margin
        mid_x = wf / 2.0

        walls = [
            Wall(id="wall-exterior-top", start=Point(x=x0, y=y0), end=Point(x=x1, y=y0), thickness=12, type="exterior"),
            Wall(id="wall-exterior-right", start=Point(x=x1, y=y0), end=Point(x=x1, y=y1), thickness=12, type="exterior"),
            Wall(id="wall-exterior-bottom", start=Point(x=x1, y=y1), end=Point(x=x0, y=y1), thickness=12, type="exterior"),
            Wall(id="wall-exterior-left", start=Point(x=x0, y=y1), end=Point(x=x0, y=y0), thickness=12, type="exterior"),
            Wall(id="wall-divider", start=Point(x=mid_x, y=y0), end=Point(x=mid_x, y=y1), thickness=8, type="interior"),
        ]

        rooms = [
            Room(
                id="room-left",
                type="unknown",
                polygon=[
                    Point(x=x0, y=y0),
                    Point(x=mid_x, y=y0),
                    Point(x=mid_x, y=y1),
                    Point(x=x0, y=y1),
                ],
                wall_ids=[
                    "wall-exterior-top",
                    "wall-divider",
                    "wall-exterior-bottom",
                    "wall-exterior-left",
                ],
            ),
            Room(
                id="room-right",
                type="unknown",
                polygon=[
                    Point(x=mid_x, y=y0),
                    Point(x=x1, y=y0),
                    Point(x=x1, y=y1),
                    Point(x=mid_x, y=y1),
                ],
                wall_ids=[
                    "wall-exterior-top",
                    "wall-exterior-right",
                    "wall-exterior-bottom",
                    "wall-divider",
                ],
            ),
        ]

        doors = [
            Door(
                id="door-001",
                wall_id="wall-divider",
                position=Point(x=mid_x, y=0.5 * (y0 + y1)),
                width=min(wf, hf) * 0.12,
            )
        ]
        windows = [
            Window(
                id="window-001",
                wall_id="wall-exterior-top",
                position=Point(x=0.35 * (x0 + x1), y=y0),
                width=min(wf, hf) * 0.20,
            )
        ]

        return FloorPlanGeometry(
            source=Source(width=w, height=h),
            walls=walls,
            rooms=rooms,
            doors=doors,
            windows=windows,
        )