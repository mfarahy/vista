"""Model construction for the CubiCasa5K floor-plan segmentation UNet.

Same architecture as the source checkpoint: a UNet with a ResNet-34 encoder,
four output classes. We never download ImageNet encoder weights — they come
from the trained checkpoint (`best.safetensors`) at load time.
"""

from __future__ import annotations

import segmentation_models_pytorch as smp
import torch.nn as nn

from .labels import NUM_CLASSES


def build_model(encoder_name: str = "resnet34") -> nn.Module:
    """Return a UNet classifier with `encoder_name` backbone (raw logits)."""
    return smp.Unet(
        encoder_name=encoder_name,
        encoder_weights=None,
        in_channels=3,
        classes=NUM_CLASSES,
    )


def load_inference_checkpoint(model: nn.Module, ckpt_path: str, device: str) -> int | None:
    """Load weights from a safetensors (HF) or .pt checkpoint into `model`.

    Returns the training epoch reported by the checkpoint, when available.
    """
    from safetensors.torch import load_file

    target = "cuda" if device == "cuda" else "cpu"
    state = load_file(ckpt_path, device=target)
    model.load_state_dict(state)
    epoch: int | None = None
    with safe_open_meta(ckpt_path) as f:
        meta = f.metadata() or {}
    if meta.get("epoch"):
        epoch = int(meta["epoch"])
    return epoch


def safe_open_meta(ckpt_path: str):
    from safetensors import safe_open

    return safe_open(ckpt_path, framework="pt")