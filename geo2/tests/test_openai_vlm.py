"""Offline tests for the Phase 2 OpenAI VLM providers.

These tests NEVER call the network: they cover token estimation, provider
registration, licensing records, usage telemetry plumbing, and the env-file
key fallback. Live API calls are exercised by the benchmark runner, not here.
"""

from __future__ import annotations

import pytest

from geometry_ai.providers import (
    available_providers,
    get_provider,
    provider_licensing,
)
from geometry_ai.providers.base import FloorPlanProvider, UsageInfo
from geometry_ai.providers.openai_vlm import (
    GPT41MiniVLMProvider,
    GPT4oReconstructVLMProvider,
    GPT4oVLMProvider,
    OpenAIVLMProvider,
    _env_or_envfile,
    estimate_gpt41_image_tokens,
    estimate_gpt4o_image_tokens,
)


def test_vlm_providers_registered():
    for pid in (
        "gpt-4o-vlm",
        "gpt-4o-vlm-reconstruct",
        "gpt-4.1-mini-vlm",
    ):
        assert pid in available_providers()
        assert isinstance(get_provider(pid), FloorPlanProvider)


def test_provider_ids_and_models():
    assert GPT4oVLMProvider().id == "gpt-4o-vlm"
    assert GPT4oVLMProvider().model == "gpt-4o"
    assert GPT4oReconstructVLMProvider().variant == "B"
    assert GPT41MiniVLMProvider().model == "gpt-4.1-mini"


def test_variant_prompts_differ():
    a = GPT4oVLMProvider()._system_prompt()
    b = GPT4oReconstructVLMProvider()._system_prompt()
    assert a != b
    assert "coordinates" in a.lower() or "Coordinate" in a
    assert "footprint" in b


def test_gpt4o_image_token_estimates():
    # official convention: 85 base + 170 per 512x512 tile
    assert estimate_gpt4o_image_tokens(1000, 760) == 765  # 2x2 tiles
    assert estimate_gpt4o_image_tokens(1200, 840) == 1105  # 3x2 tiles after 768 short side


def test_gpt41_image_token_estimates():
    # patch-based 32px patches x 1.62
    assert estimate_gpt41_image_tokens(1000, 760) == 1244  # ceil(1000/32)*ceil(760/32)=32*24=768*1.62


def test_usage_info_roundtrip():
    u = UsageInfo(
        input_tokens=2500,
        output_tokens=1300,
        image_tokens=765,
        estimated_cost_usd=0.019505,
        cost_status="estimated",
    )
    d = u.to_dict()
    assert d["input_tokens"] == 2500
    assert d["estimated_cost_usd"] == 0.019505
    assert d["cost_status"] == "estimated"


def test_env_or_envfile(tmp_path):
    envfile = tmp_path / "x.env"
    envfile.write_text("OPENAI_API_KEY=sk-abc\nIGNORED=1\n")
    assert _env_or_envfile("OPENAI_API_KEY", envfile) == "sk-abc"
    assert _env_or_envfile("OPENAI_API_KEY", None) == ""
    assert _env_or_envfile("MISSING", envfile) == ""


def test_licensing_record_commercial():
    lic = provider_licensing("gpt-4o-vlm")
    assert lic.commercial_use == "permitted"
    assert "OpenAI" in lic.license
    assert lic.weights_license == "n/a (hosted API, no downloadable weights)"