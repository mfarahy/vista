"""Phase 5 — VLM semantic floor-plan benchmark.

Runs a vision-language model against the same fixtures the ResNet34-UNet
pipeline was evaluated on and records its *semantic* reading of each plan
(rooms, doors, windows, stairs, labels, furniture-vs-architecture) as
constrained structured JSON — deliberately without pixel geometry.

For every fixture × model this writes:

    output/phase5/<fixture>.<model>.json — full response, validation result,
                                           timing, token usage, cost estimate
    output/phase5/summary.md             — compact comparison table

The model output is validated before it is trusted: JSON parse, required
fields, enum stability. Nothing here is fused into VistaGeometry — this phase
is a benchmark only.

Run:
    python -m geometry_ai.vlm_benchmark [--fixtures fixtures] [--output output]
        [--models gpt-4o-mini,gpt-5.6-luna] [--max-tokens 1200]
    python -m geometry_ai.vlm_benchmark --summary-only   # no API calls

Configuration (mirrors expose-service/.env):
    OPENAI_API_KEY   — OpenAI-compatible API key (falls back to
                       expose-service/.env when not set)
    OPENAI_BASE_URL  — default https://api.openai.com/v1
    OPENAI_MODEL     — default model when --models is omitted
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import platform
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Per-1M-token list prices in USD (provider published list prices at eval
# time; None = no stable public price for this model). Token counts are
# always recorded regardless of the price table.
MODEL_PRICES_USD = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    # OpenAI list price after the 2026-07-30 cut (short context).
    "gpt-5.6-luna": {"input": 0.20, "output": 1.20},
}

ROOM_TYPES = (
    "bedroom",
    "bathroom",
    "kitchen",
    "living_room",
    "dining_room",
    "hallway",
    "storage",
    "utility",
    "hobby_room",
    "garage",
    "porch",
    "balcony",
    "stairs",
    "other",
    "unknown",
)

DOOR_TYPES = ("interior", "exterior", "unknown")
ANNOTATION_KINDS = ("room_label", "dimension", "title", "note")
CONFIDENCE_LEVELS = ("high", "medium", "low")

# A single JSON schema shared by every model so results are comparable.
SCHEMA = {
    "type": "object",
    "properties": {
        "spaces": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": ["string", "null"]},
                    "type": {"type": "string", "enum": list(ROOM_TYPES)},
                    "enclosed": {"type": "boolean"},
                    "usable": {"type": "boolean"},
                    "relative_location": {"type": "string"},
                },
                "required": ["label", "type", "enclosed", "usable", "relative_location"],
                "additionalProperties": False,
            },
        },
        "doors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "count": {"type": "integer"},
                    "type": {"type": "string", "enum": list(DOOR_TYPES)},
                    "connects": {"type": "string"},
                    "relative_location": {"type": "string"},
                },
                "required": ["count", "type", "connects", "relative_location"],
                "additionalProperties": False,
            },
        },
        "windows": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "count": {"type": "integer"},
                    "space": {"type": ["string", "null"]},
                    "wall": {"type": "string"},
                    "relative_location": {"type": "string"},
                },
                "required": ["count", "space", "wall", "relative_location"],
                "additionalProperties": False,
            },
        },
        "stairs": {
            "type": "object",
            "properties": {
                "present": {"type": "boolean"},
                "relative_location": {"type": ["string", "null"]},
                "direction": {"type": ["string", "null"], "enum": ["up", "down", "unknown", None]},
            },
            "required": ["present", "relative_location", "direction"],
            "additionalProperties": False,
        },
        "dimensions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "value": {"type": "string"},
                    "unit": {"type": "string", "enum": ["m", "cm", "mm", "unknown"]},
                },
                "required": ["value", "unit"],
                "additionalProperties": False,
            },
        },
        "annotations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "kind": {"type": "string", "enum": list(ANNOTATION_KINDS)},
                },
                "required": ["text", "kind"],
                "additionalProperties": False,
            },
        },
        "furniture": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "item": {"type": "string"},
                    "space": {"type": ["string", "null"]},
                },
                "required": ["item", "space"],
                "additionalProperties": False,
            },
        },
        "notes": {
            "type": "object",
            "properties": {
                "overall_confidence": {"type": "string", "enum": list(CONFIDENCE_LEVELS)},
                "issues": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["overall_confidence", "issues"],
            "additionalProperties": False,
        },
    },
    "required": [
        "spaces",
        "doors",
        "windows",
        "stairs",
        "dimensions",
        "annotations",
        "furniture",
        "notes",
    ],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """\
You are an expert architectural analyst reading a 2D floor plan as an \
architectural drawing.

Extract the SEMANTIC content of the plan. You are explicitly NOT asked for \
pixel geometry: never output x/y coordinates, never output polygons, never \
output measurements in pixels.

Rules:
1. spaces: every enclosed or usable space. Keep the visible room label \
exactly as printed (for example "Bedroom 3", "Heizung", "Hobbyraum", "Flur", \
"Öl") — do not translate it. Use "label": null when no label is visible. \
Classify each space with one of the allowed types. "enclosed" means the space \
is bounded by walls; "usable" means it is a real usable interior/exterior \
space, not furniture, a void, or decoration. Give only a relative location \
(e.g. "top-left corner", "north wall centre"), never coordinates.
2. doors: count visible door symbols. Distinguish interior vs exterior when \
reasonably inferable, otherwise "unknown". Note which spaces they connect \
and their approximate relative location.
3. windows: count visible windows, the space and wall they belong to where \
reasonably inferable, and their approximate relative location.
4. stairs: whether stairs exist, where, and whether they go up or down when \
visually inferable.
5. dimensions: report visible dimension annotations as text only (e.g. \
"7000", "11725", "8,40 m"). Never convert them into a scale or a real-world \
length.
6. annotations: any other visible text (titles, notes) that is not a room \
label or dimension.
7. furniture: every furniture/decoration item (bed, sofa, table, chair, \
cabinet, TV, plant, pool table, boiler, tank, ...). Furniture must NEVER \
appear in spaces, doors, windows or any geometry-adjacent field.
8. If something is not reliably readable or inferable, use "unknown" or \
"null" — never guess.
9. Only include elements that are actually visible in the drawing. \
Do not invent rooms, doors, windows or stairs.
Respond with the JSON structure only — no markdown, no commentary.\
"""


def _api_config() -> tuple[str, str, str]:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        env_file = ROOT.parent / "expose-service" / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("OPENAI_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        raise SystemExit(
            "OPENAI_API_KEY is not set (and expose-service/.env is not available)."
        )
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    return key, base, model


def _call_vlm(key: str, base: str, model: str, image_bytes: bytes, max_tokens: int, mime: str = "image/png") -> dict:
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Analyze the attached 2D floor plan and return the "
                            "semantic JSON structure described by the system prompt."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime};base64,{base64.b64encode(image_bytes).decode()}"
                        },
                    },
                ],
            },
        ],
        "max_tokens": max_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "floor_plan_semantics", "strict": True, "schema": SCHEMA},
        },
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        if e.code == 400 and "max_tokens" in detail and "max_completion_tokens" in detail:
            # Reasoning-family models reject max_tokens; retry with the
            # completion-token spelling.
            body.pop("max_tokens", None)
            body["max_completion_tokens"] = max_tokens
            req2 = urllib.request.Request(
                f"{base}/chat/completions",
                data=json.dumps(body).encode(),
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req2, timeout=240) as resp:
                return json.loads(resp.read().decode())
        raise urllib.error.HTTPError(
            req.full_url, e.code, f"{e.msg}: {detail[:400]}", e.headers, None
        )


def validate(payload: dict) -> dict:
    """Validate the parsed model output; returns {ok, errors}. Never trusts
    raw model output without this step."""
    errors: list[str] = []

    def err(msg: str) -> None:
        errors.append(msg)

    for field in (
        "spaces",
        "doors",
        "windows",
        "stairs",
        "dimensions",
        "annotations",
        "furniture",
        "notes",
    ):
        if field not in payload:
            err(f"missing required field '{field}'")

    if "spaces" in payload and isinstance(payload["spaces"], list):
        for i, s in enumerate(payload["spaces"]):
            if not isinstance(s, dict):
                err(f"spaces[{i}] is not an object")
                continue
            if s.get("type") not in ROOM_TYPES:
                err(f"spaces[{i}] invalid room type {s.get('type')!r}")
            for f in ("label", "type", "enclosed", "usable", "relative_location"):
                if f not in s:
                    err(f"spaces[{i}] missing '{f}'")
    else:
        err("'spaces' is not an array")

    if "doors" in payload and isinstance(payload["doors"], list):
        for i, d in enumerate(payload["doors"]):
            if d.get("type") not in DOOR_TYPES:
                err(f"doors[{i}] invalid door type {d.get('type')!r}")
            if not isinstance(d.get("count"), int) or d.get("count", 0) < 1:
                err(f"doors[{i}] invalid count")
    else:
        err("'doors' is not an array")

    if "windows" in payload and isinstance(payload["windows"], list):
        for i, w in enumerate(payload["windows"]):
            if not isinstance(w.get("count"), int) or w.get("count", 0) < 1:
                err(f"windows[{i}] invalid count")
    else:
        err("'windows' is not an array")

    if "stairs" in payload and isinstance(payload["stairs"], dict):
        if not isinstance(payload["stairs"].get("present"), bool):
            err("'stairs.present' is not a boolean")
        if payload["stairs"].get("direction") not in ("up", "down", "unknown", None):
            err(f"stairs.direction invalid {payload['stairs'].get('direction')!r}")
    else:
        err("'stairs' is not an object")

    if "dimensions" in payload and isinstance(payload["dimensions"], list):
        for i, d in enumerate(payload["dimensions"]):
            if d.get("unit") not in ("m", "cm", "mm", "unknown"):
                err(f"dimensions[{i}] invalid unit {d.get('unit')!r}")
    else:
        err("'dimensions' is not an array")

    if "furniture" in payload and not isinstance(payload["furniture"], list):
        err("'furniture' is not an array")
    if "annotations" in payload and not isinstance(payload["annotations"], list):
        err("'annotations' is not an array")
    if "notes" in payload and isinstance(payload["notes"], dict):
        if payload["notes"].get("overall_confidence") not in CONFIDENCE_LEVELS:
            err(f"notes.overall_confidence invalid {payload['notes'].get('overall_confidence')!r}")
    else:
        err("'notes' is not an object")

    return {"ok": not errors, "errors": errors}


_NULL_STRINGS = ("null", "unknown", "none", "n/a")


def _clean(value):
    """Map placeholder strings ("null", "unknown" in string fields) and
    null-like values to None so the normalized reading contains only real
    observations. Kept separate from the raw payload."""
    if value is None:
        return None
    if isinstance(value, str) and value.strip().lower() in _NULL_STRINGS:
        return None
    return value


def normalize(payload: dict) -> dict:
    """Produce a *normalized* semantic reading used for counting and
    comparison. The raw payload is preserved untouched; this function only
    drops placeholder rows (count 0, "null"/"unknown" strings) that the
    models emit when nothing was found. Documented, not hidden."""
    result = {
        "spaces": [
            {
                **s,
                "label": _clean(s.get("label")),
                "relative_location": _clean(s.get("relative_location")),
            }
            for s in payload.get("spaces", [])
            if isinstance(s, dict)
        ],
        "doors": [
            {**d, "connects": _clean(d.get("connects")), "relative_location": _clean(d.get("relative_location"))}
            for d in payload.get("doors", [])
            if isinstance(d, dict) and isinstance(d.get("count"), int) and d.get("count", 0) > 0
        ],
        "windows": [
            {**w, "space": _clean(w.get("space")), "wall": _clean(w.get("wall")), "relative_location": _clean(w.get("relative_location"))}
            for w in payload.get("windows", [])
            if isinstance(w, dict) and isinstance(w.get("count"), int) and w.get("count", 0) > 0
        ],
        "stairs": {
            "present": bool(payload.get("stairs", {}).get("present")),
            "relative_location": _clean(payload.get("stairs", {}).get("relative_location")),
            "direction": _clean(payload.get("stairs", {}).get("direction")),
        },
        "dimensions": [
            {**d, "value": _clean(d.get("value"))}
            for d in payload.get("dimensions", [])
            if isinstance(d, dict) and _clean(d.get("value")) is not None
        ],
        "annotations": [
            {**a, "text": _clean(a.get("text"))}
            for a in payload.get("annotations", [])
            if isinstance(a, dict) and _clean(a.get("text")) is not None
        ],
        "furniture": [
            {**f, "item": _clean(f.get("item")), "space": _clean(f.get("space"))}
            for f in payload.get("furniture", [])
            if isinstance(f, dict) and _clean(f.get("item")) is not None
        ],
    }
    return result


def cost_estimate(model: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    price = MODEL_PRICES_USD.get(model.split("-2024")[0])
    if not price:
        return None
    return prompt_tokens / 1_000_000 * price["input"] + completion_tokens / 1_000_000 * price["output"]


def run_fixture(key: str, base: str, model: str, img_path: Path, max_tokens: int) -> dict:
    image_bytes = img_path.read_bytes()
    mime = "image/jpeg" if img_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    t0 = time.perf_counter()
    raw = _call_vlm(key, base, model, image_bytes, max_tokens, mime)
    latency_ms = round((time.perf_counter() - t0) * 1000, 1)

    usage = raw.get("usage", {})
    content = raw["choices"][0]["message"]["content"]
    raw_payload = json.loads(content)  # strict json_schema => plain JSON, no fences
    validation = validate(raw_payload)

    return {
        "fixture": img_path.name,
        "model": raw.get("model", model),
        "latency_ms": latency_ms,
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
        "cost_estimate_usd": cost_estimate(model, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)),
        "validation": validation,
        "payload": raw_payload,
        "normalized": normalize(raw_payload),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--fixtures", type=Path, default=ROOT / "fixtures")
    p.add_argument("--output", type=Path, default=ROOT / "output" / "phase5")
    p.add_argument("--models", default=None, help="comma-separated model ids")
    p.add_argument("--max-tokens", type=int, default=1200)
    p.add_argument(
        "--summary-only",
        action="store_true",
        help="regenerate summary.md from saved response files without calling the API",
    )
    args = p.parse_args()

    key, base, default_model = _api_config()
    models = [m.strip() for m in (args.models or default_model).split(",") if m.strip()]

    out = args.output
    (out / "responses").mkdir(parents=True, exist_ok=True)

    if args.summary_only:
        rows = []
        for resp_path in sorted((out / "responses").glob("*.json")):
            row = json.loads(resp_path.read_text(encoding="utf-8"))
            row["cost_estimate_usd"] = cost_estimate(
                row["model"],
                row.get("prompt_tokens") or 0,
                row.get("completion_tokens") or 0,
            )
            rows.append(row)
        _write_summary(out, rows)
        print(f"Summary regenerated from {len(rows)} saved responses in {out}")
        return

    images = sorted(args.fixtures.glob("*.png")) + sorted(args.fixtures.glob("*.jpg"))
    rows: list[dict] = []
    for model in models:
        for img_path in images:
            print(f"=== {img_path.name} @ {model} ===")
            result = run_fixture(key, base, model, img_path, args.max_tokens)
            print(
                f"  latency {result['latency_ms']} ms, tokens "
                f"{result['prompt_tokens']}+{result['completion_tokens']}, "
                f"validation {'OK' if result['validation']['ok'] else 'FAIL: ' + '; '.join(result['validation']['errors'][:3])}"
            )
            rows.append(result)
            (out / "responses" / f"{img_path.stem}.{model}.json").write_text(
                json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
            )

    _write_summary(out, rows)
    print(f"\nDone. Output in {out}")


def _write_summary(out: Path, rows: list[dict]) -> None:
    lines = [
        "# Phase 5 — VLM semantic floor-plan benchmark summary",
        "",
        f"- Hardware: {platform.node()} · {platform.processor()} · Python {platform.python_version()}",
        "- Provider: OpenAI-compatible chat completions, strict json_schema",
        "",
        "| Fixture | Model | latency(ms) | in tokens | out tokens | cost(USD) | validation | rooms | doors | windows | stairs | dims | furniture |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        payload = r["normalized"]
        rooms = len(payload.get("spaces", []))
        doors = sum(d.get("count", 0) for d in payload.get("doors", []))
        windows = sum(w.get("count", 0) for w in payload.get("windows", []))
        stairs = payload.get("stairs", {}).get("present")
        dims = len(payload.get("dimensions", []))
        furniture = len(payload.get("furniture", []))
        cost = r["cost_estimate_usd"]
        lines.append(
            "| {fixture} | {model} | {latency_ms} | {prompt_tokens} | {completion_tokens} | "
            "{cost} | {validation} | {rooms} | {doors} | {windows} | {stairs} | {dims} | {furniture} |".format(
                fixture=r["fixture"],
                model=r["model"],
                latency_ms=r["latency_ms"],
                prompt_tokens=r["prompt_tokens"],
                completion_tokens=r["completion_tokens"],
                cost="—" if cost is None else f"{cost:.4f}",
                validation="OK" if r["validation"]["ok"] else "FAIL",
                rooms=rooms,
                doors=doors,
                windows=windows,
                stairs=stairs,
                dims=dims,
                furniture=furniture,
            )
        )
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()