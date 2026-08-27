# geo2 — Licensing register

geo2 Phase 1 introduced no external AI model. Phase 2 adds hosted-openAI
providers plus verified licensing records for investigated-but-not-run
candidates. Every model or provider that joins the benchmark MUST get a row
here with a verified license before it is used, so commercial use of a future
geo2 API stays clean.

Recorded fields per provider (see `geometry_ai/providers/base.py` →
`Licensing`):

| provider | source | license | commercial_use | weights_license | inference_requirements |
|---|---|---|---|---|---|
| `baseline-mock` | geo2 project code | MIT | permitted | n/a (no external weights) | CPU, no GPU, no network |
| `gpt-4o-vlm` | https://platform.openai.com/api/pricing | OpenAI proprietary API (pay-per-token) | permitted | n/a (hosted API, no downloadable weights) | cloud API; structured outputs supported (snapshot 2024-08-06+) |
| `gpt-4o-vlm-reconstruct` | https://platform.openai.com/api/pricing | OpenAI proprietary API (pay-per-token) | permitted | n/a (hosted API) | cloud API |
| `gpt-4.1-mini-vlm` | https://platform.openai.com/api/pricing | OpenAI proprietary API (pay-per-token) | permitted | n/a (hosted API) | cloud API |

## Investigated candidates (not wired into the benchmark)

| candidate | source | license | commercial_use | why not run/adopted |
|---|---|---|---|---|
| Qwen2.5-VL-7B-Instruct (open VLM) | https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct | Apache-2.0 (weights) | permitted | needs CUDA GPU (~13 GB VRAM BF16); no GPU in this environment |
| CubiCasa5K ResNet34-UNet (specialized floor-plan) | https://github.com/CubiCasa/CubiCasa5k | CC BY-NC 4.0 (weights/code), dataset CC BY-NC-SA 4.0 | **not permitted** | CUDA-only **and** non-commercial → not a legal production engine |
| Claude Sonnet 4.5/4.6 (reference) | https://www.anthropic.com/pricing | proprietary API | permitted | no API key in this environment; reference only |
| Gemini 2.5 Pro/Flash (reference) | https://cloud.google.com/vertex-ai/generative-ai/pricing | proprietary API | permitted | no API key in this environment; reference only |
| MeltFlex / "MeltFlexAI" | https://meltflex.com (no public API docs retrievable) | unknown | unknown | no verifiable official product/API/pricing; treated as a documented limitation |

## geo2 code dependencies

| dependency | license | commercial use |
|---|---|---|
| pydantic | MIT | permitted |
| Pillow | HPND (PIL) / MIT | permitted |
| numpy | BSD-3-Clause | permitted |
| openai (client in `geometry_ai/providers/openai_vlm.py`) | Apache-2.0 (SDK) | permitted |
| pytest (dev) | MIT | permitted |

## Rules

- Only record a license you can point to (name + source URL + license text).
- Never guess a commercial-API price; `estimated_cost_usd` is derived from actual
  token usage × official, current prices (see `phase2-report.md`).
- If a candidate provider's licensing is unclear or restricted, document the
  risk here **before** wiring it into the benchmark.