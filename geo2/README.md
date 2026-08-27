# geo2 — Clean-Room Floor Plan Geometry Engine

> geo2 is an independent Floor Plan Image → Geometry JSON research/product
> pipeline.

`geo2` is a standalone, experimental implementation that turns a floor-plan
image into validated, domain-neutral 2D architectural geometry JSON (walls,
rooms, doors, windows, stairs, labels, dimensions, scale). It is deliberately
independent from the repository's existing `geometry-ai` research baseline
(UNet → VLM → Fusion → Recovery). The existing pipeline is **not** refactored,
imported, or modified; `geo2` only reuses its authored **fixture images** as
benchmark inputs.

No 3D, no 360, no Vista integration, no frontend, no database, no production
deployment infrastructure.

## What problem it solves

We want to objectively answer "which AI approach is best for floor-plan →
geometry?" Before picking an architecture (specialised CV vs. strong VLM vs.
open multimodal vs. hybrid vs. external API), we need a clean, **model
agnostic** benchmark foundation:

- one canonical geometry schema every candidate provider must target
- strict validation that rejects malformed output
- per-image results: `result.json`, `overlay.png`, `metrics.json`
- recorded `latency_ms` and a place for `estimated_cost_usd`
- documented licensing for every model/provider

Phase 1 builds only that foundation with a deliberately simple baseline
provider — it does **not** decide the final architecture.

## Layout

```text
geo2/
  README.md
  LICENSING.md         licensing register incl. Phase 2 providers + investigated candidates
  pyproject.toml
  geometry_ai/
    __init__.py
    schema.py           canonical Pydantic geometry schema (geo2-1.0)
    validation.py       geometric invariant checks
    geoutil.py          numpy-only 2D helpers (distance, point-in-polygon, IoU)
    pipeline.py         image → provider → validate → canonical JSON (+ UsageInfo telemetry)
    visualize.py        overlay renderer (evaluation only)
    metrics.py          structural benchmark metrics
    providers/
      base.py           FloorPlanProvider interface + Licensing + UsageInfo
      baseline.py       deterministic baseline provider
      openai_vlm.py     Phase 2 hosted OpenAI VLM providers (Structured Outputs)
      __init__.py       provider registry
  evaluation/
    manifest.py         fixture manifest (images + optional ground truth)
    run.py              benchmark runner (CLI, cost/latency recording, --resume)
    phase2-report.md    Phase 2 benchmark report + architecture recommendation
    phase2-candidates.md Phase 2 candidate research records (official sources)
  fixtures/             floor-plan images + ground_truth/ (geo2-gt-v1)
  output/               per-provider per-fixture results (gitignored)
  tests/                pytest suite (no GPU, no weights, no network for unit tests)
```

## The geometry schema

`FloorPlanGeometry` (`geometry_ai/schema.py`) — the canonical domain-neutral
document:

```text
FloorPlanGeometry
├── version            "geo2-1.0"
├── source             {width, height} (pixels)
├── units              "px"
├── walls[]            {id, start, end, thickness, type, confidence}
├── rooms[]            {id, name?, type, polygon[], wall_ids[], confidence}
├── doors[]            {id, wall_id, position, width, swing?, confidence}
├── windows[]          {id, wall_id, position, width, confidence}
├── stairs[]           {id, region[], direction?, confidence}
├── labels[]           {id, text, position, confidence}
├── dimensions[]       {id, value, unit?, start, end, confidence}
└── scale?             {pixel_distance, real_distance, unit, confidence}
```

- `Wall.type` ∈ `exterior | interior | unknown`.
- `Room.type` is an **open string** (extensible but deliberately not a large
  enum tree). `scale` stays `null` — scale estimation is a future phase.
- Strictness: Pydantic models use `extra="forbid"`, reject NaN/inf floats,
  enforce non-negative widths and `[0,1]` confidence.

Two validation layers (see `validation.py` and `pipeline.py`):

1. **Schema validation** — Pydantic rejects malformed/mistyped output.
2. **Geometry validation** — invariant checks: finite in-bounds coordinates,
   valid polygons (≥3 pts, no duplicate vertices), non-negative/in-sane
   widths, doors/windows `wall_id` → existing wall (+ centre near that wall),
   room `wall_ids` → existing walls, unique well-formed IDs.

```
Image → Provider → Raw result → Schema validation → Geometry validation → Canonical JSON
```

Any invalid result is recorded with its validation errors — never silently
dropped, never reported as "accurate".

## Providers

One interface:

```python
class FloorPlanProvider:
    id: str
    def analyze(self, image: np.ndarray) -> FloorPlanGeometry: ...
```

Providers are registered by `id` in `geometry_ai/providers/__init__.py`.

- **`baseline-mock`** — Phase 1 deterministic placeholder: one rectangle plan
  (exterior loop + one interior divider + one door/window) to validate image
  loading, the provider interface, schema/geometry validation, output, overlay
  and the benchmark. It is not a floor-plan understanding system.

- **`gpt-4o-vlm`** / **`gpt-4o-vlm-reconstruct`** / **`gpt-4.1-mini-vlm`**
  (Phase 2) — hosted OpenAI multimodal providers targeting the canonical
  geometry schema with native Structured Outputs (JSON Schema), parsing directly
  into `FloorPlanGeometry`. `gpt-4o-vlm` is the strong-VLM experiment with
  prompt **variant A** (direct geometry); `gpt-4o-vlm-reconstruct` is the same
  model with **variant B** (architectural reconstruction); `gpt-4.1-mini-vlm` is
  the cost-efficient variant A. They preserve uncertainty via `confidence`,
  use image-relative pixel coordinates (top-left origin, x right, y down) and
  record per-call `input_tokens` / `output_tokens` / `image_tokens` /
  `estimated_cost_usd` derived from **actual** usage × **official** OpenAI
  prices. Requires `OPENAI_API_KEY` (env or `geo2/.env`, git-ignored).

See `evaluation/phase2-report.md` (results) and
`evaluation/phase2-candidates.md` (per-candidate research + why Qwen2.5-VL-7B
and CubiCasa5K were selected but could not run in this GPU-less environment).

## How to run inference

```bash
cd geo2
python3 -m venv .venv
./.venv/bin/pip install -e ".[dev]"

# analyse one image and print the validated geometry as JSON
./.venv/bin/python - <<'PY'
from geometry_ai.pipeline import analyze_path
from geometry_ai.providers import get_provider
r = analyze_path("fixtures/06-basement.png", get_provider("baseline-mock"))
print("success:", r.success, "latency_ms:", r.latency_ms)
if r.success:
    print(r.geometry.model_dump_json(indent=2))
PY
```

## How to run evaluation

```bash
cd geo2
./.venv/bin/python -m evaluation.run --provider baseline-mock --output output
./.venv/bin/python -m evaluation.run --list-providers

# Phase 2 hosted OpenAI VLM providers (OPENAI_API_KEY in env or geo2/.env):
./.venv/bin/python -m evaluation.run --provider gpt-4o-vlm --output output
./.venv/bin/python -m evaluation.run --provider gpt-4o-vlm-reconstruct --output output
./.venv/bin/python -m evaluation.run --provider gpt-4.1-mini-vlm --output output
# resume (skip fixtures whose metric entry already exists, rebuild summary):
./.venv/bin/python -m evaluation.run --provider gpt-4.1-mini-vlm --output output --resume
```

Output per fixture under `output/<provider>/<fixture>/`:

```
result.json   validated geometry (or the raw invalid result + errors)
overlay.png   geometry overlaid on the source image
metrics.json  counts, geometry_valid, latency_ms, + detection vs ground truth
```

plus `output/<provider>/summary.json` / `summary.md`. Recording:

- `latency_ms` — provider call wall time only (validation is harness cost),
  with per-provider mean / median / p95 across the benchmark run.
- `estimated_cost_usd` — always `null` for local providers. Hosted providers
  derive it from actual `input_tokens`/`output_tokens` × official prices; a
  commercial price is never guessed (`cost_status`: `estimated` | `unknown` |
  `n/a`).
- local-model infrastructure fields (`gpu`, `vram_gb`, `inference_time_ms`) are
  recorded via `UsageInfo` when a provider runs on-prem.

The runner is fully model-agnostic:

```
provider → FloorPlanGeometry → validator → metrics → overlay
```

## Ground truth & metrics

`fixtures/ground_truth/*.gt.json` (`geo2-gt-v1`) hold **authored** pixel
ground truth for the two cleanest synthetic plans (05 `cubicasa-style`,
06 `basement`), derived from the generating geometry, not from any old model
output. The benchmark distinguishes:

- **detected** — predicted entity matched within tolerance (greedy 1:1)
- **missing** — a ground-truth entity with no match
- **false positive** — a prediction with no match
- **invalid geometry** — the document failed validation

Metrics (per type): counts, wall segment proximity, room polygon IoU, door/
window positional proximity + wall association, stair location. When no GT is
present only counts + validity are reported — producing valid JSON alone is
never credited as accuracy.

## Current provider licensing

`geo2` records licensing for every provider in `geometry_ai/providers/base.py`
(`Licensing`) and in `LICENSING.md`.

- `baseline-mock` — geo2 project code, MIT; no weights, no GPU, no network.
- `gpt-4o-vlm` / `gpt-4o-vlm-reconstruct` / `gpt-4.1-mini-vlm` — OpenAI
  proprietary API (pay-per-token); commercial use permitted; no downloadable
  weights.

Dependencies of the geo2 code itself: `pydantic` (MIT), `Pillow` (HPND/MIT),
`numpy` (BSD-3), `openai` SDK (Apache-2.0). All commercial-use-unrestricted.

## Phase 2 — Intelligent Vision Geometry Benchmark

Phase 2 turned the Phase 1 foundation into a real benchmark: the strongest
hosted multimodal model available (GPT-4o) and a cost-efficient second model
(GPT-4.1-mini) directly produce canonical geometry via native structured
outputs, and are compared on the identical fixtures/validator/metrics as the
Phase 1 baseline. Results, measured cost/latency, failure analysis and the
architecture recommendation live in `evaluation/phase2-report.md`; per-candidate
research records (official sources) in `evaluation/phase2-candidates.md`.

Highlights (measured):

- Direct-GPT-4o geometry: 7/9 documents geometry-valid, 9/9 valid JSON, 0
  catastrophic failures; matched-room IoU 0.54–0.61 on the authored GT plans.
- Dominant failure mode: door/window wall-association and pixel drift — direct
  image-relative coordinate prediction is only approximately reliable; the
  failure is recorded, not patched with heuristics.
- Prompt variant B (architectural reconstruction) did not beat variant A
  (direct): 6/9 vs 7/9 valid.
- GPT-4.1-mini: ~5× cheaper than GPT-4o at similar accuracy (6/9 valid), higher
  latency.
- Open VLM (Qwen2.5-VL-7B, Apache-2.0) and the specialized floor-plan net
  (CubiCasa5K, CC BY-NC) were selected but could not run here: no CUDA GPU, and
  CubiCasa5K is additionally non-commercial.
- Recommendation: **A — Direct VLM** as the geometry engine direction (see the
  report for the evidence and the conditions).

## Current limitations (Phase 2)

- No real floor-plan understanding in `baseline-mock` (infra stand-in).
- Hosted VLM coordinate precision is the known bottleneck (openings); measured,
  not automatically repaired.
- Open/specialized GPU models could not be executed in this environment
  (documented, not fabricated).
- Overlay renderer is for qualitative evaluation only.
- Metric tolerances are simple distance fractions and sampled IoU.
- No API server, auth, billing, or database — by design.

## Future provider candidates

Benchmarking candidates to plug into the same interface (each with a
documented `Licensing` record, latency + cost recorded by the same harness):

- open multimodal: local vision-language model (e.g. Qwen2.5-VL-7B — Apache-2.0,
  commercial OK; needs CUDA GPU ~13 GB VRAM; selected, not run here)
- specialised CV: segmentation-to-vector of an open model (CubiCasa5K-trained
  ResNet34-UNet is **CC BY-NC / non-commercial** → requires a separate license;
  CUDA GPU required)
- other hosted multimodal: Claude Sonnet / Gemini (structured outputs available;
  reference records in `evaluation/phase2-candidates.md`)
- external API: commercial floor-plan geometry API (MeltFlex: no verifiable
  official API/pricing yet — recorded as a limitation)
- hybrid: VLM semantics + deterministic geometry recovery (only if a measured
  bottleneck justifies it; Phase 2 currently provides no evidence for it)

Each candidate is compared on: accuracy + topology quality + generalization +
latency + cost + commercial licensing.

## Tests

```bash
cd geo2 && ./.venv/bin/python -m pytest
```

Coverage: schema validation, invalid-geometry rejection, wall references,
polygon validation, provider interface/registry, OpenAI VLM provider offline
units (token estimators, licensing, env-file key fallback, usage telemetry),
pipeline execution, overlay generation, benchmark output. No GPU, no weights,
no network required.