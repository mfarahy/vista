"""Input preprocessing that exactly mirrors the training-time pipeline.

The checkpoint was trained at 512x512 with aspect-preserving letterboxing:
the source image is scaled to fit within the canvas keeping its aspect ratio
and centered on a mean-gray (ImageNet-mean) background. The returned
`content_rect` is `(left, top, inner_w, inner_h)` — the bounding box of the
real plan inside the 512x512 canvas — which callers use to map mask
coordinates back to the source image's pixel space.

We replicate the letterbox fill the same way the trainer did (blank canvas,
then ImageNet normalization) so the model sees identical pixels in inference.
"""

from __future__ import annotations

import io

import numpy as np
import torch
from PIL import Image
from skimage.filters import threshold_otsu

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

ContentRect = tuple[int, int, int, int]


def load_source_rgb(image_bytes: bytes) -> Image.Image:
    """Decode a raster image to RGB, preserving original pixel dims."""
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def binarize_gray(image: Image.Image) -> Image.Image:
    """Render the plan as dark lines on a white background (Otsu threshold).

    The UNet was trained on black-and-white line drawings. Colour and photo
    floor plans — light-brown paper, tiled kitchen floors, washed-out scans —
    push the model toward labelling the whole image as background/floor, so
    no walls are detected. Binarizing restores the model's training domain.
    Applied at source resolution, before the letterbox resize, to preserve
    line contrast for the threshold.
    """
    gray = np.asarray(image.convert("L"))
    thr = threshold_otsu(gray)
    binary = np.where(gray > thr, 255, 0).astype(np.uint8)
    return Image.fromarray(np.stack([binary] * 3, axis=-1))


def to_grayscale(image: Image.Image) -> Image.Image:
    """Drop colour (keep luminance) as 3 identical channels."""
    return image.convert("L").convert("RGB")


def _normalize(image_t: torch.Tensor) -> torch.Tensor:
    mean = torch.tensor(IMAGENET_MEAN).view(3, 1, 1)
    std = torch.tensor(IMAGENET_STD).view(3, 1, 1)
    return (image_t - mean) / std


def to_input_tensor(
    image: Image.Image,
    image_size: tuple[int, int] = (512, 512),
    letterbox: bool = True,
    normalize: bool = True,
    preprocess: str = "none",
) -> tuple[torch.Tensor, ContentRect]:
    """Convert a raster floor plan into the model's input tensor.

    Returns (tensor [1, 3, H, W], content_rect). Content rect is expressed
    in canvas (mask) pixel coordinates.

    `preprocess` may be `"none"`, `"gray"` (drop colour) or `"binary"`
    (Otsu binarization to dark lines on white). It runs on the source image
    before letterboxing so line contrast is preserved for the threshold.
    """
    if preprocess == "binary":
        image = binarize_gray(image)
    elif preprocess == "gray":
        image = to_grayscale(image)

    src_w, src_h = image.size
    H, W = image_size

    if letterbox:
        scale = min(W / src_w, H / src_h)
        inner_w = max(1, int(round(src_w * scale)))
        inner_h = max(1, int(round(src_h * scale)))
    else:
        inner_w, inner_h = W, H

    resized = image.resize((inner_w, inner_h), Image.BILINEAR)
    image_t = torch.from_numpy(np.array(resized)).permute(2, 0, 1).contiguous().float().div_(255.0)
    if normalize:
        image_t = _normalize(image_t)

    if letterbox and (inner_h, inner_w) != (H, W):
        top = (H - inner_h) // 2
        left = (W - inner_w) // 2
        canvas = torch.zeros(3, H, W)
        canvas[:, top : top + inner_h, left : left + inner_w] = image_t
        return canvas.unsqueeze(0), (left, top, inner_w, inner_h)

    return image_t.unsqueeze(0), (0, 0, W, H)


def mask_to_source_points(
    points: np.ndarray,
    content_rect: ContentRect,
    src_size: tuple[int, int],
) -> list[list[float]]:
    """Map an array of (x, y) mask points to source-image pixel coordinates.

    `content_rect` is (left, top, inner_w, inner_h); `src_size` is (w, h).
    Points far outside the content rect (in the letterbox padding) are
    clamped to the nearest content edge.
    """
    left, top, inner_w, inner_h = content_rect
    src_w, src_h = src_size
    if inner_w == 0 or inner_h == 0:
        return []
    out = []
    for mx, my in points:
        # Inverse of the letterbox mapping: (mx - left) / inner_w * src_w
        sx = (mx - left) * src_w / inner_w
        sy = (my - top) * src_h / inner_h
        out.append([float(sx), float(sy)])
    return out