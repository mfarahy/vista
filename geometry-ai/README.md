# Vista Geometry — AI feasibility harness (Phases 2–4)

Local, CPU-capable harness that runs **real inference** with the
CubiCasa5K-trained ResNet34-UNet floor-plan segmentation model
[MIT weights](https://huggingface.co/Yytsi/floorplan-to-3d-walls) and maps
its output onto Vista's `VistaGeometry` schema. Phase 3 adds a **deterministic
normalization layer** between the raw model output and `VistaGeometry`:
wall merging/snapping, wall-topology based room reconstruction, and door/window
validation against walls. Phase 4 makes the pipeline **traceable instead of
destructive**: every candidate (accepted, ambiguous, rejected) is preserved
with status + reasons, opening validation is conservative
(`valid` / `uncertain` / `invalid`), `/geometry` gains a developer debug
view/entity inspector, and only genuinely ambiguous openings can be passed to
an optional `GeometryRefinementProvider`. This is the minimal local inference
service — intentionally **not** production infrastructure.

```
python -m geometry_ai.evaluate      # run skim fixtures, write output/
python -m geometry_ai.service       # start the local HTTP service (port 8787)
python -m geometry_ai.tests.test_normalize    # weight-free normalization tests
python -m geometry_ai.tests.test_refinement   # weight-free refinement tests
```

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt     # CPU torch recommended
.venv/bin/python download_weights.py           # ~98 MB MIT weights → weights/
```

CPU-only inference runs in roughly 0.3–0.8 s per image on a workstation-core-
equivalent machine (see `docs/geometry-ai-evaluation.md` for tables).

## Layout

- `geometry_ai/extract.py` — inference pipeline: preprocessing (letterbox +
  ImageNet normalize), UNet forward pass, softmax-confidence polygons per
  class, wall-centerline extraction via morphological skeleton, room regions
  via floor connected components enclosed by walls. `run()` returns a document
  with `raw` (model output), `normalized` (the Phase 3 result) and the Phase 4
  `candidates` debug representation.
- `geometry_ai/normalize.py` — the **normalization layer**: endpoint snapping,
  collinear wall merging with opening-bridging, a planar half-edge wall graph,
  minimal-face room reconstruction with validation, conservative opening
  classification (`valid` / `uncertain` / `invalid` with reasons), and the
  candidate preservation + optional refinement step. Deterministic and
  model-free.
- `geometry_ai/refinement.py` — candidate-level ambiguity refinement:
  `GeometryRefinementProvider` interface, `NoOpRefinementProvider` (default)
  and a configurable `AIRefinementProvider`
  (`GEOMETRY_REFINEMENT_PROVIDER=ai`, `GEOMETRY_REFINEMENT_URL`,
  `GEOMETRY_REFINEMENT_API_KEY`). Never regenerates geometry.
- `geometry_ai/service.py` — minimal stdlib HTTP server (`POST /extract`,
  `GET /healthz`).
- `geometry_ai/evaluate.py` — feasibility + Phase 3 + Phase 4 evaluation over
  `fixtures/`, writes raw JSON + normalized JSON + candidate JSON + debug
  overlays + summary into `output/`.
- `geometry_ai/tests/` — weight-free unit tests (`test_normalize.py`,
  `test_refinement.py`; synthetic plans only, no model needed).
- `geometry_ai/generate_fixtures.py` — regenerates the synthetic `fixtures/`
  (authored here, no third-party images).
- `fixtures/` — representative floor-plan images (incl. the repo's German
  real-estate demo plan).
- `output/` — inference results (gitignored).

The frontend AI adapter lives in `frontend/lib/geometry/ai/` and is invoked
through `frontend/app/api/geometry/extract/route.ts`; the UI continues to
consume only `VistaGeometry`. The `/geometry` developer debug mode renders the
raw/normalized geometry, room candidates and opening candidates as
independently toggled layers, with an entity inspector that shows confidence,
nearest wall, distance, width, status and rejection reasons.

## Environment

`GEOMETRY_AI_SERVICE_URL` (frontend env, default `http://127.0.0.1:8787`)
points the Next.js API route at this service. Optional refinement wiring
(`GEOMETRY_REFINEMENT_PROVIDER=ai`) is described under `refinement.py`.