"""Phase 3 specialized floor-plan segmentation providers (geo2).

Two directly benchmarked candidates plus two inspected-but-not-runnable
candidates:

- `cubicasa-unet`  — CubiCasa4-class ResNet34-UNet (floor/wall/door/window),
  letterbox preprocessing, MIT weights (CubiCasa5K training-data caveat).
- `openbim-unet`   — OpenBIM UNet+ResNet34 (background/wall/window/door),
  square-resize preprocessing, MIT weights (CubiCasa5K training-data caveat).

Raster2Seq (SIGGRAPH 2026, rooms+doors+windows labeled polygons, MIT) and
RoomFormer (CVPR 2023, room polygons from 3D density maps, MIT code) are
documented in `evaluation/phase3-candidates.md`: both require CUDA-only
compiled operators (deformable-attention + differentiable rasterization), and
RoomFormer additionally consumes 3D-scan-derived density maps rather than
raster floor-plan drawings, so neither is wired as a runnable provider here.
"""

from .cubicasa_unet import CubiCasaUNetProvider
from .openbim_unet import OpenBIMUNetProvider

__all__ = ["CubiCasaUNetProvider", "OpenBIMUNetProvider"]