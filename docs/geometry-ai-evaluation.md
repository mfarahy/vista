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