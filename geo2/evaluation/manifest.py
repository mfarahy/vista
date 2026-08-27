"""geo2 fixture manifest.

`FIXTURES` lists the benchmark images geo2 evaluates on. Each entry may carry
an optional `ground_truth` path to a `geo2-gt-v1` document. The images are the
same canonical floor plans the repository's geometry-ai harness uses (authored
synthetic plans plus adopted real scans); they are copied into geo2/fixtures
so the benchmark is self-contained and independent.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
GROUND_TRUTH_DIR = FIXTURES_DIR / "ground_truth"

# Structural GT quality tiers (see README, "Baseline ground truth"):
#   - "full": authored geometric GT (walls/rooms/doors/windows/stairs)
#   - "semantic": counts/classification only, no pixel geometry (not yet wired)
#   - none: no GT; metrics report counts + validity only
@dataclass(frozen=True)
class Fixture:
    name: str
    image: str  # filename relative to fixtures/
    ground_truth: str | None = None  # filename relative to fixtures/ground_truth/
    gt_quality: str = "none"
    notes: str = ""


FIXTURES: tuple[Fixture, ...] = (
    Fixture(
        name="01-german-realestate",
        image="01-german-realestate.png",
        notes="German real-estate demo plan (authored); no pixel GT in Phase 1.",
    ),
    Fixture(
        name="02-clean",
        image="02-clean.png",
        notes="Clean architectural drawing; authored GT for 05/06 only in Phase 1.",
    ),
    Fixture(
        name="03-dimensions",
        image="03-dimensions.png",
        notes="Clean drawings with dimension lines/labels; dims in GT later.",
    ),
    Fixture(
        name="04-furnished",
        image="04-furnished.png",
        notes="Plan with furniture symbols (furniture must not be geometry).",
    ),
    Fixture(
        name="05-cubicasa-style",
        image="05-cubicasa-style.png",
        ground_truth="05-cubicasa-style.gt.json",
        gt_quality="full",
        notes="CubiCasa-style CAD, door arcs + windows; authored GT.",
    ),
    Fixture(
        name="06-basement",
        image="06-basement.png",
        ground_truth="06-basement.gt.json",
        gt_quality="full",
        notes="German basement plan; full authored GT incl. stairs.",
    ),
    Fixture(
        name="07-basement-real",
        image="07-basement-real.jpg",
        notes="Real scanned basement plan (grayscale); no GT.",
    ),
    Fixture(
        name="08-upper-floor-real",
        image="08-upper-floor-real.jpg",
        notes="Real scanned upper-floor plan (grayscale); no GT.",
    ),
    Fixture(
        name="09-ground-floor-real",
        image="09-ground-floor-real.jpg",
        notes="Real scanned ground-floor plan (grayscale); no GT.",
    ),
)


def manifest() -> tuple[Fixture, ...]:
    return FIXTURES


def fixture_by_name(name: str) -> Fixture:
    for fx in FIXTURES:
        if fx.name == name:
            return fx
    raise KeyError(f"unknown fixture {name!r}; available: {[f.name for f in FIXTURES]}")


def fixture_image_path(fx: Fixture) -> Path:
    return FIXTURES_DIR / fx.image


def fixture_ground_truth_path(fx: Fixture) -> Path | None:
    if fx.ground_truth is None:
        return None
    return GROUND_TRUTH_DIR / fx.ground_truth


def load_ground_truth(fx: Fixture):
    """Load the geo2 GroundTruth for a fixture, or None."""
    from geometry_ai.metrics import GroundTruth

    p = fixture_ground_truth_path(fx)
    if p is None or not p.exists():
        return None
    import json

    return GroundTruth.model_validate(json.loads(p.read_text(encoding="utf-8")))