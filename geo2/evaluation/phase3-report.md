# geo2 — Phase 3: Geometry-First Specialized Model Benchmark Report

> Floor Plan Image → Accurate 2D Architectural Geometry JSON.
> Phase 3 answers the question Phase 2 could not: **can a specialized
> geometry/CV floor-plan model beat a VLM at geometric reconstruction?**
>
> - Phase: 3 (research benchmark)
> - Date: 2026-08-27
> - Environment: CPU-only (8 cores / 23 GB RAM, no CUDA GPU), Python 3.12,
>   internet available for research + weight download. Same 9 fixtures, same
>   canonical schema (`geo2-1.0`), same validator, same metrics as Phases 1–2.
> - Candidates: 2 fully benchmarked specialized segmenters + 2 inspected but
>   not runnable here (concrete blockers documented, nothing fabricated).
> - `geometry-ai` was not modified. Only `geo2/` changed.
> - Full per-candidate research + licensing records: `phase3-candidates.md`.

---

## 1. What was benchmarked

| id | approach | model | ran here |
|---|---|---|---|
| `cubicasa-unet` | specialized CV: 4-class UNet (floor/wall/door/window) | ResNet34-UNet (Yytsi `floorplan-to-3d`, trained on CubiCasa5K), 512² letterbox | **yes** (CPU) |
| `openbim-unet` | specialized CV: 4-class UNet (bg/wall/window/door), CAD-domain-adapted | OpenBIM M2 UNet+ResNet34 (CubiCasa5K + domain adaptation), 512² square-resize | **yes** (CPU) |
| `raster2seq` | specialized: image → labeled polygon sequences (rooms+windows+doors) | Raster2Seq, SIGGRAPH 2026 (SOTA) | **no** — CUDA-only compiled ops (`models/ops` + `diff_ras`); exact error recorded |
| `roomformer` | specialized: vectorized room polygons | RoomFormer, CVPR 2023 | **no** — consumes 3D-scan *density maps*, not raster drawings; same CUDA-only op stack |

Phase 2 candidates retained for comparison: `gpt-4o-vlm`, `gpt-4o-vlm-reconstruct`,
`gpt-4.1-mini-vlm` (hosted, measured last phase) and `baseline-mock`.

---

## 2. Executive Summary

- **Specialized segmenters hit near-perfect wall *geometry* — the exact
  thing the VLMs struggle with.** Both UNets matched **16/16** ground-truth
  wall segments across the two authored GT fixtures (Phase 2: GPT-4o 9/16,
  GPT-4.1-mini 13/16), and predicted walls lie over dark wall pixels with
  **0.94–1.00** fidelity on the source drawings. Wall localization is the
  specialized model's clear win.
- **OpenBIM detected 5/6 GT doors (GPT-4o: 1/6; GPT-4.1-mini: 2/6)** and both
  models detected 3/7 GT windows (GPT-4o: 1/7; GPT-4.1-mini: 0/7). Opening
  *detection* is also a specialized win.
- **But specialized models produce no room instances, no labels, no stairs,
  and no semantics** — the single "floor"/"background" class is not a room
  decomposition. Rooms 0/8, stairs 0/1 for both (VLM: rooms 2–3/8, stairs
  1/1). Semantic understanding remains squarely a VLM strength.
- **The specialized models are radically cheaper and faster on CPU alone**:
  steady-state **0.52–0.64 s/image** at $0 per-image token cost, vs OpenAI
  hosted VLMs at **12.5–14.9 s mean** and **$0.003–0.016/image**.
- **Document validity is LOWER for the specialized models** (3/9 and 5/9 vs
  7/9 GPT-4o), and the failure modes are honest and instructive:
  1. **windows / doors whose mask blob sits in a wall-mask gap** — the UNet
     breaks a wall into runs at a wide opening, so the opening centroid is
     half-an-opening-width from the nearest emitted wall; geo2's
     "opening centre near its wall" invariant fails (representation gap:
     mask-based openings are not wall-associated the way line-based drawings
     are);
  2. **floating door detections** — e.g. `cubicasa-unet` on `06-basement`
     predicted a door with **no wall pixel within 110 px** (1/3 doors
     floating);
  3. **real scans** (07/08/09) — door/window masks fire on noise off any wall.
- **Raster2Seq, the strongest true geometry candidate, cannot run without a
  GPU** — verified: `models/ops` raises `NotImplementedError: Cuda is not
  availabel` on this machine. Booking it, not faking it.

### Recommendation (Step 18): **C — Hybrid** (specialized geometry + VLM semantics)

The evidence is now two-sided and clean:

```text
Specialized UNet:          excellent walls (16/16), good doors/windows masks,
                           NO rooms, NO labels, NO stairs
GPT-4o (VLM):              good rooms (3/8), labels, stairs (1/1),
                           weak walls (9/16), weak door/window pixels
```

Neither approach alone satisfies the full geo2 spec. A hybrid where the
specialized model fixes the wall/opening *geometry* and the VLM supplies
room/label/stair *semantics* is the natural next architecture — but fusion is
**not implemented in this phase** (per the brief; Step 17 documents the
complementarity only). If a hybrid is not acceptable and one engine must be
chosen today, **A — Direct VLM** remains the only single engine that produces
the full canonical document (7/9 valid) — but its wall/opening geometry is
measurably worse than a $0 local UNet. The honest recommendation is that the
two are complementary, not rivals.

---

## 3. Accuracy (headline, aggregated over the 2 authored-GT fixtures)

Ground truth (geo2-gt-v1): walls 16, rooms 8, doors 6, windows 7, stairs 1.

### 3.1 Detection vs GT

| Candidate | Walls | Rooms | Matched-room IoU | Doors | Windows | Stairs | Geometry-valid (9 fx) |
|---|---|---|---|---|---|---|---|
| baseline-mock | 10/16 | 0/8 | 0.00 | 0/6 | 1/7 | 0/1 | 9/9 (trivially) |
| gpt-4o-vlm (P2) | 9/16 | 3/8 | 0.58 | 1/6 | 1/7 | 1/1 | 7/9 |
| gpt-4.1-mini-vlm (P2) | 13/16 | 2/8 | 0.38 | 2/6 | 0/7 | 1/1 | 6/9 |
| **cubicasa-unet** | **16/16** | 0/8 | 0.00 | 2/6 | 3/7 | 0/1 | 3/9 |
| **openbim-unet** | **16/16** | 0/8 | 0.00 | **5/6** | 3/7 | 0/1 | 5/9 |

Walls: detection counts wall *segments* greedily matched within 5%-of-diagonal
tolerance to a GT wall (1:1). Both UNets over-split (see §6) producing many
false-positive *segment* tracks (<b>+10…+27 walls/plan</b>), so FP is high
even though geometric coverage is complete — a representation, not an
accuracy, artifact. Rooms = 0 because these models have no room-instance class,
and nothing was fabricated to fake one.

### 3.2 Per-fixture (GT fixtures)

| Fixture | Candidate | Walls | Rooms | Doors | Windows | Stairs | validity |
|---|---|---|---|---|---|---|---|
| 05-cubicasa | cubicasa-unet | 8/8 | 0/4 | 0/1 | **3/3** | – | valid |
| 05-cubicasa | openbim-unet | 8/8 | 0/4 | 0/1 | 3/3 (off-wall) | – | **invalid** |
| 06-basement | cubicasa-unet | 8/8 | 0/4 | 2/5 | 0/4 | 0/1 | **invalid** (floating door) |
| 06-basement | openbim-unet | 8/8 | 0/4 | **5/5** | 0/4 | 0/1 | valid |

`05` highlights both sides of the story: windows are *detected* perfectly
(positions match GT within a few px) yet the mask calls them "off-wall"
because the wall mask is broken around the 170 px opening. OpenBIM on `06`
detecting **all five** GT doors is the single best opening result in any geo2
phase.

### 3.3 Overall rates (all 9 fixtures)

| Candidate | geometry-valid | catastrophic | valid JSON (raw model runnable) |
|---|---|---|---|
| cubicasa-unet | 3/9 | 0/9 | 9/9 (always produces a schema object) |
| openbim-unet | 5/9 | 0/9 | 9/9 |
| gpt-4o-vlm | 7/9 | 0/9 | 9/9 |

### 3.4 Wall pixel fidelity (source-image cross-check)

| Candidate | mean predicted-wall → dark-pixel coverage |
|---|---|
| cubicasa-unet | 1.00 (05), 1.00 (06) |
| openbim-unet | 1.00 (05), 0.94 (06) |

Predicted wall segments coincide with drawn wall pixels nearly everywhere — the
wall *geometry* is real.

---

## 4. Drawings style / generalization (Step 14)

| style | fixtures | cubicasa | openbim | notes |
|---|---|---|---|---|
| clean vector-like | 02, 03 | valid | valid | few/no openings predicted; walls correct |
| furnished | 04 | **invalid** (window off-wall) | valid | furniture not emitted as geometry (good); one off-wall window |
| dimensions lines | 03 | valid | valid | dims ignored (no labels/dims emitted) |
| German labels | 01 | **invalid** (2 doors off-wall) | valid | labels ignored; doors mostly detected |
| stairs | 06 | invalid (floating door) | **valid, doors 5/5** | stairs not detected by either |
| real scans | 07/08/09 | invalid all 3 | invalid all 3 | door/window masks fire off walls; walls still partially aligned |

Generalization finding: **specialized models generalize well on clean/drawn
plans but are brittle on real scans** — which is expected for a network trained
on clean CubiCasa-style drawings without scanned-noise augmentation. Their
strength is concentrated in the drawing style they were designed for; the VLM
generalized to all styles (2–3/3 real-scan fixtures valid).

---

## 5. Performance (Step 6/15)

Measured on this CPU-only machine (8 cores). `latency_ms` = whole
provider-call (preprocess + forward + vectorization); first fixture includes
weight loading (~5–7 s) so steady-state is reported separately.

| Candidate | mean | median | p95 | device |
|---|---|---|---|---|
| cubicasa-unet | 1.25 s (all 9) / **0.64 s** steady | 0.61 s / **0.61 s** | 3.98 s (warm-up) / **0.80 s** | CPU (8 threads) |
| openbim-unet | 1.19 s (all 9) / **0.53 s** steady | 0.52 s / **0.52 s** | 4.20 s (warm-up) / **0.66 s** | CPU (8 threads) |
| gpt-4o-vlm (P2) | 12.5 s | 12.6 s | 18.6 s | hosted API |
| gpt-4.1-mini-vlm (P2) | 14.9 s | 13.7 s | 23.8 s | hosted API |

VRAM: none used (CPU). vs Phase 2 the specialized models run **~15–20× faster
and ~free per image**.

---

## 6. Cost & infrastructure (Step 15)

- Per-image token cost: **$0** for both local models (`cost_status: n/a`).
  OpenAI Phase 2: $0.0164 (gpt-4o) / $0.0031 (gpt-4.1-mini) per image *measured*.
- To deploy one of these locally you pay **infrastructure**, not tokens. On a
  cheap 2-vCPU / 4 GB instance at ~$0.03/h, steady-state throughput ≈ 1.5
  img/s/core-pair → realistic marginal cost is well under $0.001/image plus
  fixed hosting; but no precise dollar figure is invented here — infra cost is a
  deployment-time calculation.
- Hosted alternative (Raster2Seq on a single L4/A10 GPU) not measured; CPU not
  possible (CUDA ops).

---

## 7. Failure analysis (Step 6, concrete)

- **cubicasa-unet (3/9 valid)**
  - `04-furnished`: 2 windows whose centroids are >63 px from the nearest
    emitted wall (mask gap at opening) → invalid.
  - `06-basement`: `door-003` predicted with **no wall pixel within r≈10 px**
    (nearest emitted wall 110 px) → floating door, document invalid; doors
    2/5 matched.
  - `01-german-realestate`: 9 doors emitted, 2 off-wall → invalid.
  - real scans: door/window masks off walls.
- **openbim-unet (5/9 valid)**
  - `05-cubicasa-style`: windows detected 3/3 and *positions match GT within a
    few px*, but the wall mask is broken at the 170 px openings; window
    centroids sit ~79–99 px (tolerance 63 px) from the nearest emitted wall
    run → invalid. A **mask-vs-line representation gap**, not a locate error.
  - real scans 07/08/09: window/door blobs off wall.
  - `06-basement`: **doors 5/5 matched + geometry valid** — best fixture in
    the phase for any candidate on openings.
- **raster2seq** — could not run: `NotImplementedError: Cuda is not
  availabel` (models/ops) and `CUDAExtension` in diff_ras; no CPU fallback.
- **roomformer** — could not run: input modality (3D-scan density map, not a
  raster drawing) + identical CUDA-only op stack.

Cross-candidate recurring mode (the phase's core answer):

1. **mask representation breaks walls at wide openings** → opening-centroid-to-
   wall distance ≈ ½·opening width → geo2's wall-association invariant fails.
   This is the mirror image of Phase 2's #1 failure ("door/window not attached
   to wall") but with an opposite cause: the geometry *is* correct, the
   representation has no continuous wall to attach to.
2. **floating-door false positives** on some plans/scans (mask says door, mask
   has no wall nearby).
3. No rooms/labels/stairs by design.

---

## 8. Native vs canonical capability (Step 11) — representation honesty

```text
                         NATIVE                          CANONICAL (geo2-1.0)
cubicasa-unet            floor/wall/door/window mask     walls=derived (centerlines);
                         (+ polygon contours)            doors=yes; windows=yes;
                                                         rooms=unavailable;
                                                         stairs/labels/dims=unsupported
openbim-unet             bg/wall/window/door mask        walls=derived; doors=yes;
                                                         windows=yes; rooms=unavailable;
                                                         stairs/labels/dims=unsupported
raster2seq (not run)     room+window+door polygons       walls=indirect (room edges);
                         with semantic labels            rooms=yes; doors=yes;
                                                         windows=yes; stairs/dims=no
roomformer (not run)     room polygons only              rooms=yes; walls=indirect;
                                                         doors=no; windows=no
```

The adapter stored for every run the native mask + model-space polygons under
`output/<provider>/<fixture>/native_output/` and the canonical document as
`result.json` — the benchmark never hides a weak model behind undocumented
post-processing (Steps 8–9).

---

## 9. VLM vs specialized (Step 12/17)

| dimension | GPT-4o (VLM) | openbim-unet (specialized) | winner |
|---|---|---|---|
| walls (GT match) | 9/16 | **16/16** | specialized |
| doors (GT match) | 1/6 | **5/6** | specialized |
| windows (GT match) | 1/7 | **3/7** | specialized (tie with cubicasa) |
| rooms | **3/8** | 0/8 | VLM (specialized has no class) |
| stairs | **1/1** | 0/1 | VLM |
| labels / semantics | yes | no | VLM |
| geometry validity | **7/9** | 5/9 | VLM |
| per-image latency | 12.5 s | **0.65 s** | specialized |
| per-image token cost | **$0.016** | **$0 (infra only)** | specialized |
| commercial licensing | clean API | **RISK** (NC training data) | VLM |
| deployment | hosted, simple | self-host CPU, simple | both |

**Complementarity** (Step 17, not fused): the specialized model produces
excellent walls + opening masks; the VLM produces excellent rooms/labels/stairs.
Each fails exactly where the other succeeds, on the same images. This is the
strongest signal in the phase for a **hybrid** direction, and it is deliberately
not built here.

---

## 10. Commercial assessment (Steps 3/8)

| candidate | source code | weights | training data | commercial gate |
|---|---|---|---|---|
| cubicasa-unet | MIT | MIT (listed) | CubiCasa5K **CC BY-NC** | **COMMERCIAL_RISK** — usability depends on the NC-training-data question |
| openbim-unet | MIT | MIT (listed) | CubiCasa5K **CC BY-NC** | **COMMERCIAL_RISK** — same |
| raster2seq | MIT | MIT (listed) | mixed (Structured3D MIT / CubiCasa NC / LIFULL) | **COMMERCIAL_RISK** per checkpoint; `s3d-*` cleaner but 3D-plan domain |
| roomformer | MIT | **unknown** | Structured3D MIT / SceneCAD | **UNKNOWN / RISK** — weights license unstated |

**A mitigation exists**: the failure mechanism here is the *training data*, not
the architectures. UNet segmentation and sequence-decoder floorplan models can
be **fine-tuned / re-trained on permissive data** (e.g. the MIT-or-CC-BY ResPlan
17k vector-graph dataset, or internally sourced plans) to produce commercially
clean weights. See §11.

---

## 11. Fine-tuning / training potential (Step 16)

| candidate | fine-tuning | training code | permissive dataset option | est. training footprint |
|---|---|---|---|---|
| cubicasa-unet | yes (smp.UNet) | yes (`train.py`) | ResPlan (CC BY 4.0), internal | small — 24M params; single GPU hours-to-a-day at 512² |
| openbim-unet | yes | yes (`train_all.py`, `finetune_domain*.py`) | same | same |
| raster2seq | yes (2-stage finetune) | yes | would need to adapt labels | larger — Deformable-DETR decoder + diff-ras, GPU-terabyte; tens of images not enough |

A controlled re-training experiment was **not** run (out of scope for Phase 3;
the goal is architecture selection, not training).

---

## 12. Method / reproducibility

- Same 9 fixtures, same `FloorPlanGeometry` schema, same `validate_geometry`
  invariants, same `compute_metrics` (5%-of-diagonal greedy matching), same
  overlay renderer as Phases 1–2. No metric was changed to favor the new models.
- Adapter = representation conversion only. Allowed post-processing:
  letterbox/stretch coordinate mapping, mask→polygon contours (the model's own
  pipeline), wall centerlines via morphological skeletonisation + DP corner
  splitting, opening centroid/feret width, class-id → semantic mapping.
  NOT allowed and NOT done: no fixture-specific fixes, no wall gluing across
  openings, no room invention, no VLM assistance, no hardcoded coordinates —
  the failures below are recorded, not patched.
- Everything regenerates:
  `./.venv/bin/python -m evaluation.run --provider cubicasa-unet --output output [--resume]`
- Source truth: `phase3-candidates.md`; native outputs and overlays under
  `output/`, per-fixture `native_output/native.json` + `native_mask.png` +
  `overlay.png` (git-ignored).

---

## 13. Limitations

- Training biases / per-style: models were trained on clean CubiCasa-style
  drawings; real-scan generalization is weak (measured, not hidden). We
  measured it rather than hiding it.
- Single run per fixture per candidate, temperature-independent (CNNs are
  deterministic); VLM figures come from Phase 2's single runs.
- Walls over-split: matching counts every split as a separate wall (FP high),
  so wall *counts* under-read the excellent geometric coverage; both count and
  pixel-fidelity are reported.
- Raster2Seq / RoomFormer showed capability but no measured output (CUDA).
- Ground truth exists only for the two authored plans.

---

## 14. Conclusion

A specialized floor-plan segmentation model is **not** a full replacement for a
VLM — it has no rooms/semantics — but on the exact weaknesses Phase 2
identified (wall geometry, door/window detection) it is decisively better,
faster and cheaper. Recommended next step: **C — Hybrid** (measure, then fuse:
specialized geometry under the hood, VLM for rooms/labels/stairs), with the
commercial **RISK** on the current weights cleared either by legal review or by
re-training on permissive data before production. Do **not** ship these
specific weights commercially without addressing the CC BY-NC training-data
question.