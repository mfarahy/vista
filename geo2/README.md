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
  pyproject.toml
  geometry_ai/
    __init__.py
    schema.py           canonical Pydantic geometry schema (geo2-1.0)
    validation.py       geometric invariant checks
    geoutil.py          numpy-only 2D helpers (distance, point-in-polygon, IoU)
    pipeline.py         image → provider → validate → canonical JSON
    visualize.py        overlay renderer (evaluation only)
    metrics.py          structural benchmark metrics
    providers/
      base.py           FloorPlanProvider interface + Licensing record
      baseline.py       deterministic baseline provider
      __init__.py       provider registry
  evaluation/
    manifest.py         fixture manifest (images + optional ground truth)
    run.py              benchmark runner (CLI)
  fixtures/             floor-plan images + ground_truth/ (geo2-gt-v1)
  output/               per-provider per-fixture results (gitignored)
  tests/                pytest suite (no GPU, no weights, no network)
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
**`baseline-mock`** is the only Phase 1 provider: a deterministic placeholder
that builds a simple rectangle plan (exterior loop + one interior divider +
one door/window) purely to validate image loading, the provider interface,
schema/geometry validation, output, overlay and the benchmark. It is not a
floor-plan understanding system.

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
```

Output per fixture under `output/<provider>/<fixture>/`:

```
result.json   validated geometry (or the raw invalid result + errors)
overlay.png   geometry overlaid on the source image
metrics.json  counts, geometry_valid, latency_ms, + detection vs ground truth
```

plus `output/<provider>/summary.json` / `summary.md`. Recording:

- `latency_ms` — provider call wall time only (validation is harness cost).
- `estimated_cost_usd` — always `null` for local providers. No commercial API
  price is ever guessed; prices are recorded only from official sources
  (future providers).

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

`geo2` Phase 1 adds **no** external AI model. Licensing is recorded for every
future provider; see `geometry_ai/providers/base.py` (`Licensing`) and
`LICENSING.md`.

- `baseline-mock` — geo2 project code, MIT; no weights, no GPU, no network.

Dependencies of the geo2 code itself: `pydantic` (MIT), `Pillow` (HPND/MIT),
`numpy` (BSD-3). All commercial-use-unrestricted.

## Current limitations (Phase 1)

- No real floor-plan understanding: `baseline-mock` is a structural stand-in.
- No VLM, UNet, Raster2Seq, wall-graph reconstruction, candidate recovery,
  scale estimation or OCR.
- Overlay renderer is for qualitative evaluation only.
- Metric tolerances are simple (distance fractions, sampled IoU).
- No API server, auth, billing, or database — by design.

## Future provider candidates

Benchmarking candidates to plug into the same interface (each with a
documented `Licensing` record, latency + cost recorded by the same harness):

- specialised CV: segmentation-to-vector refinement of an open model
  (e.g. CubiCasa5K-trained ResNet34-UNet, MIT weights — currently used by the
  repo's `geometry-ai`; licensing must be re-verified at adoption time)
- strong VLM: commercial multimodal API returning validated structured JSON
- open multimodal: local vision-language model
- hybrid: VLM semantics + deterministic geometry recovery
- external API: commercial floor-plan geometry API (cost recorded from its
  official price list only)

Each candidate is compared on: accuracy + topology quality + generalization +
latency + cost + commercial licensing.

## Tests

```bash
cd geo2 && ./.venv/bin/python -m pytest
```

Coverage: schema validation, invalid-geometry rejection, wall references,
polygon validation, provider interface/registry, pipeline execution, overlay
generation, benchmark output. No GPU, no weights, no network required.