# Phase 2 — Candidate research records

Collected Phase 2 (Step 1) from official, current sources. Cost figures are
official list prices only; anything not verifiable is recorded as `unknown`.
Measured latency/cost from this phase are in `phase2-report.md`.

Fields: `name / provider / model / official documentation / weights-API
availability / license / commercial_use / structured_output_support /
image_input_support / estimated_cost / expected_latency / GPU_requirements`

---

## 1. GPT-4o — strong hosted multimodal (benchmarked)

```text
name                      = OpenAI GPT-4o (gpt-4o-2024-11-20 alias)
provider                  = OpenAI
model                     = gpt-4o
official documentation    = https://developers.openai.com/api/docs/models/gpt-4o
weights/API availability  = hosted API (Chat Completions / Responses / Batch)
license                   = proprietary API terms
commercial_use            = permitted (pay-per-token)
structured_output_support = yes — native JSON Schema / Structured Outputs (snapshot 2024-08-06+)
image_input_support       = yes (text+image in → text out)
estimated_cost            = $2.50 / 1M input, $10.00 / 1M output; cached input $1.25.
                            image tokens = 85 base + 170 per 512x512 tile
                            (e.g. 1200x840 → 1105 tokens ≈ $0.0028 invoiced image tokens)
expected_latency          = measured here: mean 12.5 s / median 12.6 s / p95 18.6 s per image
                            (model time only); see phase2-report.md
GPU_requirements          = n/a (cloud API)
```

## 2. GPT-4.1-mini — cost-efficient hosted multimodal (benchmarked)

```text
name                      = OpenAI GPT-4.1-mini
provider                  = OpenAI
model                     = gpt-4.1-mini
official documentation    = https://developers.openai.com/api/docs/models/gpt-4.1-mini
weights/API availability  = hosted API
license                   = proprietary API terms
commercial_use            = permitted
structured_output_support = yes — Structured Outputs (JSON Schema)
image_input_support       = yes
estimated_cost            = $0.40 / 1M input, $1.60 / 1M output; cached input $0.10.
                            image tokens = 32x32-patch based x 1.62 (2048px cap)
expected_latency          = measured here: mean 14.9 s / median 13.7 s / p95 23.8 s; see report
GPU_requirements          = n/a (cloud API)
```

## 3. Claude Sonnet (reference — NOT benchmarked)

```text
name                      = Anthropic Claude Sonnet 4.5 / 4.6
provider                  = Anthropic
model                     = claude-sonnet-4-5 / claude-sonnet-4-6
official documentation    = https://www.anthropic.com/pricing ; https://platform.claude.com/docs
weights/API availability  = hosted API (no downloadable weights)
license                   = proprietary API terms
commercial_use            = permitted
structured_output_support = yes — json_schema (constrained) + forced tool-use JSON
image_input_support       = yes
estimated_cost            = $3.00 / 1M input, $15.00 / 1M output (Sonnet 4.5/4.6); ~28x28px
                            visual-token patches; NOT benchmarked this phase (no API key)
expected_latency          = unknown
GPU_requirements          = n/a (cloud API)
```

## 4. Gemini 2.x (reference — NOT benchmarked)

```text
name                      = Google Gemini 2.5 Pro / Flash / Flash-Lite
provider                  = Google (Google AI / Vertex AI)
model                     = gemini-2.5-* 
official documentation    = https://cloud.google.com/vertex-ai/generative-ai/pricing
weights/API availability  = hosted API
license                   = proprietary API terms
commercial_use            = permitted
structured_output_support = yes — native responseSchema (JSON, schema-enforced)
image_input_support       = yes
estimated_cost            = 2.5 Pro $1.25/$10 (<=200k ctx); Flash $0.30/$2.50;
                            Flash-Lite $0.10/$0.40; 1024x1024 ≈ 1290 image tokens.
                            NOT benchmarked this phase (no API key)
expected_latency          = unknown
GPU_requirements          = n/a (cloud API)
```

## 5. Qwen2.5-VL-7B — open self-hostable VLM (selected, could not run here)

```text
name                      = Qwen2.5-VL-7B-Instruct
provider                  = Alibaba Qwen
model                     = Qwen/Qwen2.5-VL-7B-Instruct
official documentation    = https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct ;
                            https://github.com/QwenLM/Qwen2.5-VL
weights/API availability  = downloadable weights (HF / ModelScope); vLLM / SGLang / Transformers
license                   = Apache-2.0
commercial_use            = permitted
structured_output_support = partial — prompt-driven stable JSON for coordinates/attributes;
                            no native schema-constrained decoding documented
                            (achievable via vLLM guided decoding)
image_input_support       = yes (multi-image, dynamic resolution, 4–16,384 visual tokens)
estimated_cost            = $0 per token (self-hosted); only GPU/infra cost
expected_latency          = unknown (requires CUDA GPU; CPU inference impractical)
GPU_requirements          = CUDA GPU, BF16 ≈ 13.2 GB VRAM (INT8 6.6 / INT4 3.3 GB);
                            FlashAttention-2 recommended
WHY NOT RUN HERE          = no CUDA GPU in environment (no /dev/nvidia*, no torch).
                            CPU-only inference of a 7-8B VLM across 9 fixtures is
                            impractical and would not reach usable latency.
```

## 6. CubiCasa5K UNet — specialized floor-plan model (selected, could not run here)

```text
name                      = CubiCasa5K ResNet34-UNet (Raster-to-Vector floorplan net)
provider                  = CubiCasa / Aalto University
model                     = ResNet34-UNet multi-task (semantic + instance)
official documentation    = https://github.com/CubiCasa/CubiCasa5k ; dataset
                            https://zenodo.org/record/2613548
weights/API availability  = code + pretrained weights (model_best_val_loss_var.pkl) on Google Drive
license                   = CC BY-NC 4.0 (code/weights); dataset CC BY-NC-SA 4.0
commercial_use            = NOT permitted (non-commercial only)
structured_output_support = n/a — CNN segmentation: semantic maps (wall/door/window/room
                            types) + instance heatmaps, NOT an LLM JSON pipeline
image_input_support       = yes (floor-plan images)
estimated_cost            = $0 per token (self-hosted); only GPU/infra cost
expected_latency          = unknown
GPU_requirements          = CUDA GPU (PyTorch 1.x, nvidia-docker recommended); small UNet,
                            few GB VRAM
WHY NOT RUN HERE          = (1) CUDA GPU required — none in environment;
                            (2) non-commercial license (CC BY-NC) already rules it out
                            as a production geometry engine.
```

## 7. MeltFlex — external commercial baseline (unverifiable)

```text
name                      = MeltFlex (referent "MeltFlexAI")
provider                  = unknown
model                     = unknown
official documentation    = https://meltflex.com resolves but serves no public API docs
weights/API availability  = unknown
license                   = unknown
commercial_use            = unknown
structured_output_support = unknown
image_input_support       = unknown
estimated_cost            = unknown
expected_latency          = unknown
GPU_requirements          = unknown
verification              = no official product/API/pricing could be verified from any
                            accessible source; the repo only references "MeltFlexAI" as a
                            hypothetical future provider in
                            expose-service/src/lib/floorplan-3d/. No automated benchmark
                            is feasible; recorded as a limitation, not fabricated.
```

## Selection rationale (Step 2)

Target of 2–4 serious candidates, without padding:

- **GPT-4o** — strongest available hosted multimodal candidate (structured outputs, vision),
  commercially clean → benchmarked (Variants A + B).
- **GPT-4.1-mini** — second hosted commercial candidate at ~5x lower cost → benchmarked to
  answer cost-vs-quality.
- **Qwen2.5-VL-7B** — the only clearly commercial (Apache-2.0) *self-hostable* open VLM
  considered; selected but documented why it cannot run in this environment.
- **CubiCasa5K UNet** — the specialized floor-plan baseline; selected to be investigated but
  documented why it cannot run here (CUDA-only + non-commercial).
- **baseline-mock** — existing geo2 infrastructure sanity check only, not a real approach.

Claude/Gemini were researched but not benchmarked (no API key in this environment) and are
recorded as references only. No additional models were added merely to inflate the count.