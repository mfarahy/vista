# geo2 — Licensing register

geo2 Phase 1 introduces **no external AI model and no external weights**.
Every model or provider that later joins the benchmark MUST get a row here
with a verified license before it is used, so commercial use of a future
geo2 API stays clean.

Recorded fields per provider (see `geometry_ai/providers/base.py` →
`Licensing`):

| provider | source | license | commercial_use | weights_license | inference_requirements |
|---|---|---|---|---|---|
| `baseline-mock` | geo2 project code | MIT | permitted | n/a (no external weights) | CPU, no GPU, no network |

## geo2 code dependencies (Phase 1)

| dependency | license | commercial use |
|---|---|---|
| pydantic | MIT | permitted |
| Pillow | HPND (PIL) / MIT | permitted |
| numpy | BSD-3-Clause | permitted |
| pytest (dev) | MIT | permitted |

## Rules

- Only record a license you can point to (name + source URL + license text).
- Never guess a commercial-API price; `estimated_cost_usd` stays null until a
  price is read from an official, current source.
- If a candidate provider's licensing is unclear or restricted, document the
  risk here **before** wiring it into the benchmark.