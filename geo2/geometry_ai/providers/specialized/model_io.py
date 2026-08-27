"""Shared model I/O for geo2's Phase 3 specialized floor-plan segmentation models.

These helpers wrap the third-party "segmentation → canonical geometry"
pipeline. They are deliberately *thin* and *visible*:

- `resolve_weights` — locate or download a pretrained checkpoint (verified
  licenses live in `geo2/LICENSING.md`).
- `preprocess_*` — reproduce the *exact* image preprocessing used at training
  time for each model (letterboxed 512×512 for the CubiCasa UNet, stretched
  512×512 for the OpenBIM UNet), plus the inverse coordinate transform that
  maps model-space pixels back to source-image pixel space.
- `run_unet` — single forward pass returning the class-index mask.

Everything else (mask → vector conversion) is in `vectorize.py`. Neither module
imports torch/opencv/skimage at import time so the geo2 unit-test suite and
`--list-providers` keep working on machines without the heavy stack.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np

# Model-space operating resolution used by both trained UNets (512×512).
MODEL_IMAGE_SIZE = 512

# ImageNet normalization used by both models' training preprocessing.
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)

_WEIGHTS_DIR: Optional[Path] = None


def weights_dir() -> Path:
    """The directory geo2 downloads model weights to (git-ignored)."""
    global _WEIGHTS_DIR
    if _WEIGHTS_DIR is None:
        d = Path(__file__).resolve().parents[3] / "weights"
        d.mkdir(parents=True, exist_ok=True)
        _WEIGHTS_DIR = d
    return _WEIGHTS_DIR


def resolve_weights(filename: str, url: str, env_override: str = "") -> Path:
    """Return a local weights path, downloading `url` if the file is missing.

    Downloads land in `geo2/weights/` (git-ignored). Raises RuntimeError if the
    download fails, so the caller reports a clean, non-fabricated failure.
    """
    base = Path(env_override) if env_override else weights_dir()
    base.mkdir(parents=True, exist_ok=True)
    target = base / filename
    if target.exists():
        return target
    import urllib.request

    print(f"[geo2] downloading weights {filename} -> {target} ...")
    try:
        urllib.request.urlretrieve(url, target)
    except Exception as exc:  # pragma: no cover - network errors vary
        raise RuntimeError(f"failed to download weights {filename} from {url}: {exc}") from exc
    return target


# ---------------------------------------------------------------------------
# Preprocessing (exact training-time preprocessing per model)
# ---------------------------------------------------------------------------


def preprocess_letterbox(
    image: np.ndarray,
    size: int = MODEL_IMAGE_SIZE,
) -> tuple[np.ndarray, tuple[int, int, int, int], float]:
    """Aspect-preserving resize + center letterbox, ImageNet-mean border.

    Mirrors the CubiCasa5K UNet training preprocessing (512×512 letterbox,
    ImageNet-normalized, zero/mean fill in the padding).

    Returns ``(tensor[1,3,size,size], rect=(left, top, inner_w, inner_h),
    scale)`` where ``scale`` maps *source* px → *model* px (``inner_w/orig_w``).
    """
    h, w = image.shape[0], image.shape[1]
    scale = min(size / w, size / h)
    inner_w = max(1, int(round(w * scale)))
    inner_h = max(1, int(round(h * scale)))
    from PIL import Image

    im = Image.fromarray(image).resize((inner_w, inner_h), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32) / 255.0
    a = (a - IMAGENET_MEAN) / IMAGENET_STD
    canvas = np.zeros((size, size, 3), dtype=np.float32)
    top, left = (size - inner_h) // 2, (size - inner_w) // 2
    canvas[top : top + inner_h, left : left + inner_w] = a
    tensor = canvas.transpose(2, 0, 1)[None, ...]
    return tensor, (left, top, inner_w, inner_h), scale


def preprocess_stretch(
    image: np.ndarray,
    size: int = MODEL_IMAGE_SIZE,
) -> tuple[np.ndarray, float, float]:
    """Square resize (stretch) + ImageNet normalize.

    Mirrors the OpenBIM UNet's ``albumentations.Resize(512,512)`` training
    preprocessing (the model was trained with a plain square resize, not a
    letterbox). Returns ``(tensor[1,3,size,size], sx, sy)`` where ``sx``/``sy``
    map model px → *source* px (``source_w/size``, ``source_h/size``).
    """
    h, w = image.shape[0], image.shape[1]
    from PIL import Image

    a = np.asarray(Image.fromarray(image).resize((size, size), Image.BILINEAR), dtype=np.float32) / 255.0
    a = (a - IMAGENET_MEAN) / IMAGENET_STD
    tensor = a.transpose(2, 0, 1)[None, ...]
    return tensor, w / size, h / size


def letterbox_mask_to_source(
    mask: np.ndarray,
    rect: tuple[int, int, int, int],
    source_w: int,
    source_h: int,
) -> np.ndarray:
    """Crop a letterboxed model mask back to source-image pixel space.

    Returns a mask whose shape equals the source image, with model-space pixels
    converted back to source-image pixel coordinates (top-left origin).
    Coordinates land on integer source pixels via nearest mapping; the result
    is used only for diagnostic overlays / native output, not as geometry.
    """
    left, top, inner_w, inner_h = rect
    H, W = mask.shape
    inner = mask[top : top + inner_h, left : left + inner_w]
    from PIL import Image

    resized = np.asarray(
        Image.fromarray(inner).resize((source_w, source_h), Image.NEAREST), dtype=mask.dtype
    )
    return resized


def morphology_closed_clean(
    mask: np.ndarray, fill_value: int = 0, rect: Optional[tuple[int, int, int, int]] = None
) -> np.ndarray:
    """Zero out letterbox padding so no geometry is extracted from the grey border."""
    if rect is None:
        return mask
    left, top, inner_w, inner_h = rect
    H, W = mask.shape
    if (inner_h, inner_w) == (H, W):
        return mask
    cleaned = np.full_like(mask, fill_value)
    cleaned[top : top + inner_h, left : left + inner_w] = mask[top : top + inner_h, left : left + inner_w]
    return cleaned


def run_unet(model, tensor: np.ndarray) -> np.ndarray:
    """Forward pass on a ``(1,3,H,W)`` float32 tensor; returns the argmax mask."""
    import torch

    with torch.no_grad():
        logits = model(torch.from_numpy(tensor))
        mask = logits.argmax(dim=1).squeeze(0).to("cpu", torch.uint8).numpy()
    return mask


def build_cached_unet(encoder_name: str, num_classes: int):
    """Build (and cache) an smp.Unet so 9 fixtures reuse one model instance.

    The cache is global to the process; every provider instance shares it, so
    the per-fixture reload done by the benchmark runner (one provider object
    per fixture) does not burn wall-clock time loading weights nine times.
    """
    import segmentation_models_pytorch as smp

    cache = _UNET_CACHE
    key = (encoder_name, num_classes)
    if key not in cache:
        cache[key] = smp.Unet(encoder_name=encoder_name, encoder_weights=None, classes=num_classes)
    return cache[key]


_UNET_CACHE: dict[tuple, object] = {}