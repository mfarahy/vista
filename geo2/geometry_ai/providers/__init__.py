"""Provider registry for geo2.

Registry is minimal on purpose: providers are plain objects registered by id,
so multiple provider *approaches* can later be benchmarked (specialised CV,
VLM, open multimodal, external API, hybrid) against the exact same fixtures,
validation and metrics — the whole point of the model-agnostic design.
"""

from __future__ import annotations

from typing import Dict, Type

from .base import FloorPlanProvider, Licensing, UsageInfo
from .baseline import BaselineProvider
from .openai_vlm import (
    GPT41MiniVLMProvider,
    GPT4oReconstructVLMProvider,
    GPT4oVLMProvider,
)
from .specialized.cubicasa_unet import CubiCasaUNetProvider
from .specialized.openbim_unet import OpenBIMUNetProvider

_PROVIDERS: Dict[str, Type[FloorPlanProvider]] = {}


def register_provider(cls: Type[FloorPlanProvider]) -> Type[FloorPlanProvider]:
    """Register a provider class under `cls.id`."""
    if cls.id in _PROVIDERS:
        raise ValueError(f"provider id {cls.id!r} is already registered")
    _PROVIDERS[cls.id] = cls
    return cls


def get_provider(provider_id: str) -> FloorPlanProvider:
    """Instantiate a provider by id."""
    if provider_id not in _PROVIDERS:
        raise KeyError(
            f"unknown provider {provider_id!r}; available: {sorted(_PROVIDERS)}"
        )
    return _PROVIDERS[provider_id]()


def available_providers() -> list[str]:
    return sorted(_PROVIDERS)


def provider_licensing(provider_id: str) -> Licensing:
    cls = _PROVIDERS.get(provider_id)
    if cls is None:
        raise KeyError(f"unknown provider {provider_id!r}")
    return cls.licensing()


register_provider(BaselineProvider)
register_provider(GPT4oVLMProvider)
register_provider(GPT4oReconstructVLMProvider)
register_provider(GPT41MiniVLMProvider)
register_provider(CubiCasaUNetProvider)
register_provider(OpenBIMUNetProvider)