"""geo2 Phase 3 provider: CubiCasa4-class ResNet34-UNet (letterbox, HF weights).

Model: `Yytsi/floorplan-to-3d-walls` (repo `Yytsi/floorplan-to-3d`), a
ResNet34-UNet trained on CubiCasa5K to segment architectural floor plans into
four classes: floor / wall / door / window. Pretrained weights are distributed
under MIT on Hugging Face; the *training data* is CubiCasa5K (CC BY-NC) — the
commercial caveat is recorded in `geo2/LICENSING.md` and the class constants
below.

Preprocessing is the model's own training-time pipeline: aspect-preserving
512×512 letterbox + ImageNet normalization (see `model_io.preprocess_letterbox`).
"""

from __future__ import annotations

from ...schema import FloorPlanGeometry
from .segmentation_unet import SpecializedUNetProvider

# Hugging Face repo + file the MIT-licensed pretrained weights live under.
_WEIGHTS_URL = (
    "https://huggingface.co/Yytsi/floorplan-to-3d-walls/resolve/main/best.safetensors"
)


class CubiCasaUNetProvider(SpecializedUNetProvider):
    """CubiCasa4-class ResNet34-UNet (floor / wall / door / window)."""

    id = "cubicasa-unet"
    preprocessing = "letterbox"
    class_names = ("floor", "wall", "door", "window")
    wall_class = 1
    door_class = 2
    window_class = 3
    floor_class = 0

    weights_filename = "yytsi_best.safetensors"
    weights_url = _WEIGHTS_URL
    weights_license_note = (
        "MIT (weights distributed under MIT on Hugging Face / GitHub repo), "
        "BUT trained on CubiCasa5K (CC BY-NC 4.0) -> commercial use of these "
        "weights is a legal gray area; see LICENSING.md"
    )
    checkpoint_kind = "safetensors"
    commercial_use = "restricted"

    def analyze(self, image) -> FloorPlanGeometry:
        return super().analyze(image)