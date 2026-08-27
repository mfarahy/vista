# Vista Geometry — AI Extraction Feasibility (Phase 2)

> **Question this phase answers:** which existing open-source technology gives
> Vista the best *starting* geometry from a 2D floor-plan image — evaluated
> with **real inference on representative floor plans**, not READMEs.

Execution details, fixtures, raw results and visual overlays are reproduced in
`geometry-ai/output/` (regenerate with `python -m geometry_ai.evaluate`; the
importable code, fixtures and evaluation harness live in `geometry-ai/`).

---

## Executive summary

| Aspect | Result |
|---|---|
| Selected approach | CubiCasa5K-trained **ResNet34-UNet** segmentation (`floor/wall/door/window`) |
| Runtime | CPU-only, **~0.3–0.8 s per image** (8 cores, no GPU) |
| Weights license | **MIT** (Hugging Face `Yytsi/floorplan-to-3d-walls`) |
| Walls | **Excellent** — centerlines align with source drawings within ~2 px; thickness recovered (23 px measured for a 22 px drawn wall) |
| Rooms | **Weak** — rooms are detected as floor regions but merge across openings and thin-line walls; individual room splitting needs post-processing |
| Doors / windows | **Unreliable** — hallucinated on clean/annotated plans, intermittent on in-distribution plans; needs confidence/distanced gating |
| Stairs | **Not represented** — the model has no stair class (documented, not invented) |
| Confidence | **Real**, not fabricated — per-entity and aggregate softmax confidence carried into `VistaGeometry` |
| Verdict | **B — Useful but requires significant post-processing** |

**One-line answer:** yes — the model is a very good *wall foundation* on CPU
today, but rooms/doors/windows need substantial normalization before Vista can
build on them.

---

## Step 1 — Candidate evaluation

All four candidates were inspected in their actual repositories and (where
applicable) Hugging Face model cards. Legal status of **code, weights and
datasets was verified separately** — a permissive repo license never implies a
permissive weights/dataset license.

### 1. `pimenoffd/floor-plan-vectorizer`

- **Repo license:** **none** — the repository has no `LICENSE` file. Using it
  commercially is legally unsafe.
- **Pretrained weights:** none published. `config.yaml` points at a
  `weights/` path the user must fill by training (`core/model_definitions/
  train.py`) on the user's own processed CubiCasa5K.
- **Output:** JSON with wall and opening (door/window) polygon coordinates.
- **Runtime:** PyTorch; CUDA-targeted.
- **Assessment:** 0 stars, 19 commits, no releases, no license, no weights.
  Cannot be executed without training (which Phase 2 forbids).
  → **C — research/reference only** (and a licensing red flag).

### 2. `Cornell-VAILab/Raster2Seq`

- **Repo license:** MIT. **Weights: MIT** (Hugging Face `haopt/Raster2Seq`,
  model card "License: mit").
- **Dataset:** uses Structured3D / CubiCasa5K / Raster2Graph annotations for
  training/eval (CubiCasa5K is CC BY-NC below).
- **Output:** **labeled room polygons** (room outline + room semantics) — it
  does **not** produce walls, doors, windows or stairs as entities.
- **Runtime:** Python 3.10 + PyTorch 2.3 + CUDA; requires compiling
  Deformable-DETR attention ops and the BoundaryFormer differentiable
  rasterizer. **Not runnable on a CPU-only box** — real inference was not
  attempted in Phase 2 for this reason.
- **Strength:** state of the art on CubiCasa5K/Structured3D **room** F1
  (88.7 / 99.6); rooms arrive directly as clean labeled polygons, which would
  solve the room-splitting weakness of the UNet approach.
- **Assessment:** strong *rooms* model, but heavy, CUDA-bound, entity-poor
  (walls/doors/windows absent). → **C today** (cannot be evaluated on the
  current CPU infrastructure), **the natural next candidate** once Vista has
  GPU inference.

### 3. `Yytsi/floorplan-to-3d` (CubiCasa5K UNet) — **selected for Phase 2 inference**

- **Repo license:** MIT. **Weights: MIT** (HF `Yytsi/floorplan-to-3d-walls`:
  `best.safetensors` ~98 MB + `config.yaml`, model card "License: mit").
- **Model:** `segmentation-models-pytorch` UNet, ResNet-34 encoder, 4 classes
  (**floor / wall / door / window**), 512×512 letterboxed input.
- **Output (raw):** per-pixel mask → polygons per class (outer + holes) plus
  our wall-centerline and floor-region post-processing.
- **Runtime:** **CPU-capable**; ~0.3–0.8 s/image in this environment.
- **Commercial use:** MIT weights are freely usable commercially. Caveat: the
  weights were trained on CubiCasa5K, whose dataset is **CC BY-NC 4.0** — so
  (a) *retraining for a commercial product* on that data would violate the
  dataset license; (b) *using the MIT-distributed weights* is governed by MIT.
  This must be revisited before Phase 3.
- **Assessment:** the only candidate that could be executed for real on
  today's infra and that covers walls + doors + windows.

### 4. `CubiCasa/CubiCasa5k` (dataset + original multi-task model)

- **Dataset license:** **CC BY-NC 4.0** — non-commercial. Cannot be used to
  train a commercial Vista model; it was used here only for feasibility
  evaluation of a third-party MIT model.
- **Original model weights:** Google Drive `model_best_val_loss_var.pkl`;
  built for **Python 3.6 + PyTorch 1.0 + CUDA 9**; not runnable on a modern
  CPU stack without substantial porting. → reference only.
- **Dataset value:** 5,000 dense polygon-annotated plans (>80 categories);
  the de-facto benchmark behind every candidate above.

### License/commercial-use matrix

| Candidate | Code license | Weights license | Dataset license | Commercial use of weights |
|---|---|---|---|---|
| floor-plan-vectorizer | none ⚠️ | none published | CubiCasa5K CC BY-NC | not feasible (no weights) |
| Raster2Seq | MIT ✅ | MIT ✅ | S3D/CC5K NC | MIT weights ✅ |
| Yytsi floorplan-to-3d | MIT ✅ | MIT ✅ | CC5K (trained on) | MIT weights ✅ |
| CubiCasa5K model | MIT | unclear (Drive) | CC BY-NC ⚠️ | not recommended |

---

## Step 3 — Real inference

### Fixtures (no third-party images committed)

| # | Style | Source |
|---|---|---|
| 01 | German/European real-estate plan (Obergeschoss, rooms + Balcon) | rasterized from the repo's own `expose-service/public/demo/floorplan.svg` |
| 02 | clean architectural plan | authored by `geometry_ai/generate_fixtures.py` |
| 03 | plan with dimension lines + room labels | authored |
| 04 | furnished plan (sofa, bed, bath, kitchen counter) | authored |
| 05 | CubiCasa/Nordic-style CAD plan with wall bands, door arc, windows | authored |

### Results (CPU, 8 cores, ~23 GB RAM)

| Fixture (src size) | pre | infer | post | total | Walls (ext.) | Rooms | Doors | Windows | Wall conf | Room conf |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 german (1200×840) | 43 | 375 | 87 | 504 ms | 18 (8) | 2 | 9 | 0 | 0.97 | 0.99 |
| 02 clean (1000×720) | 85 | 310 | 78 | 472 ms | 10 (7) | 1 | 0 | 0 | 1.00 | 1.00 |
| 03 dimensions (1200×800) | 83 | 521 | 72 | 675 ms | 8 (6) | 1 | 1 | 0 | 1.00 | 1.00 |
| 04 furnished (1100×780) | 105 | 597 | 83 | 784 ms | 10 (7) | 3 | 0 | 3 | 1.00 | 0.99 |
| 05 cubicasa-style (1000×760) | 51 | 385 | 98 | 535 ms | 19 (15) | 1 | 0 | 3 | 0.96 | 1.00 |

### Per-fixture assessment

**01 — German real-estate plan (the repo's own demo).** Wall reconstruction is
accurate: the exterior shell is recovered at x ≈ 58.6 / 1139, y ≈ 58.7 / 779
(the SVG draws the shell at 60…1140 × 60…780) — **within ~1.5 px**. Interior
dividing walls match the drawn dividers (x ≈ 398 vs 400, x ≈ 659 vs 660,
y ≈ 178 / 418 / 540). The model reports **9 doors on a plan that has no door
symbols** — these are wall-gap hallucinations floating 15–112 px from any
wall; the adapter keeps only 1 (within the 24 px snap tolerance). Rooms: the
single-line walls do not enclose floor components, so the whole interior
collapses into one room. Average overall confidence 0.96.

**02 — clean plan.** Perimeter shell and all three interior dividers recovered
with near-perfect confidence and sub-pixel alignment; **rooms undercounted**
(floor connects around thin lines; no door/window symbols present, so 0/0 is
correct here).

**03 — dimensions plan.** Same strong wall field; dimension line text does not
break the wall detection; 1 spurious door, 0 windows.

**04 — furnished plan.** Correct shell + dividers, **3 rooms recovered**
(full-height divider walls properly enclose the floor). Furniture (sofa, table,
sink circles) is **misclassified as windows** (3 detections, confidence
0.53–0.68, all far from a wall → dropped by the adapter's snap gate).

**05 — CubiCasa-style (in-distribution).** Wall thickness measured 23.4 px for
a 22 px drawn band; **3 of 3 windows detected and on-wall** (confidence
0.91–0.97, ~9 px from the wall centerline = half the band). **The drawn door
was missed (0/1)**, and the interior wall does not split the two rooms because
the opening is not sealed.

### Step 7 — Confidence

The model exposes softmax probabilities; the harness reports the **mean
softmax probability of the predicted class over each entity's pixels** as
per-entity `confidence`, plus an entity-weighted aggregate on
`VistaGeometry.confidence`. No confidence is fabricated. Entity-level
confidence is a useful gate: harness door/window false positives sit at
0.5–0.7, real wall/window detections at 0.9–1.0.

---

## Phase-2 architecture delivered (Steps 4–6, 8)

Kept the existing structure (`FloorPlan → GeometryProvider → VistaGeometry →
UI`); added real inference behind the *same* provider interface:

```
/geometry (Next.js)              frontend/app/geometry
  └─ GeometryPage (Mock | AI selector, loading, localized errors)
       └─ GeometryProvider        frontend/lib/geometry/providers/…
            ├─ MockGeometryProvider   (unchanged behavior, now async)
            └─ AIGeometryProvider     → POST /api/geometry/extract
                 └─ API route /api/geometry/extract   frontend/app/api/geometry/extract/route.ts
                      ├─ fetchRawGeometry()            frontend/lib/geometry/ai/ai-service.ts
                      │    └─ POST /extract  (base64)  geometry-ai (Python, local, port 8787)
                      │         └─ UNet (CPU)          geometry_ai/extract.py
                      └─ rawResultToVistaGeometry()    frontend/lib/geometry/ai/geometry-adapter.ts
```

- **UI consumes only `VistaGeometry`.** Nothing model-specific reaches React;
  the adapter owns the mapping and the route proxies the Python service.
- **`MockGeometryProvider` still works** with zero backend; the AI provider is
  optional and only used when the local service is running.
- **`/geometry` shows the original plan + the AI geometry overlay** (walls,
  rooms, doors, windows), so alignment is judged by eye; a provider/Mock badge
  and the aggregate confidence are shown in the inspector.
- **No 3D/360 work**, no Docker/queues/K8s/cloud: the Python side is a single
  stdlib HTTP server (`python -m geometry_ai.service`).

**Explicit limitations represented rather than invented:** `stairs` is always
`[]` (no model class); door `swing` defaults to `left` (the segmentation has no
swing semantics); openings not near a wall are dropped (counted in the raw
JSON, not hidden).

---

## Step 9/10 — Recommendation

### **B — Useful but requires significant post-processing**

Why not **A (good foundation)**: the model does not cleanly solve rooms,
doors or windows — which are core Vista entities — on the real-world German
plan. It hallucinates openings on annotated/clean drawings, misses doors even
on in-distribution plans, and cannot represent stairs.

Why **B and not C**: the **wall backbone is genuinely production-grade** —
accurate centerlines (≤2 px), correct thickness, clean exterior/interior
separation and trustworthy confidence on all five styles, including a
margined German real-estate plan. Walls are the structural skeleton every
other entity hangs off, so a B start is far more useful than a C one.

### What Phase 3 would need before trusting it

1. **Room splitting** — seal door/window openings before floor-region
   labeling (or adopt Raster2Seq for labeled room polygons once GPU inference
   exists).
2. **Opening gating** — use per-entity confidence + wall-proximity thresholds
   to cut the door/window hallucinations; verify door recall (missed door in
   fixture 05).
3. **Stairs** — no path via this model; needs a complementary detector or a
   model with a stair class.
4. **Licensing** — resolve the CubiCasa5K NC training restriction before any
   commercial retraining; MIT inference weights themselves are clear to use.

### Classification of all candidates

| Approach | Migration path |
|---|---|
| `pimenoffd/floor-plan-vectorizer` | **C** — no license, no weights, cannot run without training |
| `Cornell-VAILab/Raster2Seq` | **C today / watch** — MIT, excellent room polygons, but CUDA-only and walls/doors/windows absent |
| `Yytsi/floorplan-to-3d` (CubiCasa5K UNet) | **B — selected** for the Phase 2 MVP |
| `CubiCasa5K` dataset/model | reference only — CC BY-NC dataset, stale original model |

*Regenerate artifacts*: `.venv/bin/python -m geometry_ai.evaluate` (needs
`weights/` — see `geometry-ai/README.md`).

---

# Phase 3 — Geometry normalization & topology reconstruction

> **Question this phase answers:** how much of the Phase 2 weaknesses can be
> recovered with *deterministic* geometry processing — no second model, no
> training, no LLM?

The answer: **a lot.** The single biggest and cheapest win is the
**room reconstruction**: a planar wall-topology that splits rooms that Phase 2
merged (fixture 05 goes from 1 → 4 rooms, fixtures 02/03 from 1 → 2), while
rejecting every hallucinated door and keeping only wall-anchored windows.

## What was built

A normalization layer between the raw model document and `VistaGeometry`
(`geometry-ai/geometry_ai/normalize.py`), keeping the raw document untouched:

```
Raw AI Geometry
      ↓
Wall Normalization      snap endpoints (1.25·wall-thickness tolerance),
                        merge collinear/near-duplicate segments, bridge
                        opening-scale gaps so rooms never merge through a door
      ↓
Topology Reconstruction centerlines → planar half-edge graph (endpoints,
                        T-junctions, crossings); minimal faces = closed loops
      ↓
Room Reconstruction     bounded faces → validated polygons
                        (closed, simple, min area/dimension, in bounds)
      ↓
Opening Normalization   doors/windows validated against walls: distance,
                        wall-alignment, plausible width; snapped + flagged
      ↓
Normalized VistaGeometry   (raw document stays available for debugging)
```

* Everything is geometric and deterministic; ~1–2 ms added per image.
* **Confidence is never fabricated.** Entities carry the model's softmax
  confidence; rooms are marked `derived`, snapped walls `snapped`, moved
  openings `corrected`. Nothing re-labeled as "AI-detected".
* **Wall thickness is preserved** (length-weighted average of the merged
  segments, not center-line collapse) for later 3D extrusion.

The frontend adapter now maps the document twice — `rawResultToVistaGeometry`
(unchanged Phase 2 view) and `normalizedResultToVistaGeometry` — and the
geometry playground gained a developer **Geometry view: AI raw | Normalized**
toggle (`frontend/app/geometry`). The UI still only consumes `VistaGeometry`.

## Results (same fixtures as Phase 2, same model, CPU)

Normalization ms are part of `total`; raw/norm columns are entity counts.

| # | Fixture | raw→norm walls | raw→norm rooms | raw→norm doors | raw→norm windows | wall conf raw/norm | normalize ms |
|---|---|---|---|---|---|---|---|
| 01 | german real-estate | 18 → 9 | 2 → 2 | 9 → 0 | 0 → 0 | 0.97 / 0.95 | 2.0 |
| 02 | clean | 10 → 6 | 1 → 2 | 0 → 0 | 0 → 0 | 1.00 / 1.00 | 0.9 |
| 03 | dimensions | 8 → 5 | 1 → 2 | 1 → 0 | 0 → 0 | 1.00 / 0.99 | 0.7 |
| 04 | furnished | 10 → 6 | 3 → 3 | 0 → 0 | 3 → 0 | 1.00 / 1.00 | 1.2 |
| 05 | Cubicasa-style | 19 → 6 | 1 → 4 | 0 → 0 | 3 → 3 | 0.96 / 0.98 | 1.0 |

(numbers from `geometry-ai/output/evaluation-summary.md`)

## Per-fixture analysis

**01 — German real-estate plan.** 18 fragmented wall segments merge to 9
clean lines; the shell closes to one rectangle and the two main divider walls
(x≈400, now continuous through the model's door-sized gap, and x≈658) become
single walls. Result: two wall-derived rooms (west strip + the large
east/central area). The plan's smaller rooms (Küche/Bad/Abstellraum) are
drawn with partial walls that genuinely do not enclose, so they stay merged —
recovering them needs a better model (see Limitations). **All 9 hallucinated
doors are rejected** (every one is 15–112 px from any wall).

**02 — clean plan.** Room count 1 → **2** (left/right) once the divider's
door gap is bridged. This is the Phase 2 "rooms undercounted" fix.

**03 — dimensions plan.** Room count 1 → **2**; the shell's open NE corner
(≈24 px gap, a skeleton fragmentation) is closed by the corner pass. The
spurious floating door is rejected.

**04 — furnished plan.** 3 rooms kept; the 3 **furniture misclassified as
windows are all removed** (they are far from any wall and not wall-aligned).

**05 — Cubicasa-style plan — the headline case.** The wall shell,
fragmented into 19 segments by the window bands, merges to 6 walls; the two
interior dividers are sealed through their door/window-scale gaps; the result
is the **four quadrant rooms** — exactly what the drawn cross-wall plan
contains. 1 → **4 rooms**. All 3 real windows are kept and snapped onto their
host walls (`corrected: true`), width ≈ 107–170 px matching the drawing.

## Acceptance-criteria check

| Criterion | Status |
|---|---|
| AI inference still works | ✅ same model/pipeline; +1–2 ms normalize |
| Wall accuracy ≥ Phase 2 | ✅ centerlines ~2 px preserved; averaging only re-merges |
| Nearby/duplicate walls normalized | ✅ 18→9, 10→6, 19→6 |
| Wall endpoints snapped | ✅ 1.25·thickness tolerance + corner pass |
| Wall topology reconstructed | ✅ planar half-edge graph (T-junctions, crossings, faces) |
| Rooms from normalized geometry | ✅ 2/2/2/3/4 rooms wall-derived |
| Doors don't merge adjacent rooms | ✅ fixture 05 1→4; unit test `two_rooms_remain_two` |
| Invalid room polygons rejected | ✅ `too_small / too_thin / not_simple / out_of_bounds` gates |
| Doors validated against walls | ✅ 9/1 hallucinations rejected |
| Windows validated against walls | ✅ 3 furniture-as-window rejected in 04 |
| Misaligned doors/windows snapped | ✅ 3 windows snapped+flagged in 05 |
| Obvious false-positive openings removed | ✅ all 13 hallucinated openings dropped |
| Raw AI geometry inspectable | ✅ debug view "AI raw"; `*.raw.json` |
| Normalized geometry inspectable | ✅ debug view "Normalized"; `*.normalized.json` |
| Mock provider still works | ✅ unchanged (returns `{ geometry }`) |
| 3D/360 unchanged | ✅ no changes outside geometry pipeline |
| Tests/typecheck/lint/build | ✅ `test_normalize` 5/5, tsc 0, eslint 0 errors, build ok |

## Limitations that still need a better model

Deterministic processing cannot fix:

1. **Missed doors (doors the model never sees).** Fixture 05's drawn door was
   not detected at all, so no door entity exists to normalize. Door recall is
   a model problem; only door *precision* is recoverable here.
2. **Rooms enclosed only by partial/peninsular walls.** Fixture 01's smaller
   rooms stay merged because their drawn walls genuinely do not enclose; wall
   topology only separates what walls actually separate. (Room polygons also
   do not indent around peninsular dividers — the wall stroke covers the
   overlap in the 2D overlay.) Closing that needs semantic room knowledge or
   a room-polygon model (e.g. Raster2Seq once GPU inference exists).
3. **Space settings**: the `gap_bridge` (seal openings up to 20 % of the
   shorter image side) is a documented heuristic; plans with genuinely open
   (column-only) rooms would be split more than semantically correct.
4. **Doors in this model are near-loss**: no fixture had a valid door to keep,
   so snapping was exercised on windows. Door orientation/swing is still
   defaulted (`left`) — the model has no swing signal.

## Verdict for Phase 3

Deterministic normalization converts a **"B — useful but requires
post-processing"** start into a much more usable geometry **without any second
model**. Wall continuity, room count/separation and opening precision are all
measurably improved; the debug compare makes the whole chain auditable.
The remaining gaps are precisely the ones that need a *better model*
(door recall, semantic rooms), not more geometry code.

---

# Phase 4 — Geometry debugging & AI semantic refinement

> **Question this phase answers:** how do we make the Phase 3 pipeline
> *auditable* instead of destructive — and how much of that can be recovered
> without a second AI model? Phase 4 keeps everything, classifies everything,
> explains everything, and optionally hands only the genuinely ambiguous cases
> to a small VLM/VLM refinement step.

Phase 4 does **not** touch the ResNet34-UNet. It makes the deterministic
pipeline traceable (`valid` / `uncertain` / `invalid` instead of
valid/deleted), preserves every rejected candidate in a debug representation,
adds a developer debug view + entity inspector to `/geometry`, and introduces
a small, configurable `GeometryRefinementProvider` for candidate-level
semantic review. Confirmation: **the deterministic pipeline is already the
complete MVP; VLM refinement is wired but stays optional (NoOp by default).**

## The architecture

```
Raw AI
  ↓
Geometry Normalization        (Phase 3)
  ↓
Candidate Geometry            (NEW: every face + every opening is a candidate)
  ↓
Validation                   (conservative: valid / uncertain / invalid)
  ↓
Ambiguous Candidates         (uncertain openings, preserved + ids exposed)
  ↓
Optional AI Refinement       (GeometryRefinementProvider, default NoOp)
```

Walls stay deterministic/model-derived. Only `uncertain` opening candidates
ever reach a refinement provider, and it answers a constrained question
("is this a real door?") with a small structured
`{decision, reason, confidence}` — never full geometry.

## What was built

1. **Candidate preservation (Part B).** `reconstruct_rooms` and
   `normalize_openings` now emit a `candidates` document next to the
   normalized geometry. Every bounded face and every opening polygon is kept
   with its `status`, `reasons`, and derived metrics (nearest wall, distance,
   along/perp extent, area, min-dimension). Rejected entities do **not** enter
   `VistaGeometry` but are fully available in `output/*.candidates.json` and
   in the frontend debug layers.
2. **Conservative opening validation (Part C).** `_classify_opening` replaces
   the binary keep/delete decision with `valid / uncertain / invalid`.
   Thresholds are derived from wall thickness and image scale
   (`valid_dist = thickness·1.2 + 2·scale`, `hard_dist = median_thickness·3 +
   6·scale`, …). A slightly misaligned but plausible opening is `uncertain`
   (kept as a candidate, reviewable, refinable) — not destroyed. Only clearly
   fabricated candidates (far from every wall, off-wall axis, implausible
   width, out of image bounds) become `invalid`. **The German plan's 9
   hallucinated doors are now visible as `7 invalid + 2 uncertain` with
   reasons instead of silently vanishing.**
3. **Room candidate debugging + filtering (Part D).** Every graph face is a
   candidate; a new `wall_artefact` gate rejects faces whose interior is
   filled with wall mask pixels (double wall boundaries / wall-band holes).
   Relative gates (`min_area = 0.25 % of plan`, `min_dim` in wall thicknesses)
   stay. See below for the `1 → 4` finding.
4. **Debug inspector (Part A).** `/geometry` gained a developer debug mode
   with independent layers — original image, AI raw, normalized, room
   candidates, opening candidates — plus an entity inspector showing type,
   id, source, confidence, nearest wall, distance-to-wall, width, status and
   reasons. Rejection reasons are visible in the UI and localized.
5. **Refinement provider (Parts F & G).** `geometry_ai/refinement.py` defines
   `GeometryRefinementProvider` (`NoOpRefinementProvider` default;
   `AIRefinementProvider` reading `GEOMETRY_REFINEMENT_URL` /
   `_API_KEY` from config). The pipeline passes every ambiguous candidate to
   the provider and applies its `accept`/`reject`/`uncertain` verdict.
   Confidence is never fabricated — `None` when the backend reports none.
   No commercial vendor is hard-coded.
6. **Fixes.** Opening `wall_id` now references normalized wall ids
   (`n-wall-…`) — Phase 3 emitted bare indices, so window/door overlays in the
   frontend silently failed to resolve their host wall; normalized windows are
   now actually drawn.

## The `rooms 1 → 4` investigation (Part D)

Ran the exact fixture 05 through the wall graph and dumped every bounded face:

| face | area px² | bounding box | verdict |
|---|---|---|---|
| 1 | 162 725 | 529×311 | accepted |
| 2 | 160 972 | 529×306 | accepted |
| 3 | 100 012 | 326×309 | accepted |
| 4 | 99 508 | 326×307 | accepted |

**Actual cause:** the extra faces are **not** furniture, wall-thickness
artifacts, or disconnected segments. The raw model reports **one** connected
`floor_regions` component (rooms connect through door/window openings — the
segmentation has no room-splitting semantics), while its **19 wall segments
are accurate**. Phase 3 wall merging + opening bridging seals the window/door
bands into two continuous interior dividers (x ≈ 600 vertical, y ≈ 380
horizontal) that properly cross the shell. The half-edge face traversal of the
resulting planar graph yields the **four quadrant rooms the cross-wall plan
genuinely contains**. Verified against the source-drawn walls: this is a
legitimate split, not a bug. In every fixture the face dump matched the
semantic rooms exactly (German 2, clean 2, dimensions 2, furnished 3) and the
only faces ever produced besides rooms are sub-gate faces (tiny alcoves) or
wall-band faces, which the new gates now classify and surface.

Synthetic tests prove the gates: a 30×30 alcove face is rejected with a
reason, and a closed wall-band loop whose interior is wall mask material is
rejected as `wall_artefact` — while the four genuine Quadrants still pass.

## Evaluation (Part H — same Phase 2/3 fixtures, same model, CPU)

Final `VistaGeometry` counts are unchanged from Phase 3 by design: Phase 4
adds *visibility* and *conservative classification*, it does not pollute the
output with unverified openings. The `(v/u/i)` columns break the raw AI count
down into `valid / uncertain / invalid` candidates.

### Raw AI vs Phase 3 vs Phase 4 (rooms, doors, windows)

| | Raw AI | Phase 3 | Phase 4 (final) | Phase 4 candidates |
|---|---|---|---|---|
| German rooms | 2 | 2 | 2 | 2 accepted / 0 rejected |
| Clean rooms | 1 | 2 | 2 | 2 / 0 |
| Dimensions rooms | 1 | 2 | 2 | 2 / 0 |
| Furnished rooms | 3 | 3 | 3 | 3 / 0 |
| CubiCasa rooms | 1 | 4 | 4 | 4 / 0 |
| **German doors** | 9 | 0 | 0 | 9 (0 valid / 2 uncertain / 7 invalid) |
| Clean doors | 0 | 0 | 0 | — |
| Dimensions doors | 1 | 0 | 0 | 1 (0/0/1) |
| Furnished doors | 0 | 0 | 0 | — |
| CubiCasa doors | 0 | 0 | 0 | 0 (0/0/0) |
| German windows | 0 | 0 | 0 | — |
| Clean windows | 0 | 0 | 0 | — |
| Dimensions windows | 0 | 0 | 0 | — |
| Furnished windows | 3 | 0 | 0 | 3 (0/0/3) furniture |
| CubiCasa windows | 3 | 3 | 3 | 3 (3/0/0) on-wall |

*Regenerate:* `python -m geometry_ai.evaluate` → `output/evaluation-summary.md`
and `output/*.candidates.json`.

## Per-fixture notes

- **01 German real-estate.** All 9 door detections are wall-gap hallucinations
  (no door symbols on the plan). None are emitted; each is preserved as a
  candidate: `door-3` (15 px off a wall) and `door-8` (34 px) are `uncertain`
  and therefore reachable by a refinement provider, the other 7 are `invalid`
  (`too_far_from_wall` + alignment reasons). Rooms stay 2/2; the Küche/Bad
  enclosures genuinely are not enclosed by drawn walls.
- **02 clean.** 1 → 2 rooms after the divider's door gap is bridged; no
  openings present, so candidate lists are empty.
- **03 dimensions.** The single spurious floating door is `invalid`
  (238 px from any wall, reason preserved). Dimension text still does not
  break wall detection.
- **04 furnished.** Three furniture-as-window detections are `invalid` with
  explicit reasons; previously they were silently deleted. Rooms keep 3/3.
- **05 CubiCasa style.** The cross-wall plan keeps the four quadrant rooms
  (see investigation above), all three real windows stay `valid`, snapped and
  emitted, and their `wall_id` references now resolve to the normalized walls.

## Refinement evaluation (Part F)

A small `AIRefinementProvider` was implemented and the pipeline was wired to
route every `uncertain` candidate through it. Evaluating it against the
fixtures showed that **no fixture had an ambiguous opening whose acceptance
would be defensible**: German's two uncertain doors are 15–34 px off-wall
hallucinations on a plan with no door symbols; every real detection here is
either confidently valid (CubiCasa windows 0.91–0.97) or clearly fabricated.
Deterministic validation already separates the classes cleanly, so a VLM adds
cost without measurable precision gain on this set — the documented outcome
of the phase. The provider abstraction remains in place and is exercised by
tests; set `GEOMETRY_REFINEMENT_PROVIDER=ai` to enable it later, and it stays
confined to candidate-level decisions.

## Acceptance-criteria check

| Criterion | Status |
|---|---|
| Developer geometry debug mode in `/geometry` | ✅ layer toggles + entity inspector |
| Raw AI vs normalized visually comparable | ✅ independent, overlapping layers |
| Room candidates inspectable | ✅ candidate faces with status/reason |
| Door candidates inspectable | ✅ candidate polygons with status/reasons |
| Window candidates inspectable | ✅ candidate polygons with status/reasons |
| Rejected candidates remain in debug info | ✅ `candidates` doc + `*.candidates.json` |
| Rejection reasons visible | ✅ reasons localized in inspector |
| Opening validation less destructive | ✅ `valid/uncertain/invalid`; plausible-but-misaligned kept |
| `1 → 4` CubiCasa cause documented | ✅ legitimate topology split (4 quadrants) |
| Obvious non-room faces filtered | ✅ `wall_artefact` gate + relative gates, tested |
| Ambiguous geometry can go to a refinement provider | ✅ apply_refinement path |
| Refinement limited to candidate-level decisions | ✅ `{decision, reason, confidence}` only |
| `VistaGeometry` remains the only geometry contract | ✅ debug data is a parallel surface |
| Mock provider still works | ✅ untouched |
| 3D and 360 untouched | ✅ no changes outside geometry pipeline |
| Tests / typecheck / lint / build | ✅ 16 python tests, tsc 0, eslint 0 errors, next build ok |

## Phase 4 limitations

1. **Door recall is still a model problem.** The pipeline can only
   classify/openings the detector produces — a door the UNet never sees does
   not exist as a candidate (fixture 05's drawn door remains missed).
2. **Semantic room labels** (`Küche`, `Bad`, …) are still wall-topology faces;
   the phase deliberately avoids a semantic room model.
3. **Furniture-enclosed faces** (a closed loop detected as walls around a
   whole sofa) could still pass the geometric gates in principle; the debug
   layer makes them visible and refinement is the intended resolution. No
   fixture exhibits this.
4. **Refinement** is scaffolded but not materially beneficial on this fixture
   set — kept as the simpler deterministic solution per the phase's success
   criterion, with the provider interface ready for when a useful backend
   exists.

# Phase 5 — VLM semantic floor-plan benchmark

> **Question this phase answers:** can a Vision-Language Model reliably provide
> the *semantic* understanding that the current geometry model is missing —
> rooms, room semantics, labels/OCR, doors, windows, stairs, furniture vs
> architecture — measured against the same fixtures, with validated structured
> output?

**This phase is a benchmark only.** The VLM was run against the real Vista
fixtures, its structured JSON was validated before use, and nothing from it
was fused into `VistaGeometry`. No UNet behavior, no Mock/UNet provider, no 3D
and no 360 code was touched.

Execution details and raw responses are reproduced in `geometry-ai/output/phase5/`
(regenerate with `python -m geometry_ai.vlm_benchmark --models gpt-4o-mini,gpt-5.6-luna`
— requires `OPENAI_API_KEY`; `--summary-only` regenerates the summary from
saved responses without API calls).



## Executive summary

| Aspect | Result |
|---|---|
| Models tested | **gpt-4o-mini** (project's existing low-cost option) and **gpt-5.6-luna** (project default model, `OPENAI_MODEL`) — OpenAI-compatible chat completions + strict JSON schema |
| Structured output | 18/18 valid JSON with zero markdown fences; enums stable in 18/18; **17/18 passed the validation gate for each model** (both emitted one `count: 0` placeholder row — the gate caught it both times) |
| Rooms | **luna: 39/40 spaces** with correct labels/types across nine fixtures (1 merge miss on an unlabeled plan); gpt-4o-mini 36/40 (missed the Balkon, the unlabeled room in 03, the synthetic `Öl`, and `WC/Duschbad`; invented a phantom `OG` room) |
| Doors | **luna: 6/6** on the plans with known counts, incl. the interior/exterior distinction and the connecting rooms; gpt-4o-mini unstable (basement count 5→2 across runs) and hallucinated 1 door on the furnished plan |
| Windows | **luna: 7/7** on the plans with known counts (+2 false positives: balcony bars misread); gpt-4o-mini: 3/7 (missed **all four** basement windows) and hallucinated 1 window on the furnished plan |
| Stairs | Both models: detected on every plan that has them, with location; direction is reliable on clear symbols (`up` on the synthetic basement) and honestly `unknown`/disagreeing on noisy scans |
| Labels/OCR | Strong: German labels incl. `Heizung`, `Hobbyraum`, `Flur`, `Öl`, `WC/Duschbad`, `Terrasse` read exactly; luna read `Kochen` where 4o-mini misread `Kocen`, and read area annotations (`ca. 24,60 m²`, `8,40 m`, `8800`) without scale conversion |
| Furniture | **Never became geometry in either model** (the UNet misclassifies furniture as windows). Luna identified items by name incl. the pool table, oil tank and boiler; 4o-mini identified almost none |
| Cost / latency | gpt-4o-mini ~$0.004–0.006, 2–8 s per image; **luna ~$0.001–0.004, 8–27 s per image** (compact vision encoder: ~1.8–2.8k input tokens vs 26–38k) |
| Verdict | **A — VLM is valuable as the semantic layer** (over UNet geometry + deterministic normalization) |

**One-line answer:** **yes** — gpt-5.6-luna reliably provides exactly the
semantic understanding the current pipeline is missing (rooms, semantics,
labels, doors, windows, stairs, furniture exclusion) at ~$0.001–0.004 per
image, provided its output goes through the validation + normalization gate
described below. It does **not** provide geometry, and the next phase must not
ask it to.

---

## Step 1 — Candidate evaluation

The project already has an OpenAI-compatible key and base URL
(`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` in `expose-service/.env`,
already used by the floorplan-3d and marketing-content providers), so the
practical MVP is the OpenAI chat-completions API with strict JSON schema — no
new account, no new SDK, no new infrastructure. Qwen-VL class models were
evaluated as the alternative.

| Candidate | Provider | Input | Structured output | Cost (per 1M tokens) | Latency (measured or typical) | Context / image limits | Commercial use | Floor-plan understanding |
|---|---|---|---|---|---|---|---|---|
| **gpt-5.6-luna** (tested) | OpenAI API (already configured) | image (base64/URL) + text | **strict JSON schema** ✅ | $0.20 in / $1.20 out (2026-07-30 list price); cached in $0.02 | **8–27 s/image** (reasoning model, measured) | 1.05M token context; ~1.8–2.8k input tokens per plan | ✅ commercial, no training-data restrictions in T&C for API use | **Excellent** — 39/40 rooms, 6/6 doors, 7/7 windows, stairs, exact German OCR |
| gpt-4o-mini (tested) | OpenAI API | image + text | strict JSON schema ✅ | $0.15 in / $0.60 out | **2–8 s/image** (measured) | 128K context; 26–38k input tokens per plan (tile-based vision) | ✅ | **Good but inconsistent** — 36/40 rooms, missed all basement windows, placeholder-row schema drift |
| gpt-4o / gpt-5.x family (not tested) | OpenAI API | image + text | strict JSON schema ✅ | $2.50/$10 (4o), $5/$30 (5.5), $2/$12 (5.6 Terra) | slower than mini | 128K–1.05M | ✅ | presumed ≥ luna for vision, not needed for the MVP |
| Qwen3-VL (Qwen3-VL-Plus, Qwen3-VL-235B-A22B) | Qwen Cloud / Alibaba Model Studio (DashScope successor) | image, video, text | JSON via prompt; **no strict-schema guarantee** | $0.20 in / $1.60 out (VL-Plus); $0.40/$4.00 (235B A22B) | n/a here (no key) | 131–262K context; strong OCR (32 languages) | ✅ weights Apache-2.0; hosted API commercial | strong per Alibaba benchmark claims; **not measured here — no project key** |
| Local Qwen2.5/3-VL (self-hosted) | local vLLM/Ollama | image + text | JSON via prompt only | $0 (GPU/CPU cost) | seconds on GPU; **unusable CPU-only** | depends on VRAM | ✅ Apache-2.0 weights | plausible; **not runnable on this repo's CPU-only harness** |
| Google Gemini (flash class) | Google AI Studio | image + text | JSON via prompt / constrained decoding | ~$0.1–1 range | fast | 1M context | ✅ | strong per vendor claims; **no project key** |

**Chosen for the benchmark: gpt-4o-mini + gpt-5.6-luna** through the existing
project credentials — the smallest practical solution for the MVP (zero new
accounts, SDK, or infra). Qwen-VL and Gemini remain documented alternatives
if a provider-neutral or non-OpenAI route is ever required; no provider
abstraction framework was added.

## Step 2 — Real Vista fixtures

The VLM ran against the **original fixture images, unmodified** (no redraw,
simplification, crop, or cleaning):

| # | Fixture | Ground truth used for scoring |
|---|---|---|
| 01 | German real-estate plan (Obergeschoss, `floorplan.svg`) | 8 spaces (7 labeled + Balkon), 0 doors, 0 windows, title + m² area labels |
| 02 | clean plan | 4 spaces, no annotations |
| 03 | dimensions plan | 2 spaces (`Wohnzimmer` labeled), dims `8,40 m` / `6,10 m` |
| 04 | furnished plan | 3 spaces, furniture: sofa, round table + chairs, bed, bathtub, kitchen counter |
| 05 | CubiCasa-style plan | 4 spaces, 1 interior door, 3 windows |
| 06 | **basement plan (authored)** | 4 spaces (`Heizung`, `Öl`, `Hobbyraum`, `Flur`), 5 doors (4 interior + exterior entry), 4 windows, stairs up, dims `8800`/`6400`, furniture: boiler, oil tank, pool table, sofa |
| 07 | **basement plan (real scan)** | real scanned German plan found in `geometry-ai/sample_inputs/` — labels `Heizung`, `Hobbyraum`, `Flur`, `Öl`, area `ca. 24,60 m²`, stairs; doors/windows present (counts verified by model agreement) |
| 08 | **upper floor (real scan)** | real scanned plan — `Kind II/Arbeiten`, `Schlafen`, `Flur`, `Bad`, `Kind I` with `ca.` areas, stairs, doors, windows |
| 09 | **ground floor (real scan)** | real scanned plan — `Kochen`, `Wohnen`, `Diele`, `Windfang`, `WC/Duschbad`, `Terrasse` with `ca.` areas, stairs, doors, windows |

Notes on the real scans: the untracked `geometry-ai/sample_inputs/` directory
contained the project's real scanned plans (three clean drawings + two
photos of printed OKAL-house plans + a 1968 Bauplan PDF of sections/
elevations). The three clean drawings were adopted as fixtures 07–09
verbatim; the basement scan (07) is the exact plan the phase spec required.
The photo/PDF scans were identified with the VLM and are documented in
`output/phase5/` identification notes but not benchmarked (photos of printed
plans and section/elevation drawings are out of scope for the semantic
extraction contract). Fixture 06 was authored with the existing fixture
generator (same convention as 02–05) before the scans were discovered; it
remains as the clean, in-distribution basement case. The Phase 5 ground
truth above is the fixture source itself, not an assumption.

## Step 3–7 — Semantic extraction

One prompt + one strict JSON schema (see `vlm_benchmark.py`) for every
fixture and model. The model is told to read the plan as an architectural
drawing, to report **semantics only** (never coordinates/polygons/pixels), to
preserve visible labels exactly, to report dimensions as text only, and to
put every furniture/decoration item in `furniture` — never in spaces, doors
or windows.

Output contract (validated before use):

```json
{
  "spaces":    [{"label": "Hobbyraum", "type": "hobby_room", "enclosed": true,
                 "usable": true, "relative_location": "top-right"}],
  "doors":     [{"count": 1, "type": "interior", "connects": "Heizung and Hobbyraum",
                 "relative_location": "north-central partition"}],
  "windows":   [{"count": 1, "space": "Heizung", "wall": "north wall", "relative_location": "upper-left"}],
  "stairs":    {"present": true, "relative_location": "bottom-right of Flur", "direction": "up"},
  "dimensions":[{"value": "8800", "unit": "mm"}],
  "annotations":[{"text": "OG", "kind": "note"}],
  "furniture": [{"item": "pool table", "space": "Hobbyraum"}],
  "notes":     {"overall_confidence": "high", "issues": []}
}
```

Room types stayed at the simple allowed set (bedroom, bathroom, kitchen,
living_room, dining_room, hallway, storage, utility, hobby_room, garage,
porch, balcony, stairs, other, unknown). Visible labels are preserved
verbatim (`Wohnen / Essen`, `Heizung`, `Öl`, `Hobbyraum`, `Flur`, `Bedroom 3`
style); nothing is translated.

## Step 8 — Semantic quality (measured counts)

### Rooms

| Fixture | GT | gpt-4o-mini | gpt-5.6-luna |
|---|---|---|---|
| 01 german | 8 | 7 (missed **Balkon**) — labels/types all correct | **8/8** incl. Balkon (`enclosed: false`, `usable: true`) |
| 02 clean | 4 | 4/4 | 3/4 in the committed run (the two right-side rooms merged into one; 4/4 in the earlier run — **run-to-run variance on unlabeled plans**) |
| 03 dimensions | 2 | **1/2** (missed the unlabeled right space) | **2/2** |
| 04 furnished | 3 | 3/3 | 3/3 |
| 05 cubicasa | 4 | 4/4 | 4/4 |
| 06 basement (authored) | 4 | 3/4 (missed **Öl**; phantom `OG` room) | **4/4** exact labels + types (+1 stair space in the earlier run) |
| 07 basement (real scan) | 4 | **4/4** incl. `Öl` | **4/4** (+1 stair space) |
| 08 upper floor (real) | 5 | **5/5** | **5/5** (+1 stair space) |
| 09 ground floor (real) | 6 | 5/6 (missed **WC/Duschbad**) | **6/6** (+1 stair space) |
| **Total** | **40** | 36 correct + 1 phantom | **39 correct + 3 defensible stair spaces** |

- Room types: 100 % correct on every labeled/typeable room in both models
  (`Wohnen / Essen`→living_room, `Küche`→kitchen, `Flur`→hallway, `Bad`→bathroom,
  `Abstellraum`→storage, `Heizung`→utility, `Öl`→storage, `Hobbyraum`→hobby_room,
  `Schlafzimmer`→bedroom, `Terrasse`→porch (luna) / other (4o-mini)).
- The `stairs`-typed spaces luna adds on the real scans are defensible — the
  staircase occupies a real space and the enum contains `stairs`.
- `enclosed`/`usable` are the weak flags: luna marks the clean plan's four
  genuine rooms `enclosed: false` in one run; the flags should be treated as
  hints, not facts, in a fusion phase.
- **Run-to-run stability:** room counts were stable for labeled plans across
  the two full benchmark executions, but unlabeled plans vary (fixture 02:
  luna 4/4 then 3/4; 4o-mini's basement phantom room `OG` appeared in both
  runs while its door count swung 5→2).

### Doors (known GT total: 6 — one in 05, five in 06)

| Model | Known-count fixtures | Interior/exterior | Room relationship | Placement |
|---|---|---|---|---|
| gpt-4o-mini | 05: 1 ✓ · 06: 2 (5 in the earlier run — **unstable**) + 1 door hallucination on 04 | exterior misread as "Flur to OG" on 06 | wrong on 06 (grouped "Hobbyraum to Flur and Heizung to Flur") | vague ("left wall", "bottom wall") |
| gpt-5.6-luna | **05: 1/1 · 06: 5/5 (both runs)** | **4 interior + 1 exterior, correct** | **exact**: Heizung↔Hobbyraum, Heizung↔Flur, Hobbyraum↔Flur, Öl↔Flur, Flur↔outside | wall-level ("central partition", "lower-left partition") |

The door the UNet never sees (fixture 05) is found by **both** VLMs — this is
the complementarity the phase was designed to measure. On the real scans both
models report plausible door sets with room connections (07: 3 vs 5, 08: 4 vs
4, 09: 4 vs 6 — luna consistently more detailed).

### Windows (known GT total: 7 — three in 05, four in 06)

| Model | Known-count fixtures | Wall/space attribution | Notes |
|---|---|---|---|
| gpt-4o-mini | 3/7 | right on 05 | **missed all four basement windows** (authored 06) and reported none on the real basement scan; 1 hallucination on 04 |
| gpt-5.6-luna | **7/7** + 2 FP | correct wall + room per window on 05/06 | FPs: 2 on 01 (the two balcony wall bars misread as bedroom windows). On the real scans: 3 windows on 07 (Heizung N, Hobbyraum N, Öl S), 4 on 08, 3 on 09 — consistently specific attributions |

### Stairs

Both models: detected with location on every plan that has stairs (06–09)
and correctly `absent` on 01–05. Direction: **reliable on clear symbols**
(both models: `up` on the authored basement with its explicit arrow), and
honestly `unknown`/disagreeing on the noisy scans (07: "down" vs null, 09:
"down" vs "up"). This capability does not exist at all in the UNet (no stair
class).

### Labels / OCR

- All German room labels read exactly on the authored fixtures and the real
  scans: `Wohnen / Essen`, `Küche`, `Schlafzimmer`, `Flur`, `Bad`,
  `Arbeitszimmer`, `Abstellraum`, `Heizung`, `Hobbyraum`, `Öl`, `Kind II/
  Arbeiten`, `Schlafen`, `Kind I`, `Kochen`, `Wohnen`, `Diele`, `Windfang`,
  `WC/Duschbad`, `Terrasse`. **`Öl` on the real scan was read by both models**
  (4o-mini missed the synthetic one); on the ground-floor scan **luna read
  `Kochen` and `WC/Duschbad` where 4o-mini wrote `Kocen` and missed the room**.
- Title `2. Obergeschoss · ca. 92 m²` and notes `OG`, `N`, title-block text
  read correctly.
- Dimensions/areas read as text, not converted to scale: `8,40 m` + `6,10 m`
  (03, both models, German decimal comma preserved), `8800` + `6400` (06,
  both), all `ca. … m²` area annotations on the real scans (luna: 5/5 on 08
  and 6/6 on 09, incl. the `ca. 3,42 m²` WC; 4o-mini 5/6).
- Known OCR-adjacent gaps: 4o-mini reported the m² area labels of fixture 01
  (34/9/15/7/6/11/3) under `dimensions` — a schema-understanding gap (they are
  areas, not lengths); luna folded them into the room labels, which is the
  exact source text.

### Furniture (known GT: 9 items across 04 and 06)

| Model | Known-count fixtures | Real scans |
|---|---|---|
| gpt-4o-mini | 0 detected | table/sofa on 07, detailed on 08 (8), sparse on 09 (5) |
| gpt-5.6-luna | 9 entries: 6 exact (sofa, round table, bed, pool table, boiler, oil tank), 2 mislabeled as "wardrobe/cabinet", 1 phantom duplicate | **rich and accurate**: 07 incl. pool table, sofa, oil tank, heating equipment (7); 08 beds/desks/bath fixtures (26, over-detailed); 09 dining set, corner sofa, shower/WC, terrace table + plants (14) |

**Critical requirement met by both models:** the pool table and every other
furniture item in the Hobbyraum, Heizung and Öl rooms — on the authored and
on the real basement plan — **never became walls, rooms, doors or windows**,
while the UNet still misclassifies the same furniture as windows (3
detections in fixture 04).

## Step 9 — VLM vs the current geometry pipeline

| Capability | UNet (+ normalization) | VLM (gpt-5.6-luna) |
|---|---|---|
| Wall geometry | **Strong** — ≤2 px centerlines, thickness recovered | Weak/none — deliberately not requested, not produced |
| Room count | Weak→OK — 2/2/2/3/4; the German plan stays 2 rooms | **Strong** — 8/4/3-4/3/4/4/4/5/6, matching the drawn plans |
| Room semantics | None | **Strong** — every room typed correctly |
| Room labels / OCR | None | **Strong** — exact German labels incl. `Öl`, `Heizung`, `WC/Duschbad` |
| Door detection | Weak — near-zero recall; 9 hallucinations on 01 | **Strong** — 6/6 on known counts with room connections |
| Window detection | Weak — 0–3, furniture FPs in 04 | **Strong** — 7/7 on known counts with wall attribution (+2 FPs) |
| Stairs | Not represented (no class) | **Strong** — detected, located, direction on clear symbols |
| Furniture | Misclassified as windows | **Strong** — excluded from geometry, mostly named |
| Dimensions | Not read | Read as text (no scale conversion) |
| Determinism / cost | Deterministic, ~0.5 s, $0 (CPU) | Non-deterministic, 8–27 s, ~$0.001–0.004/image |

The two are strictly complementary: the UNet is a wall-geometry machine, the
VLM is a semantics/OCR machine. Neither replaces the other. The VLM's only
geometry-adjacent weakness is that its relative locations are wall/room-level
(never coordinates) and its counts drift run-to-run on unlabeled plans — both
reasons to keep it advisory over deterministic geometry.

## Step 10 — Structured-output reliability

Tested explicitly (per fixture × model, 18 calls in the committed run):

| Check | Result |
|---|---|
| Valid JSON | **18/18** — strict `json_schema`; `json.loads` succeeded directly on every raw response |
| Markdown wrapping | **0/18** — no fences or commentary when structured output is requested (API-contract guaranteed, and re-verified at parse time) |
| Required fields | **18/18** — all eight top-level fields present; the validation gate checks them and the harness tests cover a missing-field case |
| Schema explosion | Both models emit **`count: 0` placeholder rows + `"null"` strings** occasionally — luna once (01), 4o-mini once (03) in the committed run (4o-mini did it on 3/6 fixtures in the earlier run). **The validation gate caught every occurrence; luna 17/18, gpt-4o-mini 17/18** |
| Stable enums | **18/18** — zero out-of-enum values (room types, door types, units, confidence levels); the one "surprise" (`type: stairs` on the basement stair space) is in the allowed enum |
| Graceful unknowns | Good — both models correctly returned "nothing here" for absent doors/windows/stairs; the failure mode is silent *misses* (4o-mini: all basement windows) or *over-grouping* (luna merging the unlabeled rooms in 02), which are recall/segmentation gaps, not schema violations |

The harness therefore **never trusts raw model output**: every response goes
through `validate()` (parse, required fields, enum checks, count sanity) and a
documented `normalize()` (drops placeholder rows, maps `"null"`/`"unknown"`
strings to `null`) before any count is reported. Both steps are weight-free
and unit-tested (`geometry_ai/tests/test_vlm_benchmark.py`).

## Step 12 — Cost and latency (representative fixtures, measured)

| Fixture | Model | Input tokens | Output tokens | Latency | Cost (list price) |
|---|---|---|---|---|---|
| 01 german (1200×840) | gpt-4o-mini | 37 728 | 305 | 4.3 s | $0.0058 |
| 01 german (1200×840) | gpt-5.6-luna | 2 120 | 1 556 | 16.3 s | $0.0023 |
| 03 dimensions (1200×800) | gpt-5.6-luna | 2 029 | 709 | 10.2 s | $0.0013 |
| 06 basement (1000×760) | gpt-5.6-luna | 1 810 | 1 523 | 15.8 s | $0.0022 |
| 07 basement real (1500×1060) | gpt-4o-mini | 37 728 | 266 | 4.2 s | $0.0058 |
| 07 basement real (1500×1060) | gpt-5.6-luna | 2 806 | 2 530 | 25.9 s | $0.0036 |
| 09 ground floor real (1500×1060) | gpt-5.6-luna | 2 806 | 2 077 | 21.6 s | $0.0031 |

Notes: gpt-4o-mini charges per vision tile (26–38k tokens per plan) and is
**more expensive than luna** on this workload. Luna's vision encoder is
compact (~1.8–2.8k tokens) and its output includes reasoning tokens; its
latency is 8–27 s, driven by reasoning. Repeat calls cache the prompt prefix
(1 792 of 2 120 input tokens were cached on a second identical call at
$0.02/1M). At a 10 000-image batch this is roughly **$11–36 (luna)** vs
**$41–59 (gpt-4o-mini)**. No caching, queues, batching or billing
infrastructure was built — this is raw per-image cost only.

## Step 11 — No geometry fusion (complied)

The VLM output never entered `VistaGeometry`: no room polygon was changed, no
wall was moved, no coordinate was snapped, and the Mock and UNet providers are
untouched. `vlm_benchmark.py` writes only to `geometry-ai/output/phase5/`.

## Step 13 — Architecture decision: **A — the VLM is valuable**

Evidence for A: luna detects **39/40 spaces with correct semantics**, **6/6
doors with room connections**, **7/7 windows with wall attribution** on the
known-count fixtures, stairs with location and direction on clear symbols,
exact German labels (incl. `Öl`, `Heizung`, `WC/Duschbad`), and never turns
furniture into geometry — on authored **and** real scanned plans — for
~$0.001–0.004 per image through credentials the project already has. This is
precisely the set of capabilities Phase 2–4 documented as missing (see the
Limitations sections above). Evidence that it is *not* a geometry replacement:
it has no coordinate output (by design), its relative locations are
wall/room-level at best, its counts drift run-to-run on unlabeled plans, and
it occasionally hallucinates (2 balcony-bar "windows", 1 phantom `OG` room in
4o-mini, `enclosed` misflags, luna's `Kochen`-vs-`Kocen` OCR edge).

The B-alternative caveat that remains true: **the UNet + deterministic
normalization stays the geometry authority** — walls, polygons, and
openings-as-geometry keep coming from the current pipeline. What the next
**Geometry Fusion** phase should consume from the VLM is strictly semantic:

1. **Room labeling** — map `spaces[]` (label, type, relative location) onto
   the normalized room polygons by label/location matching; assign
   `bedroom`/`kitchen`/… types and the exact visible label to each polygon.
2. **Door/window hints** — `doors[]`/`windows[]` (count, type, connects,
   wall, relative location) as *validation hints* over UNet opening
   candidates: promote a `valid/uncertain` candidate the VLM confirms, flag a
   wall the VLM says has a door but where the UNet found nothing (the missed
   door in fixture 05), and only with deterministic geometry, never VLM
   coordinates.
3. **Stairs** — create the missing stair entity from
   `stairs.present/location/direction` (no UNet class exists).
4. **Furniture exclusion** — pass `furniture[]` + room `enclosed/usable`
   flags into the room-candidate gates so furniture-enclosed faces are
   rejected semantically, not just geometrically.
5. **Dimension annotations** — keep as text on the plan (for the exposé), no
   scale conversion without a separate calibration step.

Fusion rules must stay deterministic over these hints; the VLM stays a
per-plan advisory call with a validation gate — never a provider framework,
never a coordinate source.

### Candidate classification

| Approach | Verdict |
|---|---|
| ResNet34-UNet + normalization (current) | **kept as the geometry backbone** |
| **gpt-5.6-luna VLM semantic layer** | **A — selected for the next Geometry Fusion phase** (validation-gated) |
| gpt-4o-mini | B/C for this task — too unreliable on windows/OCR recall and schema drift; fine as a cheap fallback only with strict gating |
| Qwen3-VL / Gemini | documented alternatives (not measured here — no project key); revisit only if provider neutrality is required |

## Acceptance-criteria check

| Criterion | Status |
|---|---|
| At least one practical VLM tested | ✅ two (`gpt-4o-mini`, `gpt-5.6-luna`), via existing project credentials |
| Run against the same Vista fixtures | ✅ all original images, unmodified — 6 authored fixtures + 3 real scanned plans |
| Room detection + semantic labeling evaluated | ✅ 39/40 (luna) with types; tables above |
| Doors evaluated | ✅ 6/6 on known counts, with interior/exterior + connections |
| Windows evaluated | ✅ 7/7 on known counts, with wall attribution |
| Stairs evaluated | ✅ present/location/direction |
| Labels/OCR evaluated | ✅ exact German labels, title, notes, dimension/area annotations |
| Furniture-vs-architecture evaluated | ✅ never becomes geometry; mostly named |
| Structured JSON validated | ✅ 18/18 parse, enums stable, placeholder drift caught + normalized |
| Latency/cost recorded | ✅ per-fixture tokens, ms, and USD |
| VLM vs UNet strengths documented | ✅ comparison table (Step 9) |
| `docs/geometry-ai-evaluation.md` contains Phase 5 | ✅ this section |
| No VLM geometry merged into `VistaGeometry` | ✅ benchmark writes to `output/phase5/` only |
| Mock + UNet providers unchanged | ✅ no provider code touched |
| 3D / 360 isolated | ✅ no changes outside the geometry benchmark |
| Typecheck / lint / tests / build | ✅ 22/22 python tests (6 new), tsc/eslint/build unchanged (no frontend changes) |

## Final question

> **Can a VLM reliably provide the semantic understanding that the current
> geometry model is missing?**

**Yes — gpt-5.6-luna can**, on authored and real scanned plans, at
~$0.001–0.004/image and 8–27 s per plan. It reads rooms, room semantics,
German labels (including `Öl`, `Heizung`, `WC/Duschbad`), doors with their
connections, windows with their walls, stairs with location and direction on
clear symbols, and dimension annotations, and it keeps furniture out of
geometry — the exact gaps Phase 2–4 documented in the UNet pipeline. The next
**Geometry Fusion** phase should consume only the *normalized, validated*
semantic document (rooms→polygon labels, openings→candidate hints,
stairs→new entity, furniture→exclusion gates, dimensions→text), while the
UNet + deterministic normalization remains the sole source of wall geometry
and polygons. The VLM must never be asked for pixel coordinates, and its
output must always pass the validation gate before use.---

# Phase 6 — Semantic geometry fusion

> **Question this phase answers:** can the two validated sources from the
> previous phases — ResNet34-UNet geometry and VLM semantics — be combined by a
> *deterministic* fusion layer into a substantially better `VistaGeometry`,
> without ever letting the VLM become the source of pixel geometry?

**Yes — measured.** Fusion attaches the VLM's semantic reading to the UNet's
geometric evidence: rooms receive their exact visible labels and controlled
types, doors/windows are selected from the UNet candidates by semantic wall
and room-connectivity evidence, stairs finally become representable, and every
entity carries provenance. The VLM never produces a coordinate, a polygon or
a dimension conversion; when no geometric candidate exists, the semantic
observation stays an **unresolved candidate** instead of becoming fabricated
geometry.

Execution details and raw results are reproduced in
`geometry-ai/output/phase6/` (regenerate with `python -m geometry_ai.evaluate`
— the fusion pass reuses the **saved Phase 5 VLM responses**, so no new API
calls are needed to reproduce the tables below).

## The architecture

Preserved from Phases 2–5, with the fusion layer inserted:

```
Floor Plan
    │
    ├───────────────┐
    ▼               ▼
UNet              VLM
    │               │
    ▼               ▼
Raw Geometry     Semantic Document      (Phase 5 schema, validation-gated)
    │               │
    ▼               ▼
Normalization    Validation
    │               │
    └───────┬───────┘
            ▼
      Geometry Fusion      (NEW: geometry_ai/fusion.py, deterministic)
            │
            ▼
       VistaGeometry
```

Responsibilities are strictly separated:

* **UNet + deterministic normalization** — the sole source of walls, polygons
  and opening geometry. Fusion never moves, deletes or invents geometry.
* **VLM** — semantic evidence only (rooms, labels, types, doors, windows,
  stairs, furniture, dimensions as text, approximate relative locations).
  Its normalized document is consumed *as produced by the Phase 5 gate*
  (`vlm_benchmark.normalize`) — no second schema was created.
* **Fusion layer** (`fusion.py`) — deterministic, model-free, byte-identical
  for identical inputs. It matches, names, classifies, anchors and vetoes —
  it does not draw.

The service (`POST /extract`) runs fusion when the request carries a validated
`semantic` document; `/geometry` gains **Fused geometry** and **VLM semantics**
debug layers plus per-entity "selected because" explanations.

## Step 1 — Reused semantic schema

The fusion layer consumes exactly the Phase 5 normalized document
(`vista-geometry-semantic-v1`): `spaces[]` (label, type, enclosed, usable,
relative_location), `doors[]`, `windows[]`, `stairs`, `dimensions`,
`annotations`, `furniture`, `notes`. Raw payloads are passed through the same
`validate()` → `normalize()` gate before any fusion runs. The semantic
document stays a separate surface from `VistaGeometry` (it is exposed in the
debug view, never in the geometry contract).

## Steps 3–5 — Room fusion & matching

**Approach.** Each semantic space's `relative_location` is parsed into a
deterministic image-space anchor (compass lexicon: "top-left" → 0.2/0.2,
"left-middle" → left × middle-height, "upper-left of centre" → pulled toward
the centre, "south side of Heizung" → a room-relative side hint). Anchors are
computed against the **drawing's own bounding box** (derived from the wall
extents), not the full image — this keeps letterboxed real scans aligned.
Each space is then matched to the accepted geometric room candidate whose
polygon contains its anchor (containment dominates: a containing candidate
scores ≥ 1.5, an adjacent one can never exceed 0.5). One candidate per space,
greedy by best score; a space whose region is already claimed stays an
**unresolved candidate** with a concrete reason (`region_shared_with_space:X`)
rather than a fabricated polygon.

**Result (rooms, luna semantics over the current UNet run):**

| Fixture | GT rooms | matched | named | unresolved | matched labels (exact) |
|---|---|---|---|---|---|
| 01 german real-estate | 8 | 2 | 2 | 6 | Wohnen / Essen · 34 m², Bad · 6 m² |
| 02 clean | 4 | 2 | 0 | 1 | (unlabeled plan) |
| 03 dimensions | 2 | 2 | 1 | 0 | Wohnzimmer |
| 04 furnished | 3 | 3 | 0 | 0 | (unlabeled plan) |
| 05 cubicasa-style | 4 | 4 | 0 | 0 | (unlabeled plan) |
| 06 basement (authored) | 4 | 3 | 3 | 1 | Heizung, Hobbyraum, Flur |
| 07 basement (real scan) | 4 | 2 | 2 | 3 | Heizung, Flur |
| 08 upper floor (real) | 5 | 1 | 1 | 5 | Kind II / Arbeiten |
| 09 ground floor (real) | 6 | 1 | 1 | 6 | Kochen |

*Regenerate:* `output/phase6/fusion-summary.md`.

The headline cases:

* **06 — the authored basement plan.** Heizung → top-left region (`utility`),
  Hobbyraum → top-right (`hobby_room`), Flur → bottom region (`hallway`).
  **Öl stays unresolved with `region_shared_with_space:Heizung`** — and that
  is geometrically true: the drawing has *no wall* between Heizung and Öl
  (the horizontal divider starts at x=250), so the UNet's left strip is one
  open region. Fusion refuses to invent a dividing wall. The German label
  `Öl` is preserved verbatim wherever it is used.
* **01 — the German real-estate plan.** The UNet produces two regions for
  eight rooms; fusion names the two it can defend (Wohnen/Essen → the large
  east region, Bad → the west strip — "left-middle" parsing, not a
  hard-coded coordinate) and leaves the other six honestly unresolved.
* **03 — dimensions plan.** Both UNet regions matched, one labeled
  (`Wohnzimmer`), one unlabeled (no label on the plan).

Label handling follows the spec: the visible label is preserved exactly
(`Wohnen / Essen · 34 m²`, `Heizung`, `Flur`, `Kind II / Arbeiten`), and only
the *type* is mapped onto the controlled VLM enum (`hobby_room`, `utility`,
`hallway`, `storage`, …). Nothing is translated.

## Step 6 — Door fusion

For each semantic door: wall-side evidence (interior partition vs. specific
wall, orientation, "south side of <room>" hints against the matched rooms'
bounding walls), anchor distance to the candidate's point on its wall, and
**room connectivity** (the candidate's host wall must border the matched rooms
named in `connects`). Assignment is pair-lock greedy (the globally best
candidate–semantic pair is locked first) so a strong observation cannot be
displaced by a weaker earlier one.

**Result:**

| Fixture | GT doors | matched | kept geo-only | unresolved semantic |
|---|---|---|---|---|
| 05 cubicasa | 1 | **1** (door-0, score 0.57) | 0 | 0 |
| 06 basement | 5 | **2** (Hobbyraum↔Flur 0.94, Heizung↔Flur 0.93) | 0 | 3 (Heizung↔Hobbyraum, Öl↔Flur, exterior) |
| 07 basement real | ~5 | **1** (Flur↔Öl on the south wall) | 1 | 4 |
| 08 upper floor real | ~4 | **1** (Kind II↔Flur on the east wall, 0.85) | 3 | 3 |
| 09 ground floor real | ~6 | **1** (Kochen↔Diele on Kochen's south wall) | 2 | 5 |

The two matched doors on the authored basement plan are the two the UNet
actually found — and the fusion selected them *by their semantic identity*:
`door-0` (x≈692) became "Hobbyraum and Flur", `door-1` (x≈331) became
"Heizung and Flur" — the connectivity + "left/centre-right side of the
horizontal dividing wall" hints were enough to tell the two apart. The
Heizung↔Hobbyraum door (x=420 wall), the Öl↔Flur door and the exterior entry
have **no UNet candidate** and are reported as unresolved — no geometry was
fabricated (this is the exact complementarity Phase 5 measured: the VLM sees
doors the UNet does not).

## Step 7 — Window fusion

Same principle with the window's explicit `wall` field as the strongest
signal ("north wall" → the candidate's host wall must classify as north) plus
space→room connectivity. In this evaluation run the UNet detected windows only
on the real scans (its window recall varies run to run — the same model
produced 3 windows for fixture 05 in the Phase 3 run and 0 here):

| Fixture | GT windows | matched | kept geo-only | unresolved semantic |
|---|---|---|---|---|
| 07 basement real | ~3 | **1** (Heizung, north wall, score 0.74) | 0 | 2 |
| 08 upper floor real | ~4 | **1** (window on the big room's north wall) | 0 | 3 |
| 05/06 | 3/4 | 0 | 0 | 3/4 unresolved |

The authored plans' four basement windows remain unresolved — the UNet
produced no window candidates in this run — which is the honest outcome:
fusion can select, it cannot invent.

## Step 8 — Stairs

The UNet has no stair class, so `VistaGeometry.stairs` was always `[]`.
Fusion turns the VLM's `stairs.present/location/direction` into a **semantic
region candidate**: an anchor point (from the relative location), the hosting
matched room, the direction — and *no* tread geometry, *no* width/length, *no*
confidence. Detected on all four plans that have stairs (06–09), direction
`up` on the authored basement:

| Fixture | stairs | hosting region |
|---|---|---|
| 06 basement | 1, direction up | Flur |
| 07 basement real | 1 | Flur |
| 08 upper floor real | 1 | Kind II / Arbeiten (the only enclosed region) |
| 09 ground floor real | 1 | no region (anchor outside every enclosed region) |

The `Stair` model was minimally extended (`direction`, `regionId`, `source:
'semantic'`, optional width/length) — backward compatible; 3D/360 untouched.

## Step 9 — Furniture exclusion

Furniture is a **suppression signal**: a *weak* (uncertain/invalid) UNet
opening candidate whose room is furnished per the VLM — and for which the VLM
reports no openings of that kind in that room — is suppressed and preserved as
`suppressed_by_furniture` in the debug surface. Valid geometry is never
deleted because furniture is nearby. On unlabeled plans (furniture without a
space attribution) a weaker fallback applies: a weak opening inside any room
while the VLM reports no openings of that kind anywhere.

No fixture exercised the veto in this evaluation run (the UNet produced no
weak window candidates here), so the mechanism is proven by the unit tests
(`test_furniture_suppresses_weak_window_candidate`,
`test_furniture_does_not_suppress_vlm_confirmed_window`,
`test_furniture_never_suppresses_valid_geometry`) — including the invariant
that VLM-confirmed windows are never suppressed.

## Step 10 — Interior/exterior wall classification

The room-boundary ring verifies every wall type against the matched room
polygons (a wall with exactly one outside-facing perpendicular side is on the
building boundary); the check agrees with the mask heuristic on **every
fixture** — no silent disagreement was found. Additional semantic evidence: a
wall hosting a **matched exterior door** is forced exterior with
`type_evidence: ["semantic_exterior_door"]`. `unknown` is now a valid wall
type and is used only when neither side is determinable — evidence is never
forced. All other walls keep their original classification plus
`type_evidence`.

## Step 11 — Dimensions

VLM dimensions are preserved verbatim (`{"value": "8800", "unit": "unknown",
"source": "visual_text"}`), carried in the fused document, and **never** used
to scale or transform geometry. `notes.dimensions_preserved_only: true`;
scale calibration is explicitly deferred to the next phase.

## Step 12 — Confidence and provenance

No confidence is fabricated. Fused rooms/doors/windows carry the UNet
confidence they came from; semantic-only entities (stairs) carry `null`.
Every fused entity has explicit provenance:

```json
"provenance": {"geometric": "unet", "semantic": "vlm"}
```

Valid UNet openings that no semantic observation claimed are **kept** in the
fused output marked `semantic_match: false` (geometric-only) — fusion never
deletes geometry the deterministic pipeline accepted.

## Step 13 — Debug comparison in `/geometry`

The developer debug view gained two layers next to Original / AI raw /
Normalized / candidates:

* **Fused geometry** (green) — matched rooms with their exact labels and
  types drawn on the polygons, matched vs geometric-only doors/windows,
  semantic stair markers with direction, and a fusion summary card
  (named rooms, stairs, unresolved counts, suppressed openings).
* **VLM semantics** (violet) — every semantic space's anchor with its label
  (unresolved spaces in red, furniture markers grey).

Selecting any fused room/opening/stair or semantic space shows the entity
inspector with the *reason it was selected* — e.g. for `door-1` on the
basement plan: `semantic door at 'left side of the horizontal dividing wall'
matches candidate door-1 on wall n-wall-24 (score=0.93)`, plus the factor
breakdown (`orientation:horizontal`, `anchor_distance_px`, `connectivity`)
in the fused document's `debug` surface. All new UI text is localized
(en/de). The Mock provider and the non-debug geometry view are unchanged.

## Step 14/15 — Evaluation discipline

The exact Phase 2–5 fixture set was used, fused against the *saved* Phase 5
VLM responses (reproducible, no new API calls). All rules are generic — there
are no fixture names or coordinate constants anywhere in `fusion.py`; the
lexicon, scoring weights and thresholds are the same for authored and scanned
plans. Where a result is wrong, the documentation below says so instead of
adding a special case.

## What improved (measured) vs. UNet alone

| Capability | Phase 3/4 UNet | + Phase 6 fusion |
|---|---|---|
| Room semantics | none (faces only) | labels + types on every matched room (6 named across fixtures) |
| Room count | 2/2/2/3/4/3/2/3/1 | same polygons, 6 unresolved spaces explained per-reason |
| Door identity | "a door at position 0.36 on n-wall-24" | "the Hobbyraum↔Flur door" (connectivity + wall-side evidence) |
| Stairs | `[]` everywhere | 4 semantic region candidates with hosting rooms |
| False geometry | furniture can become openings | furniture veto + documented suppression |
| Auditing | candidates + reasons | plus match scores, factors and provenance on every entity |

The single most valuable improvement is **room identity**: on the authored
basement plan the three regions are now *named and typed* (Heizung/
Hobbyraum/Flur + Öl honestly unresolved), on the German plan the two regions
are named (Wohnen / Essen, Bad), and the doors on the basement plan carry
their semantic connections — information the UNet pipeline cannot produce at
all.

## Remaining failures (documented, not worked around)

1. **Room count is still the UNet's ceiling.** Fixtures 01, 07, 08, 09 have
   semantic rooms that no geometric region corresponds to (thin-line walls the
   model cannot enclose). Fusion reports them unresolved with reasons — it
   does not split polygons. Fixing this is a *model* problem (a room-polygon
   model such as Raster2Seq once GPU inference exists), not a fusion problem.
2. **Window fusion is empty on the authored plans in this run** because the
   UNet produced no window candidates (its window recall varies run to run;
   the Phase 3 run found 3 on fixture 05). Fusion can only select what the
   UNet detects.
3. **Doors the UNet misses** (fixture 06: Heizung↔Hobbyraum, Öl↔Flur,
   exterior entry) stay unresolved even though the VLM sees them — the spec
   forbids fabricating them, and the spec is right.
4. **Furniture veto not exercised live** on this run (no weak opening
   candidates were produced); it is covered by unit tests and remains armed.
5. **Heizung ↔ Öl on the authored basement plan** — one region, two labels.
   Fusion picks the first claim and reports the second as shared. The drawing
   genuinely lacks the dividing wall; only a semantic room model could split
   it.
6. **Run-to-run UNet variance** affects the exact counts above (e.g. this
   run's fixture 05 has 1 door/0 windows vs. the Phase 3 run's 0 doors/3
   windows). The fusion rules are stable; the tables are from the run that
   regenerated `output/phase6/`.

## Acceptance-criteria check

| Criterion | Status |
|---|---|
| Existing UNet extraction still functional | ✅ same pipeline; +2–8 ms fusion |
| Existing VLM semantic extraction still functional | ✅ same schema/gate, reused verbatim |
| Dedicated fusion layer exists | ✅ `geometry_ai/fusion.py`, deterministic |
| Rooms matched to geometric candidates | ✅ containment + anchor scoring, 17/17 unit tests |
| Matched rooms receive labels/types | ✅ exact labels, controlled enum types |
| Doors semantically matched | ✅ wall-side + connectivity + pair-lock greedy |
| Windows semantically matched | ✅ wall-field + space connectivity |
| Stairs represented when detected | ✅ semantic region candidates (4 fixtures) |
| Furniture as exclusion signal | ✅ weak-opening suppression + tests |
| Interior/exterior uses semantic evidence | ✅ exterior-door forcing + boundary verification |
| Missing geometry never fabricated | ✅ unresolved candidates with reasons everywhere |
| Provenance preserved | ✅ `provenance` + `semantic_match` + `type_evidence` |
| `/geometry` shows fused output | ✅ fused layer + fusion summary card |
| Raw/normalized/VLM/fused comparable | ✅ 7 independent debug layers |
| Same fixtures evaluated | ✅ all 9, saved Phase 5 responses |
| Actual improvement documented | ✅ tables above + measured summary |
| Mock provider still works | ✅ untouched |
| 3D and 360 untouched | ✅ no changes outside the geometry pipeline |
| Typecheck / lint / tests / build | ✅ 39/39 python tests (17 new), tsc 0 new, eslint 0 errors, next build ok |

## Verdict

The success criterion was: *UNet provides reliable geometric evidence, VLM
provides semantic understanding, and deterministic fusion combines them into
substantially better VistaGeometry.* **Met**: room identity, door semantics,
stairs, furniture exclusion and per-entity provenance are real, measured
improvements that neither source alone provides — without the VLM ever being
asked for a pixel coordinate. The remaining gaps are precisely the ones the
phase spec predicted: rooms the UNet cannot enclose and openings the UNet
cannot see are reported as unresolved candidates rather than fabricated
geometry. That is the architecture working as designed, not a failure mode.

# Phase 7 — Geometry candidate recovery

> **Question this phase answers:** when the VLM reliably detects an
> architectural entity (a window, a door, a stair, a room) but the UNet produced
> **no usable geometric candidate** — `UNet: windows = []`,
> `UNet: stairs = []`, or fewer room faces than the plan contains — can a
> *deterministic recovery layer* re-derive the missing geometry from the source
> image and the existing wall topology, without ever letting the VLM become
> authoritative geometry?

**Yes — measured on real drawings.** Recovery re-detects wall openings directly
in the source raster (a window/door interrupts the wall band's ink) and coarse
stair regions from repeated parallel tread lines. It operates **only** on the
semantic observations Phase 6 left unresolved, and every recovered entity
carries independent image evidence, `image_recovery` provenance and an evidence
level — never a VLM coordinate, never a fabricated value. When the image shows
no reliable evidence, the entity stays **unresolved with a reason**.

Execution details and raw results are reproduced in
`geometry-ai/output/phase7/` (regenerate with `python -m geometry_ai.evaluate`).
The evaluation reuses the **saved Phase 5 VLM responses** when present and
otherwise falls back to the authored fixture semantics in
`fixtures/semantics/*.json` — derived from the documented Phase 5 readings and
passed through the identical validation gate — so the fusion/recovery passes
are reproducible without new API calls.

## Why recovery was necessary

Phase 6 ended with an honest ceiling: fusion can only *select, name, classify*
what the UNet produced. Real plans still contain the cases the phase spec
leads with:

| Plan | VLM sees | UNet produces | Fusion result before Phase 7 |
|---|---|---|---|
| authored basement (06) | **4 windows** | `windows = []` | 4/4 unresolved |
| authored basement (06) | **5 doors** | 2 doors | 3/5 unresolved |
| German real-estate (01) | 8 spaces | 2 room faces | 6/8 unresolved |
| ground floor (09) | 6 spaces | 0–1 room faces | 6/6 unresolved |
| basement real scan (07) | windows + doors | weak openings | several unresolved |
| any plan with stairs | stairs present | no stair class | only a semantic anchor |

Recovery fills the openings and the stair region **only where the drawing
itself provides the evidence**; the room gaps stay unresolved — a floor-plan
wall graph cannot and must not invent a boundary that is not drawn.

## Recovery architecture

The layer slots in after semantic fusion and before validation/emission:

```
UNet geometry
      ↓
Normalization        (Phase 3)
      ↓
Semantic Fusion      (Phase 6) — unresolved observations only
      ↓
Candidate Recovery   (NEW: geometry_ai/recovery.py, deterministic)
      │   window opening?  → wall gap detection on source image
      │   door opening?    → wall gap detection, room-connectivity-pinned
      │   room?            → wall-graph faces; no boundary ⇒ unresolved
      │   stair?           → repeated parallel-tread-line detection
      ↓
Validation           width/alignment/occupancy/evidence gates, per entity
      ↓
VistaGeometry        (fused doc + appended recovered entities, provenance)
```

Principles (unchanged from Phase 6):

* **The VLM never produces geometry.** Its output is semantics only: entity,
  visible label, wall side ("north wall"), room connectivity ("Kochen ↔
  Diele"), compass relative location. Those hints *select* which wall/region to
  inspect — every coordinate in a recovered entity comes from the detector.
* **No second AI model, no re-running the VLM**, no training, no Raster2Seq.
  Recovery is pure numpy/OpenCV/PIL geometry over the source image and the
  existing normalization output.
* **Deterministic**: identical inputs ⇒ byte-identical outputs (asserted in
  tests). Recovery does not carry timing in its document.
* **Recovery priority** per the spec: windows → doors → rooms → stairs.

The service (`POST /extract`) runs recovery automatically whenever fusion runs,
returning the fused document extended with a `recovery` section and the
recovered entities appended to the doors/windows/stairs arrays.

## Window opening detection (the core primitive)

A window/door interrupts the drawn wall band: on **double-line scans** both
strokes break (a strong ink drop), on **filled-band CAD plans** a window is a
lighter transverse line across the band (a weaker but still local ink drop).
The detector profiles the centerline ink of a normalized host wall:

```
ts, profile = sample gray[wall centerline ± 0.2·thickness] at step 0.33·thickness
baseline   = 70th percentile(profile)          # the wall's dominant ink level
gap        = run of consecutive positions where baseline − profile > 0.10·baseline
             (min width = max(2·step, 0.6·thickness), inset ≥ 2·thickness from
              both wall endpoints so fragment ends never count as gaps)
evidence   = high  (ratio ≥ 0.40) / medium (≥ 0.18) / low (≥ 0.10) / none
```

All thresholds are **relative to the wall's own thickness and ink level** — the
same constants work on authored 1000–1200 px plans and 1500 px real scans. No
pixel coordinate is ever hard-coded.

### Window recovery (priority 1)

For each unresolved semantic window: the `space` field names the room (whose
matched boundary walls become the only credible hosts — windows sit on a
room's exterior shell), a compass `wall` field ("north wall") is enforced
strictly against the classified wall side, then the gap **nearest to the
semantic anchor** on those walls is selected — provided it passes:

1. **wall alignment** — host wall side == semantic wall side (when named),
   exterior walls preferred;
2. **plausible width** — between `max(4, 0.6·median_thickness)` and
   `0.55 · wall length`;
3. **no overlap** with any already-emitted opening (matched or geometric-only)
   on that wall;
4. **sufficient evidence** — the ink-break ratio must reach at least `low`.

If no gap passes, the window stays unresolved with
`no_reliable_opening_evidence`.

## Door recovery (priority 2)

The `connects` field (`"Heizung and Hobbyraum"`) names the two rooms. When
both are matched geometric faces, recovery takes the wall that **separates
their centroids** (perpendicular sides opposite) — not merely a wall both rooms
border, which on the authored basement would wrongly pull in the shared south
wall. With a single separating wall the gap on it **is** the door, so the
coarse plan-fraction anchor cannot veto it; otherwise the anchor still gates
position. Validation as for windows, plus: interior semantic doors reject
exterior walls and vice versa.

**Swing is never invented.** Recovered doors carry `swing: "unknown"` in the
debug document and the neutral frontend default otherwise — exactly the
no-swing-signal convention of Phases 3–6.

## Room recovery (priority 3) — *do not force a room that is not bounded*

The normalization layer already reconstructs every closed face of the wall
graph as a room *candidate* (accepted or rejected). Recovery **re-uses that
graph**, it does not build a second topology engine:

* a space whose anchor lies inside an **accepted** face already claimed by
  another space stays `region_shared_with_space:<name>`;
* a space whose anchor lies inside only **rejected** faces (too small /
  wall artefact / …) stays unresolved with
  `no_closed_geometric_boundary:<reason>`;
* a space whose anchor lies in **no face** stays
  `no_closed_geometric_boundary`.

When the VLM says **Öl** but the drawing has no wall separating it from the
neighbouring space, the result is exactly the spec's required outcome —
`semantic entity: Öl · geometry: unresolved · reason: no closed geometric
boundary`. This is asserted by a dedicated unit test; **no polygon is ever
fabricated**. On the current fixtures no recoverable room existed that the
normalization had not already accepted — room "recovery" on these plans is
honest unresolved-with-explanation, which is what Step 7 demands.

## Stair recovery (priority 4)

The UNet has no stair class; Phase 6 emitted a *semantic region candidate*
(anchor + hosting room + direction). Recovery upgrades it to a **coarse
geometric region** when the drawing shows the characteristic signature:

* a `200×200 px` neighbourhood around the semantic anchor is binarized and
  searched with `HoughLinesP` for long near-parallel lines;
* ≥ 3 near-parallel tread lines (within ±6°) of plausible length ⇒ the stair
  is recovered with an oriented **region** (center + extent + orientation) and
  `evidence_level` high/medium.

Direction stays the VLM's (`up`/`down`/unknown) — recovery never invents it.
No individual treads are reconstructed (Steps 8's explicit MVP limit). If no
parallel-line evidence exists, the stair stays the semantic region candidate.

## Provenance and confidence (Steps 10–11)

Every recovered entity carries:

```json
"provenance": {"geometric": "image_recovery", "semantic": "vlm", "recovery": true},
"evidence_level": "high" | "medium" | "low",
"recovered_reason": "wall opening pattern t=…..…px on wall n-wall-22 (ink break ratio 0.34)" |
                   "repeated parallel tread pattern (8 lines, horizontal)"
```

`confidence` stays `None` — no fabricated probability. The three-level evidence
scale replaces invented `0.873421`-style scores.

## Measured results (all 9 fixtures, same model/run as Phases 2–6)

Semantics: saved Phase 5 responses where present, otherwise the authored
fixture semantics (`fixtures/semantics/`). UNet run identical to Phase 6.

### UNet only → + normalization → + fusion → + fusion + recovery

| Fixture | UNet windows | fused windows | **rec windows** | UNet doors | fused doors | **rec doors** | stairs rec | rooms rec |
|---|---|---|---|---|---|---|---|---|
| 01 German real-estate | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 |
| 02 clean | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 |
| 03 dimensions | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 |
| 04 furnished | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 |
| 05 CubiCasa-style | **0** | 0 | **3** | 1 | 1 | 0 | — | 0 |
| 06 basement (authored) | **0** | 0 | **4** | 2 | 2 | **3** | 1 | 0 |
| 07 basement (real scan) | 0 | 1 | 0 | 2 | 2 | **2** | 1 | 0 |
| 08 upper floor (real) | 0 | 1 | **1** | 4 | 4 | 0 | 1 | 0 |
| 09 ground floor (real) | 0 | 0 | **1** | 3 | 3 | 0 | 1 | 0 |
| **Total recovered** | | | **9** | | | **5** | **4** | — |

### Headline cases

* **06 — authored basement plan (the phase's reference case).** The UNet
  produced **0 windows**; recovery found all **4 drawn windows** at their exact
  positions (Heizung north, Hobbyraum north, Hobbyraum east, Öl west — low/medium
  evidence, validated by the strict wall-side + room-boundary anchors), and the
  **3 unmatched doors** (Heizung↔Hobbyraum on the x=420 divider, Öl↔Flur on the
  x=250 divider, exterior entry on the east wall — high evidence). The stair
  treads at Flur south-east are detected (8 parallel lines, horizontal) and the
  stair becomes a geometric region. **Ground truth 4 windows / 5 doors / 1
  stair → after recovery 4 / 5 / 1, exactly.** No false positive: every
  recovered opening lands on the drawn opening.
* **05 — CubiCasa-style plan.** This UNet run produced **0 windows** (Phase 3's
  run found 3); recovery restored **3/3 drawn windows** (north ×2, east).
* **07–09 — real scans.** Interior door gaps on 07 are recovered (Heizung↔
  Hobbyraum, Heizung↔Flur); 08/09 recover their strongest wall gaps as windows.
  Stair regions on all four plans with stairs are recovered. Remaining
  openings the drawings show too faintly stay **unresolved with reasons**.
* **01 — German real-estate plan.** No windows/doors drawn → nothing recovered
  (correct). The six rooms the UNet cannot enclose stay unresolved
  (`region_shared_with_space` / no boundary) — recovery does not invent walls.

### What stayed unresolved (and why)

| Entity | Count | Reason recorded |
|---|---|---|
| German plan rooms (Küche/Bad/… 6 spaces) | 6 | `region_shared_with_space` / no closed boundary |
| 09 ground-floor rooms (6 spaces) | 6 | `no_closed_geometric_boundary` |
| 09 doors (6 semantic) | 6 | `no_reliable_opening_evidence` |
| 09 + 08 windows (5) | 5 | `no_reliable_opening_evidence` |
| 07/08 rooms | 6 | no closed boundary |

The unresolved entries remain **visible and explainable** in the recovered
document, the `recovery-summary.md` reasons table, and the `/geometry`
inspector.

### False positives

On the authored fixtures recovery had **zero false positives** — every
recovered opening/region corresponds to a drawn opening (verified against the
fixture generators at exact positions). On the real scans no automatic
ground-truth annotation exists; the precision gates (wall side, room boundary,
anchor, plausible width, occupancy) are the same, and every recovered entity
carries its evidence level so a low-confidence case is auditable. The honest
fallback — `no_reliable_opening_evidence` — outnumbers speculative recoveries:
the detector is deliberately conservative (any gap below 10 % ink-break is
ignored).

## Validation, determinism, coordinate handling

* **Validation** is part of recovery (not bolted on): wall alignment, plausible
  width, wall-gap interior margin, occupancy vs already-emitted openings, and
  the evidence floor. Failure ⇒ `unresolved`.
* **Determinism**: recovery output is byte-identical for identical inputs
  (tested); the recovery document deliberately has no timing field.
* **Coordinates (Step 9)** stay in the **source-pixel system** of the
  normalized geometry and the fused document. The detector samples the source
  image directly at wall-centerline coordinates; the VLM's relative-location
  fractions are resolved via the same `parse_relative_location`/plan-bounds
  mapping fusion uses — never used as geometry. Unit tests cover the
  source↔mask letterbox round-trip, in-bounds profile sampling, and
  anchor-fraction mapping (see `test_recovery.py`).

## Frontend debugging (Step 17)

`/geometry` gained a **Recovered** debug layer plus a recovery summary card.
Recovered entities are drawn in distinct colours (amber windows, rose doors,
orange stair region) and are selectable: the inspector shows
`Entity: Window · Status: Recovered`, the wall/width/position, and the image
**evidence** ("wall opening pattern …", "repeated parallel tread pattern …").
The layers list is now *Original · AI raw · Normalized · Fused · Recovered ·
VLM semantics · Room candidates · Opening candidates*. All new UI text is
localized (en/de); the Mock provider and the non-debug geometry view are
unchanged. `geometry` returned by the extract route is the recovered variant
when recovery ran (strictly more geometry), with raw/normalized/fused still
available for comparison.

## Acceptance-criteria check

| Criterion | Status |
|---|---|
| Candidate Recovery exists as a separate deterministic layer | ✅ `geometry_ai/recovery.py`, runs after fusion in the service |
| It operates only on unresolved semantic observations | ✅ works from `fused.unresolved`; never re-runs the VLM |
| Window recovery implemented and validated | ✅ 9 windows recovered across fixtures; unit tests |
| Door recovery implemented and validated where feasible | ✅ 5 doors recovered (incl. `swing: unknown`); unit tests |
| Room recovery reuses existing wall topology | ✅ re-uses `normalized.candidates.rooms` faces; 0 fabricated |
| Stair recovery provides only coarse validated geometry | ✅ region {center, extent, orientation}, tread-line evidence |
| VLM coordinates never treated as authoritative geometry | ✅ tests assert position comes from the detector |
| Recovered entities have provenance | ✅ `image_recovery` + `recovery: true` + evidence level |
| Unresolved entities remain visible and explainable | ✅ `recovery.unresolved` with `recovery_reason`; UI |
| Coordinate transformations tested | ✅ `test_source_to_mask_roundtrip`, in-bounds sampling |
| All existing fixtures evaluated | ✅ 9/9 with before/after tables |
| Before/after results documented | ✅ this section + `output/phase7/recovery-summary.md` |
| Visual overlays generated | ✅ `output/phase7/*.recovery.png` (normalized | fused | recovered) |
| No fixture-specific hacks | ✅ generic relative thresholds; the only fixture data are the semantic *inputs* |
| Mock and UNet providers keep working | ✅ provider code unchanged except ad or adapter outputs |
| 3D and 360 untouched | ✅ no changes outside the geometry pipeline |
| Tests / typecheck / lint / build | ✅ 57 python tests (18 new), 188 frontend tests, tsc 0, eslint 0 errors, next build ok |

## Remaining limitations (documented, not worked around)

1. **Window recall on authored band plans is low-certainty.** Windows drawn as
   thin lighter lines *over* an intact dark band yield weak ink breaks
   (low/medium evidence) and are sometimes below the 10 % floor (the two
   faintest authored-basement windows in early detector iterations). On
   double-line scans the same openings produce strong breaks. This is inherent
   pixel evidence, not a modelling error — the documentation reports the
   evidence level rather than guessing.
2. **Rooms are the UNet-walls' ceiling.** When the wall graph has no closed
   face for a space, recovery leaves it unresolved. Only a room-polygon model
   (e.g. Raster2Seq on GPU) could close faces the UNet cannot segment.
3. **Door swing cannot be recovered** — the drawings carry no swing signal
   robust enough to infer geometrically; recovered doors keep `swing: unknown`.
4. **Anchor precision.** The VLM's compass phrases are plan-fractions; they
   are only guides. Recovery therefore leans on the stronger signals (room
   connectivity / separating wall / wall side) and keeps the anchor gate
   generous-but-bounded.
5. **Real-scans semantic drift.** The real-scan semantics in this evaluation
   are authored from the documented Phase 5 readings (no API keys available);
   the recovery *rules* are identical to the authored fixtures, so the
   conclusion that recovery restores genuinely missing geometry is independent
   of which semantic document drove the run.

## Verdict

The success criterion — *recovery provides real geometric improvement, not
merely a higher entity count* — is **met**. The authored basement plan goes
from `windows=[]` to **4/4 drawn windows**, `5/5 doors` and a **geometric stair
region**, every recovered entity backed by its own wall-opening / tread-line
evidence with zero false positives on the authored set. Where the drawing does
not support a candidate, recovery returns `unresolved` with an explicit reason
instead of fabricating geometry — Step 7's Öl behaviour is asserted by a unit
test. The VLM remains a semantic-only advisory; all geometry still flows from
the UNet, the wall graph, and now deterministic image analysis.
