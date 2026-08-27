"""geo2 Phase 3 provider: OpenBIM UNet+ResNet34 (background/wall/window/door).

Model: `Chunling1/OpenBIM-FloorPlan-AI` M2 (UNet + ResNet34), trained on
CubiCasa5K with domain adaptation for CAD drawings; weights released under MIT
on GitHub Releases. Same training-data commercial caveat as the CubiCasa
UNet above (CubiCasa5K = CC BY-NC) — recorded in `geo2/LICENSING.md`.

Preprocessing is the model's own training-time pipeline: plain 512×512 square
resize + ImageNet normalization (see `model_io.preprocess_stretch`). Class
order differs from the CubiCasa UNet: background / wall / window / door.
"""

from __future__ import annotations

from ...schema import FloorPlanGeometry
from .segmentation_unet import SpecializedUNetProvider

_WEIGHTS_URL = (
    "https://github.com/Chunling1/OpenBIM-FloorPlan-AI/releases/download/v1.0.0/"
    "M2_DA_FT_v2_best.pt"
)


class OpenBIMUNetProvider(SpecializedUNetProvider):
    """OpenBIM UNet+ResNet34 (background / wall / window / door), square resize."""

    id = "openbim-unet"
    preprocessing = "stretch"
    class_names = ("background", "wall", "window", "door")
    wall_class = 1
    window_class = 2
    door_class = 3
    floor_class = 0

    weights_filename = "openbim_M2.pt"
    weights_url = _WEIGHTS_URL
    weights_license_note = (
        "MIT (weights released under MIT on GitHub Releases), BUT trained on "
        "CubiCasa5K (CC BY-NC 4.0) -> commercial use legal gray area; "
        "see LICENSING.md"
    )
    checkpoint_kind = "state_dict"
    commercial_use = "restricted"

    def analyze(self, image) -> FloorPlanGeometry:
        return super().analyze(image)