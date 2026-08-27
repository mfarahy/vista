"""OpenAI multimodal (VLM) provider for geo2 Phase 2.

Direct-geometry experiment: the model receives the floor-plan image and is
instructed to understand the complete architectural structure and emit it in
geo2's canonical `FloorPlanGeometry` schema, with coordinates relative to the
source image (origin top-left, x → right, y → down, units px).

Where the API supports it (gpt-4o snapshot 2024-08-06+ and gpt-4.1-mini), the
call uses OpenAI **Structured Outputs** (native JSON Schema enforced), parsing
straight into the shared `FloorPlanGeometry` Pydantic model — so every result
passes the exact same geo2 validation layer, never a provider-specific schema.

Prompt variants (Step 7 of the Phase 2 plan):
- variant "A" — Direct Geometry: ask the model directly for canonical geometry.
- variant "B" — Architectural Reconstruction: ask the model to first work out
  the conceptual structure (footprint → rooms → walls → openings → stairs →
  labels/dims) and then emit the canonical geometry. No hidden reasoning is
  requested or emitted; only the final structured document is compared.

Cost is recorded from official OpenAI prices × actual token usage returned by
the API (input tokens already include the billed image tokens).
"""

from __future__ import annotations

import base64
import io
import math
import os
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

from ..schema import FloorPlanGeometry
from .base import FloorPlanProvider, Licensing, UsageInfo


def _env_or_envfile(name: str, envfile: Path, default: str = "") -> str:
    """Read `name` from the environment, falling back to a `<key>=<value>` env file."""
    val = os.environ.get(name)
    if val:
        return val
    if envfile and envfile.is_file():
        for line in envfile.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                if k == name:
                    return v
    return default


def encode_image(image: np.ndarray, fmt: str = "PNG") -> str:
    """Encode an HxWx3 uint8 RGB array as a base64 `data:` URL."""
    im = Image.fromarray(image).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, format=fmt)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    mime = "image/png" if fmt.upper() == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


def estimate_gpt4o_image_tokens(width: int, height: int) -> int:
    """GPT-4o image token estimator (official: 85 base + 170/512px tile)."""
    long, short = max(width, height), min(width, height)
    if long > 2048:
        scale = 2048 / long
        width, height = int(width * scale), int(height * scale)
    new_short = min(width, height)
    if new_short > 768:
        scale = 768 / new_short
        width, height = max(1, int(width * scale)), max(1, int(height * scale))
    tiles = math.ceil(width / 512.0) * math.ceil(height / 512.0)
    return 85 + 170 * tiles


def estimate_gpt41_image_tokens(width: int, height: int) -> int:
    """GPT-4.1 patch-based image token estimator (32px patches ×1.62)."""
    long = max(width, height)
    if long > 2048:
        scale = 2048 / long
        width, height = int(width * scale), int(height * scale)
    patches = math.ceil(width / 32.0) * math.ceil(height / 32.0)
    return int(round(patches * 1.62))


SYSTEM_DIRECT = """\
You are an automated architectural CAD reader. You convert a floor-plan image \
into a machine-readable 2D architectural geometry document.

You must understand the complete architectural structure and reconstruct:
- exterior walls
- interior walls
- rooms (each enclosed space as a closed polygon)
- room labels and room types
- doors (each attached to a wall)
- windows (each attached to a wall)
- stairs (as a coarse region polygon)
- visible text labels
- dimension lines with numeric values

Coordinate system (CRITICAL):
- all coordinates are relative to the supplied image, in pixels (px)
- origin = top-left corner of the image
- x increases to the right
- y increases downward
- source.width and source.height are the image dimensions; use them and clamp
  every coordinate inside the image
- match pixel locations to the plan as precisely as you can

Absolute rules:
- Use image evidence only. Do NOT invent walls, rooms, doors, windows, stairs
  or labels that are not visible.
- Do NOT treat furniture, furniture symbols, plants, hatching or decoration as
  architecture.
- Distinguish architectural boundaries (walls) from furniture/drawing content.
- Walls must connect to neighbouring walls; preserve wall connectivity.
- Doors and windows must lie ON a wall and reference that wall's id.
- Room polygons must be closed (>= 3 vertices), follow the wall lines and not
  merge separate rooms.
- Preserve uncertainty: when unsure about an entity or its location, set its
  confidence below 1.0 (e.g. 0.5-0.9). Never overstate certainty.
- Assign unique ids per type, e.g. wall-1, room-1, door-1, win-1, stair-1,
  label-1, dim-1.
- Return ONLY the structured JSON document. Do not explain reasoning and do not
  add commentary or chain-of-thought."""

SYSTEM_RECONSTRUCT = """\
You are an automated architectural CAD reader. You convert a floor-plan image \
into a machine-readable 2D architectural geometry document.

Approach — first work out the architectural structure conceptually, then emit \
the final geometry:
1. Building footprint: the outer building outline and its exterior walls.
2. Rooms: every enclosed space, its type and its label.
3. Interior walls: the wall segments that partition the spaces.
4. Openings: doors and windows, and the exact wall that hosts each.
5. Stairs: the staircase region.
6. Labels and dimensions: visible text and dimension lines with numeric values.

Coordinate system (CRITICAL):
- all coordinates are relative to the supplied image, in pixels (px)
- origin = top-left corner of the image
- x increases to the right
- y increases downward
- source.width and source.height are the image dimensions; use them and clamp
  every coordinate inside the image
- match pixel locations to the plan as precisely as you can

Absolute rules:
- Use image evidence only. Do NOT invent walls, rooms, doors, windows, stairs
  or labels that are not visible.
- Do NOT treat furniture, furniture symbols, plants, hatching or decoration as
  architecture.
- Walls must connect to neighbouring walls; preserve wall connectivity.
- Doors and windows must lie ON a wall and reference that wall's id.
- Room polygons must be closed (>= 3 vertices), follow the wall lines and not
  merge separate rooms.
- Preserve uncertainty: when unsure about an entity or its location, set its
  confidence below 1.0 (e.g. 0.5-0.9). Never overstate certainty.
- Assign unique ids per type, e.g. wall-1, room-1, door-1, win-1, stair-1,
  label-1, dim-1.
- Do NOT output the conceptual analysis. Return ONLY the final structured JSON
  document; no explanation and no chain-of-thought."""


class OpenAIVLMProvider(FloorPlanProvider):
    """Hosted OpenAI multimodal provider targeting the geo2 canonical schema.

    Subclasses set `model`, `variant`, and the official per-1M-token prices so
    cost is derived from real usage × official prices (never guessed).
    """

    id = "openai-vlm-abstract"
    model: str = "gpt-4o"
    variant: str = "A"  # "A" = direct geometry, "B" = architectural reconstruction
    price_per_mtok_input: float = 2.50  # USD per 1M input tokens (gpt-4o, official)
    price_per_mtok_output: float = 10.00  # USD per 1M output tokens (gpt-4o, official)
    image_token_est: str = "gpt4o"  # which official estimator to log as image_tokens
    max_output_tokens: int = 4096

    _envfile: Path = Path(__file__).resolve().parents[2] / ".env"

    def __init__(self) -> None:
        self.last_usage: Optional[UsageInfo] = None

    @classmethod
    def api_key(cls) -> str:
        return _env_or_envfile("OPENAI_API_KEY", cls._envfile)

    def _system_prompt(self) -> str:
        return SYSTEM_RECONSTRUCT if self.variant == "B" else SYSTEM_DIRECT

    def _client(self):
        from openai import OpenAI

        key = self.api_key()
        if not key:
            raise RuntimeError(
                "OPENAI_API_KEY is not set (env or geo2/.env); cannot call the hosted API"
            )
        return OpenAI(api_key=key)

    def _estimate_image_tokens(self, width: int, height: int) -> int:
        if self.image_token_est == "gpt4.1":
            return estimate_gpt41_image_tokens(width, height)
        return estimate_gpt4o_image_tokens(width, height)

    def _build_input(self, image: np.ndarray) -> list[dict]:
        h, w = image.shape[0], image.shape[1]
        data_url = encode_image(image)
        user = (
            f"Here is the floor-plan image ({w} px wide, {h} px tall). "
            "Return the complete architectural geometry of this plan as the supplied "
            "JSON schema, following the coordinate system and rules above. "
            "Return only the structured JSON document."
        )
        return [
            {"role": "system", "content": self._system_prompt()},
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": user},
                    {"type": "input_image", "image_url": data_url},
                ],
            },
        ]

    def _record_usage(self, response) -> None:
        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", None)
        output_tokens = getattr(usage, "output_tokens", None)
        if input_tokens and output_tokens:
            cost = (
                input_tokens / 1_000_000.0 * self.price_per_mtok_input
                + output_tokens / 1_000_000.0 * self.price_per_mtok_output
            )
        else:
            cost = None
        self.last_usage = UsageInfo(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            image_tokens=self._last_image_tokens,
            estimated_cost_usd=cost,
            cost_status="estimated" if cost is not None else "unknown",
            raw={"model": self.model},
        )

    def _structured_call(self, client, input_msgs: list[dict], h: int, w: int):
        """Native Structured Outputs (JSON Schema enforced, parsed into the schema)."""
        resp = client.responses.parse(
            model=self.model,
            input=input_msgs,
            text_format=FloorPlanGeometry,
            max_output_tokens=self.max_output_tokens,
            temperature=0.0,
        )
        return resp

    def _json_call(self, client, input_msgs: list[dict]):
        """Fallback: JSON object mode + Pydantic validation (no provider schema)."""
        resp = client.responses.create(
            model=self.model,
            input=input_msgs,
            text={"format": {"type": "json_object"}},
            max_output_tokens=self.max_output_tokens,
            temperature=0.0,
        )
        text = resp.output_text
        import json

        obj = json.loads(text)
        geo = FloorPlanGeometry.model_validate(obj)
        return geo, resp

    def analyze(self, image: np.ndarray) -> FloorPlanGeometry:
        h, w = image.shape[0], image.shape[1]
        self._last_image_tokens = self._estimate_image_tokens(w, h)
        client = self._client()
        input_msgs = self._build_input(image)

        try:
            resp = self._structured_call(client, input_msgs, h, w)
            geo = resp.output_parsed
        except Exception as first_err:  # e.g. safety refusal / API schema hiccup
            try:
                geo, resp = self._json_call(client, input_msgs)
            except Exception as second_err:
                raise RuntimeError(
                    f"OpenAI call failed (structured: {first_err}; json fallback: {second_err})"
                ) from second_err

        self._record_usage(resp)
        return geo

    @classmethod
    def licensing(cls) -> Licensing:
        return Licensing(
            name=cls.id,
            source="https://platform.openai.com/api/pricing",
            license="OpenAI proprietary API (pay-per-token)",
            commercial_use="permitted",
            weights_license="n/a (hosted API, no downloadable weights)",
            inference_requirements="cloud API; structured outputs: gpt-4o-2024-08-06+ / gpt-4.1-mini",
        )


class GPT4oVLMProvider(OpenAIVLMProvider):
    """GPT-4o — strong hosted multimodal candidate (prompt variant A)."""

    id = "gpt-4o-vlm"
    model = "gpt-4o"
    variant = "A"
    price_per_mtok_input = 2.50
    price_per_mtok_output = 10.00
    image_token_est = "gpt4o"


class GPT4oReconstructVLMProvider(OpenAIVLMProvider):
    """GPT-4o — prompt variant B: architectural reconstruction before geometry."""

    id = "gpt-4o-vlm-reconstruct"
    model = "gpt-4o"
    variant = "B"
    price_per_mtok_input = 2.50
    price_per_mtok_output = 10.00
    image_token_est = "gpt4o"


class GPT41MiniVLMProvider(OpenAIVLMProvider):
    """GPT-4.1-mini — cost-efficient hosted multimodal candidate (variant A)."""

    id = "gpt-4.1-mini-vlm"
    model = "gpt-4.1-mini"
    variant = "A"
    price_per_mtok_input = 0.40
    price_per_mtok_output = 1.60
    image_token_est = "gpt4.1"