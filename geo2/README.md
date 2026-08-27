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
      specialized/      Phase 3 specialized floor-plan CNNs (adapters + conversion):
        cubicasa_unet.py  CubiCasa4-class ResNet34-UNet (floor/wall/door/window)
        openbim_unet.py   OpenBIM M2 UNet (background/wall/window/door)
        vectorize.py      documented raster→vector conversion (masks→geometry)
        model_io.py       preprocessing + weight I/O (lazy heavy imports)
      __init__.py       provider registry
  evaluation/
    manifest.py         fixture manifest (images + optional ground truth)
    run.py              benchmark runner (CLI, cost/latency recording, --resume)
    visual_compare.py   side-by-side visual panels generator (Phase 3)
    phase2-report.md    Phase 2 benchmark report + architecture recommendation
    phase2-candidates.md Phase 2 candidate research records (official sources)
    phase3-report.md    Phase 3 specialized-model benchmark report + recommendation
    phase3-candidates.md Phase 3 candidate research records (official sources)
  fixtures/             floor-plan images + ground_truth/ (geo2-gt-v1)
  weights/              pretrained weights downloaded by specialized providers (gitignored)
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

- **`cubicasa-unet`** / **`openbim-unet`** (Phase 3) — specialized floor-plan
  segmentation CNNs (`ResNet34-UNet`, 4 classes) that run **on CPU**. The
  adapter converts each model's native pixel mask into canonical geometry:
  walls as **centerlines derived from the wall mask** (skeletonisation +
  corner splitting), doors/windows from their masks (centroid + feret width)
  associated to the nearest wall. Native capability is limited to what the
  class taxonomy provides — **no room instances, no stairs, no labels**. The
  checkpoint is auto-downloaded to `geo2/weights/` on first run (git-ignored).
  Measured Phase 3 results:
  - walls **16/16** GT in both models across the two authored fixtures
    (Phase 2 VLMs: 9–13/16); OpenBIM doors **5/6**;
  - steady-state ~**0.5–0.7 s/image** on 8 CPU cores, $0 per-image token cost;
  - geometry-valid **3/9** (cubicasa) / **5/9** (openbim) — openings whose mask
    sits in a wall-mask gap trip the wall-association invariant (recorded, not
    patched); rooms/stairs unsupported natively.
  - Raster2Seq (MIT, SIGGRAPH 2026, rooms+doors+windows polygons) is the
    strongest true raster→vector candidate but could not run here (CUDA-only
    compiled ops); RoomFormer (CVPR 2023) consumes 3D-scan density maps, not
    raster drawings. See `evaluation/phase3-report.md` and
    `evaluation/phase3-candidates.md`.

## Phase 3 — Geometry-first specialized model benchmark

Phase 3 tested the opposite of the Phase-2 approach: instead of asking a VLM
to predict pixel geometry, a **specialized floor-plan segmentation/vectorization
model** reconstructs the geometry directly. Headline measured findings:

- **Specialized models win wall + opening geometry decisively** — 16/16 GT
  walls, doors 5/6 (OpenBIM) vs GPT-4o's 1/6, windows 3/7 vs 1/7 — at
  **~20× lower latency and $0 per-image token cost**.
- **But they provide no rooms/labels/stairs/semantics** — that remains a VLM
  strength (rooms 3/8, stairs 1/1 with GPT-4o).
- The two are **complementary**: each fails exactly where the other succeeds.
  Final recommendation: **C — Hybrid** (specialized geometry + VLM semantics),
  with a legal caveat — the benchmarked weights are trained on CC BY-NC
  CubiCasa5K, so commercial deployment requires legal review or re-training on
  permissive data.
- Not runnable here (documented, not fabricated): Raster2Seq (CUDA-only
  deformable-attention + differentiation ops) and RoomFormer (3D-scan density-map
  input + CUDA).

Full evidence: `evaluation/phase3-report.md` (results + analysis),
`evaluation/phase3-candidates.md` (per-candidate records + licensing gate).

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
# Phase 3 local specialized CNNs (weights auto-downloaded to geo2/weights/):
./.venv/bin/python -m evaluation.run --provider cubicasa-unet --output output
./.venv/bin/python -m evaluation.run --provider openbim-unet --output output
# resume (skip fixtures whose metric entry already exists, rebuild summary):
./.venv/bin/python -m evaluation.run --provider gpt-4.1-mini-vlm --output output --resume
```

Output per fixture under `output/<provider>/<fixture>/`:

```
result.json   validated geometry (or the raw invalid result + errors)
overlay.png   geometry overlaid on the source image
metrics.json  counts, geometry_valid, latency_ms, + detection vs ground truth
native_output/ native model output preserved (native.json + native_mask.png,
               specialized Phase 3 providers only)
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
- `cubicasa-unet` / `openbim-unet` — MIT code + listed weights, but **trained
  on CC BY-NC CubiCasa5K** → commercial use classified `restricted` (see
  `LICENSING.md`, Phase 3).

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

## Current limitations (Phase 2 + Phase 3)

- No real floor-plan understanding in `baseline-mock` (infra stand-in).
- Hosted VLM coordinate precision is the known bottleneck (openings); measured,
  not automatically repaired.
- Phase 3 specialized CNNs: **no rooms/labels/stairs** (single floor class is
  not a room decomposition), opening masks sit in wall-mask gaps and trip the
  wall-association invariant (measured, not patched), real-scan generalization
  is weak.
- Open/specialized GPU models (Qwen2.5-VL-7B, Raster2Seq, RoomFormer,
  CubiCasa5K-original) could not be executed in this environment; blockers
  documented, nothing fabricated.
- Overlay renderer is for qualitative evaluation only.
- Metric tolerances are simple distance fractions and sampled IoU.
- No API server, auth, billing, or database — by design.

## Future provider candidates

Benchmarking candidates to plug into the same interface (each with a
documented `Licensing` record, latency + cost recorded by the same harness):

- hybrid (Phase 3 recommendation, **not built**): specialized geometry (UNet
  mask → walls/doors/windows) + VLM semantics (rooms/labels/stairs) — the
  measured complementarity is the evidence for Phase 4
- open multimodal: local vision-language model (e.g. Qwen2.5-VL-7B — Apache-2.0,
  commercial OK; needs CUDA GPU ~13 GB VRAM; selected, not run here)
- specialised CV next models: Raster2Seq (MIT, strongest true raster→vector;
  needs CUDA GPU), RoomFormer (CVPR 2023 room polygons; 3D density-map input;
  CUDA) — records in `evaluation/phase3-candidates.md`
- re-training a segmentation model on **permissive data** (e.g. ResPlan, CC BY)
  to clear the NC-training-data commercial risk
- other hosted multimodal: Claude Sonnet / Gemini (structured outputs available;
  reference records in `evaluation/phase2-candidates.md`)
- external API: commercial floor-plan geometry API (MeltFlex: no verifiable
  official API/pricing yet — recorded as a limitation)

Each candidate is compared on: accuracy + topology quality + generalization +
latency + cost + commercial licensing.

## Tests

```bash
cd geo2 && ./.venv/bin/python -m pytest
```

Coverage: schema validation, invalid-geometry rejection, wall references,
polygon validation, provider interface/registry, OpenAI VLM provider offline
units (token estimators, licensing, env-file key fallback, usage telemetry),
pipeline execution, overlay generation, benchmark output, and Phase 3
specialized-provider licensing + raster→vector conversion helpers. No GPU, no
weights, no network required (cv2/skimage-backed conversion tests are
`importorskip`d).