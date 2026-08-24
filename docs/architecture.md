# Raumwerk Exposé: Phase 1 Architecture

## Shape

The `frontend/` package is the only Next.js application. The `expose-service/` Express/Mastra service owns the REST API, persistence boundary, AI services, location services, uploads, and PDF renderer. The frontend calls that service through `frontend/lib/api.ts`.

`expose-service/src/lib/types.ts` contains the legacy and canonical wire contracts. `expose-service/src/lib/expose-data.ts` is the typed Phase 1 source-of-truth model, including energy, structured address/location, rooms, equipment, image semantics, agent data, and separate Vista branding. `expose-service/src/lib/store.ts` is a local-file repository for immediate demo mode; `expose-service/prisma/schema.prisma` is the PostgreSQL source of truth for production persistence. Images use a local filesystem asset store while their semantic metadata is persisted with the property.

## Routes

- `/` dashboard and demo entry point
- `/create` creates a draft
- `/create/[id]` wizard, review, AI editor
- `/preview/[id]` HTML exposé preview and PDF actions
- `/expose/print/[id]` print route used by PDF export (no Builder UI)

## API contracts

- `POST /api/properties` creates a draft
- `GET|PUT /api/properties/:id` reads or updates structured property data
- `POST /api/properties/:id/images` accepts multipart images
- `DELETE /api/properties/:id/images/:imageId` removes an image
- `PUT /api/properties/:id/images/reorder` accepts `{ imageIds: string[] }`
- `POST /api/properties/:id/ai/improve` accepts `{ action?: string }` and returns `ExposeContent`
- `GET|PUT /api/properties/:id/expose` reads or updates generated content
- `POST /api/properties/:id/marketing-content/generate` generates the Phase 4 marketing content from reviewed property data and user information
- `POST /api/properties/:id/pdf` opens the frontend print route `/expose/print/:id` in Chromium and returns the A4 PDF. The same `ModernExposeTemplate` as the Builder preview is rendered; `FRONTEND_URL` points at the Next.js app

Image uploads require `category` (`exterior`, `interior`, `floor_plan`, or `document`) and may include `subcategory` and `caption`. Existing records are normalized with optional canonical data on load.

## AI boundary

`buildAIInput()` creates a whitelist-only payload from persisted property data. `AIService` can use an OpenAI-compatible endpoint when configured and otherwise returns transparent deterministic demo copy. Both paths return the same validated `ExposeContent` shape. No location facts are inferred.

## Template boundary

`frontend/app/builder/[id]/expose-templates.ts` is the small Exposé template registry (Phase 11): `modern`, `classic`, and `elegant` — each an id, label, and pure-presentation React component. The templates consume the same normalized Exposé data (`expose-model.ts`), share the section bodies from `components/template-sections.tsx` (visibility, ordering, facts, pricing, energy, media, contact), and differ only in presentation: each ships its own stylesheet and cover. `modern` remains the default; unknown template values fall back to it.

The Builder preview, the review preview page (`/preview/[id]`), and the PDF print route (`/expose/print/[id]`) all resolve the template through this registry — there is never a separate template implementation for the PDF. Only print-specific CSS (A4 pagination, page breaks) differs. `POST /api/properties/:id/pdf` opens the print route in Playwright/Chromium, waits for `window.__EXPOSE_READY__`, and returns the A4 PDF. The legacy `expose-service/src/lib/expose-template.ts` HTML template remains only for the older `/preview/[id]` page.

## Mastra boundary

`expose-service/src/mastra/` contains the registered `property-expose-agent` and `create-expose-workflow`. The initial workflow only validates and prepares canonical property data. Research, image analysis, content generation, document building, and rendering remain future phases.

## Marketing content boundary

`expose-service/src/lib/marketing-content/` is the Phase 4 marketing-copy layer: `types.ts`, `schema.ts`, `prompt.ts`, `openai-provider.ts`, and `service.ts`. It turns the reviewed Property model, the current Listing state, and the user-provided "Ihre Angaben" into a professional German Exposé draft (`POST /api/properties/:id/marketing-content/generate`). The AI receives only the whitelist payload from `buildMarketingContentInput()`; raw OCR and raw Document AI responses never reach the prompt, and the model must not reinterpret documents. The structured output is enforced with Zod via `chat.completions.parse` + `zodResponseFormat`.

Marketing content is persisted as `Property.marketingContent`, fully separate from the factual property data: generation never mutates the Property model. Every field carries a provenance (`source: "ai" | "user"`); user edits survive ordinary page loads and property changes, and an explicit "Regenerate" action replaces only AI-generated fields, preserving user edits field-by-field. If the property contains no meaningful facts, generation returns 422 instead of inventing content; an empty location description is only returned as null.

## Phase 4 location boundary

`expose-service/src/external-services/location.ts` contains replaceable geocoding, places, and static-map provider contracts; `expose-service/src/external-services/routing.ts` contains the replaceable routing-provider contract (OSRM for walking, cycling, driving; no public-transport profile). `expose-service/src/lib/location-service.ts` owns address normalization, provider orchestration, Haversine distances, category selection, deterministic summaries, route attachment, and the cached `LocationIntelligence` payload. `expose-service/src/lib/travel-mode.ts` is the deterministic mode-selection rule set: walking up to 1.5 km, cycling up to 5 km, driving beyond; public transport is only kept when it beats driving by a meaningful margin and is never considered without provider support. No provider receives property descriptions, owner data, contact details, or financial data.

The default application has no active external location provider. Set `GEOCODING_PROVIDER=nominatim`, `PLACES_PROVIDER=overpass`, and `ROUTING_PROVIDER=osrm` explicitly to enable the opt-in OpenStreetMap integrations; otherwise location resolution reports that the provider is not configured. Provider errors are not converted into empty facility lists; a failing facility category is skipped with a warning and routing failures skip only the affected facility — the Exposé never shows invented distances or travel times. The current map provider is a coordinate-aware local SVG fallback, not a real external static-map service; it receives the property coordinate and the selected (routed) facility markers, and its background is schematic. `ResolveLocation` is a deterministic Mastra workflow boundary prepared for Phase 5, with no Tavily or web research.

## Job boundary

`expose-service` owns the minimal async job layer for decoupled background work. A job is a row in the shared PostgreSQL `Job` table (`expose-service/prisma/schema.prisma`, status `queued|processing|completed|failed`) plus a NATS event on `vista.jobs.<jobType>`. `POST /api/jobs` persists the job as `queued`, publishes the event, and returns the `jobId` immediately; `GET /api/jobs/:id` reads it back.

`job-processor/` is a standalone worker: it connects to NATS, subscribes to `vista.jobs.>`, parses each event (`src/jobs/event.ts`), dispatches to a handler by `jobType` (`src/jobs/dispatcher.ts`, handlers in `src/jobs/handlers/`), and writes status transitions to the same `Job` table. Only `test-job` is registered so far. Handlers report progress via a context `update()` and throw to signal failure; the consumer catches per-job errors, marks the job `failed`, and never crashes the worker (malformed events are dropped with a warning). There is intentionally no Redis, Kafka, Temporal, workflow engine, or retry infrastructure yet.

The `expose-service/.env` file is the Prisma CLI environment and is intentionally ignored by Git. Copy `.env.example` to `expose-service/.env` for the local PostgreSQL service from `docker-compose.yml`; CI must provide `DATABASE_URL` as a secret environment variable.
