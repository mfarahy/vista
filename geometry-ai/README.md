# Vista Geometry — AI feasibility harness (Phases 2–7)

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
an optional `GeometryRefinementProvider`. Phase 5 is a **VLM semantic
benchmark only**: a vision-language model reads the same fixtures and returns
rooms/labels/doors/windows/stairs/furniture as validated structured JSON —
deliberately no pixel geometry. Phase 6 adds the **deterministic semantic
fusion layer** (`fusion.py`) that combines both sources: the VLM's validated
semantic document selects, names, classifies and anchors the UNet's geometric
evidence (room labels/types, door/window matches by wall + room connectivity,
stairs as semantic region candidates, furniture as an exclusion signal,
wall-type evidence, per-entity provenance) — the VLM never produces geometry,
and unmatched semantic observations stay unresolved candidates instead of
being fabricated. Phase 7 adds the **deterministic candidate recovery layer**
(`recovery.py`) that re-derives the missing geometry for unresolved semantic
observations from the source image (wall-opening gaps, repeated parallel stair
treads) and the existing wall graph — windows → doors → rooms → stairs by
priority, always evidence-gated, `image_recovery` provenance, unresolved stays
unresolved when no reliable evidence exists. This is the minimal inference
service — it can run locally on CPU or as a container in the deployment
(Dockerfile + `deploy/helm/vista-geometry-ai`).

```
python -m geometry_ai.evaluate      # run skim fixtures, write output/ (incl. Phase 6+7)
python -m geometry_ai.service       # start the local HTTP service (port 8787)
python -m geometry_ai.vlm_benchmark --models gpt-4o-mini,gpt-5.6-luna
                                    # Phase 5 VLM semantic benchmark → output/phase5
python -m geometry_ai.tests.test_normalize    # weight-free normalization tests
python -m geometry_ai.tests.test_refinement   # weight-free refinement tests
python -m geometry_ai.tests.test_vlm_benchmark  # weight-free VLM harness tests
python -m geometry_ai.tests.test_fusion       # weight-free Phase 6 fusion tests
python -m geometry_ai.tests.test_recovery     # weight-free Phase 7 recovery tests
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
  overlays + summary into `output/`. Phase 6 reuses the saved Phase 5 VLM
  responses to run the fusion pass and writes `output/phase6/*.fused.json`,
  `*.fusion.png` overlays and `fusion-summary.md` (no new API calls).
- `geometry_ai/fusion.py` — **Phase 6 deterministic semantic fusion**:
  semantic rooms → geometric candidates (containment + anchor scoring),
  doors/windows → UNet candidates (wall side, interior partition, room
  connectivity, pair-lock greedy assignment), stairs → semantic region
  candidates, furniture → weak-opening suppression, wall-type verification +
  exterior-door evidence, provenance on every entity, and a debug surface
  with the "selected because" reasons. Deterministic and model-free.
- `geometry_ai/recovery.py` — **Phase 7 deterministic candidate recovery**:
  unresolved semantic observations → image/wall-topology evidence. Window and
  door recovery via wall-opening gap detection on the source raster (host wall
  from room connectivity / compass hint, anchor-gated, occupied-span and
  validity checks); room recovery re-uses the wall-graph faces and never
  invents a polygon when no closed boundary exists; stair recovery detects
  repeated parallel tread lines into a coarse region. Recovered entities carry
  `provenance {geometric: image_recovery, semantic: vlm, recovery: true}` and
  an evidence level — never a VLM coordinate and never a fabricated value.
  Deterministic and model-free.
- `geometry_ai/vlm_benchmark.py` — **Phase 5 benchmark only**: prompts a
  vision-language model (OpenAI-compatible chat completions, strict JSON
  schema) for the *semantic* reading of each fixture (rooms with labels and
  types, doors, windows, stairs, dimensions, furniture), validates and
  normalizes the response, and records latency/tokens/cost into
  `output/phase5/`. No output from this module reaches `VistaGeometry`.
- `geometry_ai/identify_plans.py` — one-off Phase 5 classification pass over
  the untracked real-world scans in `sample_inputs/` (which ones are clean
  floor plans worth adopting as fixtures); writes
  `output/phase5/real-fixture-identification.md`.
- `geometry_ai/tests/` — weight-free unit tests (`test_normalize.py`,
  `test_refinement.py`, `test_vlm_benchmark.py`, `test_fusion.py`,
  `test_recovery.py`; synthetic plans only, no model needed).
- `geometry_ai/generate_fixtures.py` — regenerates the synthetic `fixtures/`
  (authored here, no third-party images).
- `fixtures/` — representative floor-plan images (incl. the repo's German
  real-estate demo plan, the authored basement plan, and the real scanned
  basement/upper-floor/ground-floor plans).
- `fixtures/semantics/` — authored semantic documents (one per fixture)
  derived from the documented Phase 5 VLM readings; used by the evaluation
  harness to reproduce the fusion/recovery passes without re-running the VLM
  (`python -m geometry_ai.evaluate` falls back to these when no saved
  `output/phase5/responses/` file exists).
- `output/` — inference results (gitignored).

The frontend AI adapter lives in `frontend/lib/geometry/ai/` and is invoked
through `frontend/app/api/geometry/extract/route.ts`; the UI continues to
consume only `VistaGeometry`. The `/geometry` developer debug mode renders the
raw/normalized/fused/recovered geometry, the VLM semantic reading, room
candidates and opening candidates as independently toggled layers, with an
entity inspector that shows confidence, nearest wall, distance, width, status,
rejection reasons, the "selected because" match explanation for fused entities
and the image-evidence reason for recovered entities.
The service's `/extract` runs the Phase 6 fusion and the Phase 7 recovery when
the request carries a validated `semantic` document (`{"semantic": {...}}`),
returning `semantic`, `fused` and `recovered` fields alongside the existing
document.

## Environment

`GEOMETRY_AI_SERVICE_URL` (frontend env, default `http://127.0.0.1:8787`)
points the Next.js API route at this service. Optional refinement wiring
(`GEOMETRY_REFINEMENT_PROVIDER=ai`) is described under `refinement.py`.

## Container / deployment

- `Dockerfile` — builds the CPU-only service image (PyTorch wheels from the
  CPU index, ~98 MB MIT weights baked in at build time). `HOST`/`PORT` default
  to `0.0.0.0:8787` inside the container; the stdlib HTTP server keeps a
  `/healthz` probe so it works behind k8s probes without an extra runtime.
- `docker-compose.yml` (repo root) — runs it as `geometry-ai` on
  `0.0.0.0:8787` for local development.
- `deploy/helm/vista-geometry-ai` — Helm chart: `Deployment` + `Service`
  (ClusterIP, internal only). The frontend chart defaults
  `GEOMETRY_AI_SERVICE_URL` to `http://vista-geometry-ai:80`
  (`deploy/helm/vista-frontend/values.yaml`); override there for other
  environments — it is not driven by CI variables.
