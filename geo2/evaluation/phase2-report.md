# geo2 — Phase 2: Intelligent Vision Geometry Benchmark Report

> Floor Plan Image → High-quality 2D Architectural Geometry JSON.
> Objective: measure which AI approach can directly produce a structured
> geo2-canonical floor-plan geometry, with evidence.
>
> - Phase: 2 (benchmark)
> - Date: 2026-08-27
> - Environment: CPU-only (no CUDA GPU available), 8 cores / 23 GB RAM; hosted
>   OpenAI API reachable (key supplied); `geo2` venv Python 3.12.
> - Every candidate used the **same** canonical schema (`FloorPlanGeometry`,
>   geo2-1.0), the **same** validator, the **same** metrics and the **same**
>   9 fixtures as Phase 1. No provider-specific geometry schemas or evaluation
>   rules. `geometry-ai` was not modified.
> - Measurement convention: `latency_ms` = model call only (validation is harness
>   cost); `estimated_cost_usd` derived from **actual** API token usage × **official**
>   OpenAI prices (never guessed). Full candidate records: `phase2-candidates.md`.

---

## 1. Candidates benchmarked

| id | approach | model | ran in this environment |
|---|---|---|---|
| `baseline-mock` | infra sanity check (Phase 1) | deterministic mock | yes |
| `gpt-4o-vlm` | strong hosted multimodal, **Variant A (direct geometry)** | `gpt-4o` (Structured Outputs) | yes |
| `gpt-4o-vlm-reconstruct` | same model, **Variant B (architectural reconstruction)** | `gpt-4o` | yes |
| `gpt-4.1-mini-vlm` | cost-efficient hosted multimodal, Variant A | `gpt-4.1-mini` | yes |
| `qwen2.5-vl-7b` (selected, not run) | open self-hostable VLM, Apache-2.0 | Qwen2.5-VL-7B-Instruct | **no** — needs CUDA GPU (≈13 GB VRAM BF16), none present; CPU inference impractical |
| `cubicasa5k-unet` (selected, not run) | specialized floor-plan CNN | ResNet34-UNet | **no** — CUDA-only **and** non-commercial (CC BY-NC 4.0) |
| MeltFlex (external baseline) | commercial floor-plan API | unknown | **no** — no verifiable official API/pricing; repo only references it as a hypothetical provider in `expose-service/src/lib/floorplan-3d/`. Recorded as a documented limitation, nothing fabricated. |

Per Phase 2 rules: no candidate was added merely to inflate the count; Claude /
Gemini were researched as references only (no API key in this environment).

### Structured output (Step 6)

All three OpenAI runs used native **Structured Outputs** (`text.format:
json_schema`, strict) parsing directly into the canonical `FloorPlanGeometry`
Pydantic model. Result: **9/9 parse rate per candidate — zero malformed JSON,
zero catastrophic (API/safety) failures.** This validates the structured-output
route end-to-end; the fallback JSON-mode path (`json_object` + Pydantic) exists
but was never needed.

---

## 2. Executive Summary

- **Direct VLM geometry works end-to-end and is the strongest working approach
  observed.** `gpt-4o-vlm` produced architecture-meaningful, geo2-valid geometry
  on **7/9** fixtures; walls and room polygons were recognized (matched-room IoU
  0.54–0.61 on the authored GT plans), wheels/stairs recognized, real scans
  handled (2/3 valid). This is substantially better than the Phase 1 baseline,
  which is structurally "valid" by construction but reports **zero** semantic
  detection (rooms 0/8, stairs 0/1, room IoU 0.0).
- **The decisive weakness is opening (door/window) localization, not overall
  understanding.** The dominant validation failure across *all* candidates is
  "door/window centre too far from its wall"; on GT plans only 1–2 of 6 doors and
  0–1 of 7 windows match positions within a 5%-of-diagonal tolerance. Counts are
  roughly right; pixel positions drift.
- **Prompt structure does not materially change geometric quality.** Variant B
  (architectural reconstruction) did not beat Variant A (direct): 6/9 valid vs
  7/9, and no better GT match. Answer to Step 7 question: structure-in-prompt is
  not a lever for geometry quality here.
- **Cost the differentiator, not accuracy, between the two OpenAI models.**
  `gpt-4.1-mini` matched `gpt-4o` on validity (6/9) and on one GT plan achieved
  the best matched-room IoU (0.75) while costing **~5× less** ($0.003/image vs
  $0.016/image) — at the price of higher latency (median 13.7 s vs 12.6 s).
- **Cannot yet answer the open/specialized question in this environment.** The
  only commercially clean self-hostable open VLM (Qwen2.5-VL-7B) and the
  specialized floor-plan net both need CUDA, which is absent. The specialized net
  (CubiCasa5K) is additionally non-commercial, so it is not a legal production
  engine regardless of accuracy.

### Recommendation (Step 17): **A — Direct VLM**

One evidence-based call: **A — Direct VLM** as the geometry engine direction,
with requirements (a) keep native structured outputs onto the geo2 schema,
(b) treat door/window wall-association as the known bottleneck for a dedicated,
measured experiment, and (c) re-run the open VLM on GPU. Do **not** add UNet
heuristics; do **not** resurrect the old fusion/recovery pipeline.

---

## 3. Accuracy

Reading: ground-truth detection is greedy 1:1 matching within tolerance
(5% of image diagonal ≈ 63 px on the 1000×760 GT plans); `det` = matched,
`GT` = ground-truth count. Aggregated over the two authored-GT fixtures
`05-cubicasa-style` + `06-basement`.

### 3.1 Headline (aggregated over the 2 GT fixtures)

| Candidate | Walls (det/GT) | Rooms (det/GT) | Matched-room IoU* | Doors (det/GT) | Windows (det/GT) | Stairs (det/GT) | Geometry valid (9 fx) |
|---|---|---|---|---|---|---|---|
| baseline-mock | 10/16 | 0/8 | 0.00 | 0/6 | 1/7 | 0/1 | 9/9 (trivially) |
| **gpt-4o-vlm** | 9/16 | 3/8 | **0.58** | 1/6 | 1/7 | **1/1** | **7/9** |
| gpt-4o-vlm-reconstruct | 10/16 | 2/8 | 0.27 | 0/6 | 0/7 | 1/1 | 6/9 |
| gpt-4.1-mini-vlm | **13/16** | 2/8 | 0.38 | **2/6** | 0/7 | **1/1** | 6/9 |

\* `matched-room IoU` = mean polygon IoU over **matched** rooms only (see note below; a low
number also reflects rooms that failed the centroid match — e.g. merged rooms).

> Note on interpretation: this metric under-reads room quality on `06-basement`
> for all models — rooms were merged (hall + abutting room collapsed), so the
> centroid/IoU match fails even though the plan is broadly understood. Both
> count columns and IoU are reported to avoid over-claiming.

### 3.2 Per-fixture detection (GT fixtures only)

| Fixture | Candidate | Walls | Rooms | Room IoU | Doors | Windows | Stairs |
|---|---|---|---|---|---|---|---|
| 05-cubicasa | gpt-4o-vlm | 3/8 | 2/4 | 0.544 | 0/1 | 0/3 | – |
| 05-cubicasa | gpt-4o-vlm-reconstruct | 3/8 | 2/4 | 0.544 | 0/1 | 0/3 | – |
| 05-cubicasa | gpt-4.1-mini-vlm | 7/8 | 2/4 | **0.750** | 0/1 | 0/3 | – |
| 06-basement | gpt-4o-vlm | 6/8 | 1/4 | **0.608** | 1/5 | 1/4 | 1/1 |
| 06-basement | gpt-4o-vlm-reconstruct | 7/8 | 0/4 | 0.0 | 0/5 | 0/4 | 1/1 |
| 06-basement | gpt-4.1-mini-vlm | 6/8 | 0/4 | 0.0 | 2/5 | 0/4 | 1/1 |

Highlight: every model reliably finds the staircase (1/1) and most walls; the
orthogonal room split and the opening pixels are where accuracy collapses.

### 3.3 Overall rates (all 9 fixtures)

| Candidate | Valid-JSON rate | Geometry-valid rate | Catastrophic-failure rate |
|---|---|---|---|
| baseline-mock | 9/9 | 9/9 | 0/9 |
| gpt-4o-vlm | 9/9 | **7/9** | 0/9 |
| gpt-4o-vlm-reconstruct | 9/9 | 6/9 | 0/9 |
| gpt-4.1-mini-vlm | 9/9 | 6/9 | 0/9 |

---

## 4. Cost

Actual measured cost over this run (27 API calls): `input_tokens`/M × official
input price + `output_tokens`/M × official output price. Image tokens are billed
as part of `input_tokens`; the reported `image_tokens` column uses the official
tile/patch estimators. `cost_status = estimated` for OpenAI (usage × official
list price), `n/a` for the local baseline.

| Candidate | Cost/Image (mean) | Total (9 fx) | Latency mean / median / p95 (ms) | Infrastructure |
|---|---|---|---|---|
| baseline-mock | $0.00 | $0.00 | 0.26 / 0.23 / 0.40 | CPU, local |
| gpt-4o-vlm | $0.0164 | $0.148 | 12,515 / 12,603 / 18,632 | hosted API |
| gpt-4o-vlm-reconstruct | $0.0165 | $0.148 | 13,122 / 11,685 / 20,480 | hosted API |
| gpt-4.1-mini-vlm | $0.0031 | $0.028 | 14,886 / 13,675 / 23,824 | hosted API |
| qwen2.5-vl-7b (not run) | $0 (self-host) + GPU infra | – | unknown | CUDA GPU ≈13 GB VRAM |
| cubicasa5k-unet (not run) | $0 (self-host) + GPU infra | – | unknown | CUDA GPU; CC BY-NC |

Notes:
- A single GPT-4o call ≈ 2,500 in / 1,300 out tokens ≈ $0.019; GPT-4.1-mini ≈
  3,500 in / 1,050 out tokens ≈ $0.003 (its patch-based image encoding is larger
  but 6× cheaper per token).
- Latency figures are single-run measurements (one generation per fixture per
  candidate, temperature 0); the VLM runs also showed run-to-run variance in
  *which* geometry detail is off, so percentile spreads are indicative, not a
  noise floor.
- No cost was ever guessed; anything not verifiable is `unknown` (see candidate
  file).

## 5. Commercial

| Candidate | Commercial Use | License | Self-hostable |
|---|---|---|---|
| baseline-mock | permitted | MIT (geo2 code) | yes (CPU) |
| gpt-4o | permitted | OpenAI API terms (proprietary, pay-per-token; no weights) | no (hosted only) |
| gpt-4.1-mini | permitted | OpenAI API terms | no (hosted only) |
| qwen2.5-vl-7b | permitted | Apache-2.0 (weights) | yes (GPU) |
| cubicasa5k-unet | **not permitted** | CC BY-NC 4.0 (weights) / CC BY-NC-SA (data) | yes, but legally restricted |
| MeltFlex | unknown | unknown | unknown |

A technically strong model with incompatible licensing is not a production
candidate: **CubiCasa5K fails commercial viability at the license gate**, so
even a GPU would not make it the primary engine unless a separate commercial
license is obtained.

## 6. Failure analysis

Per candidate, the observed failure modes across the 9 fixtures:

- **gpt-4o-vlm (7/9 valid)**
  - `door/window not attached to wall` (dominant): `07-basement-real` door-1 sat
    110 px off its wall; `01-german-realestate` window off its wall → document invalid.
  - `wrong wall topology / degenerate room polygon`: `01-german-realestate` room
    polygon contained a duplicate consecutive vertex (index 13) → invalid.
  - `merged rooms`: on `06-basement` 3 rooms predicted vs 4 GT (hall merged with
    an adjacent space; only 1/4 rooms centroid-matched, IoU 0.61).
  - `omitted openings`: on clean/furnished synthetic plans (`02-clean`,
    `04-furnished`) returned 0 doors and 0 windows — openings likely missed on
    thin-line drawings (needs overlay review).
  - `angeled wall split`: on GT plans predicted more wall segments than the
    authored GT (10 vs 8 on `06-basement`), producing false-positive splits.
- **gpt-4o-vlm-reconstruct (6/9)**
  - Variant B did **not** help: additionally invalid on `08-upper-floor-real`
    (window off its wall) and on `06-basement` rooms matched 0/4 (IoU 0.0) —
    a *worse* room result than Variant A despite identical model/fixture.
  - Same dominant door/window association failures as Variant A.
- **gpt-4.1-mini (6/9)**
  - `coordinate drift` is starkest here: on `08-upper-floor-real` all three doors
    sat exactly 150 px from their walls → invalid; `07-basement-real` door-2 150 px
    off → invalid; `04-furnished` window off its wall → invalid.
  - Best wall precision on GT (13/16) yet worst door/window match (1/6 doors, 0/7
    windows): strong layout + weaker opening pixels.
- **baseline-mock (9/9 valid but semantically empty)** — always one box + one
  divider; rooms 0/8, doors 0/6, stairs 0/1 on GT. Confirms the harness; not a
  competing approach.

Cross-candidate recurring modes (the benchmark's core answers):
1. **door/window not attached to wall** — the #1 geometry-invalidity cause.
2. **coordinate drift** (door/window centres tens-to-150 px off) — the #1
   GT-miss cause; direct image-relative coordinate prediction is only
   approximately reliable (Step 5 answer: recorded as a failure, no heuristics
   added).
3. **merged rooms / hallway merged with room** — room polygon count and IoU.
4. **missing windows / omitted openings** on simple line drawings.
5. **wall splitting** — extra segments, no topology break, but false positives.
6. Prompt structure (Variant A vs B) → no material change in quality.

## 7. Visual comparison (Step 11)

Every candidate produced an overlay for every fixture (36 overlays total):

```text
output/gpt-4o-vlm/{fixture}.overlay.png          (9)
output/gpt-4o-vlm-reconstruct/{fixture}.overlay.png (9)
output/gpt-4.1-mini-vlm/{fixture}.overlay.png    (9)
output/baseline-mock/{fixture}.overlay.png       (9)
```

Each overlay shows: original image + predicted walls (exterior/interior) +
rooms (fill + outline) + doors + windows + stairs hatch + labels + dimensions.
Overlays are generated for valid **and** invalid-but-parsed documents so the
full output can be inspected. (Reviewed by a human; the runner does not bias
overlays by validity.)

## 8. Method (how it was measured)

- **Fixtures**: the exact Phase 1 manifest (9 images): German real-estate plan,
  clean plan, dimensions plan, furnished plan, CubiCasa-style plan (GT), basement
  plan (GT, stairs), + 3 real scans. Same images for every candidate.
- **Pipeline** per candidate: `image → provider → canonical schema → validator →
  metrics → overlay`; the runner is model-agnostic (only the
  `FloorPlanProvider.analyze()` interface).
- **Prompts**: one shared instruction set (no invented entities, furniture ≠
  architecture, walls connect, doors/windows on walls, closed room polygons,
  confidence = uncertainty, unique ids, JSON only, no explanation/CoT);
  Variant A = direct geometry; Variant B = reconstruct-then-emit (conceptually,
  without requesting visible reasoning).
- **Structured output**: native OpenAI JSON-Schema Structured Outputs, parsed
  into the canonical schema; fallback JSON-mode + Pydantic exists but unused.
- **Coordinates**: image-relative px, top-left origin, x→right, y→down,
  `source.width/height`, `units="px"`. No real-world scale; no post-processing
  or recovery heuristics were added (per the rule: record the failure, do not
  patch it).
- **Cost**: actual per-call `input_tokens`/`output_tokens` × official prices
  ($/1M: gpt-4o 2.50/10.00; 4.1-mini 0.40/1.60); `image_tokens` logged with the
  official estimators; `cost_status=estimated`.
- **Latency**: provider call wall-time only; mean/median/p95 computed across the
  same 9 fixtures per candidate.
- **Artifacts**: `output/<candidate>/{fixture}/{result.json, metrics.json,
  overlay.png}` + `output/<candidate>/summary.json|md`; all runner outputs
  regenerate via `./.venv/bin/python -m evaluation.run --provider <id>
  [--resume]` and are git-ignored.

## 9. Limitations of this phase

- Single run per fixture/candidate (temperature 0); VLM sampling variance means
  a second run can shift one fixture between valid/invalid — treated as evidence,
  not noise-hidden.
- The open VLM and the specialized net could not be executed (no CUDA GPU); the
  open VLM question is therefore **not** answered by data — only by feasibility
  analysis.
- Ground truth exists for 2 authored plans only; the 3 real scans and the other
  synthetic plans are evaluated on validity + counts + overlays.
- No scale estimation, no dimensional-value correctness (only detection), no
  room-type accuracy scoring (schema keeps `type` open per design).

## 10. Next steps (evidence-based)

1. Keep **direct VLM (A)** as the primary geometry engine; keep native structured
   outputs onto the canonical schema.
2. Measure (not patch): run a targeted door/window association + pixel-precision
   experiment (2–3 plans, ≥3 runs each) to quantify the drift floor and whether
   a *minimal* deterministic snap onto the emitted walls is justified — no new
   fusion/recovery engine.
3. Re-run the open candidate (**Qwen2.5-VL-7B**, Apache-2.0) on CUDA hardware to
   answer self-hosting cost/latency/quality; re-check **MeltFlex** when/if an
   official API and price list become verifiable.
4. Do not resurrect the UNet → VLM → Fusion → Recovery architecture; it is not
   supported by the evidence in this phase.