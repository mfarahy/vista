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