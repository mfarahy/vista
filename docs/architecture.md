# Raumwerk Exposé: Phase 1 Architecture

## Shape

The `frontend/` package is the only Next.js application. The `expose-service/` Express/Mastra service owns the REST API, persistence boundary, AI services, location services, uploads, and PDF renderer. The frontend calls that service through `frontend/lib/api.ts`.

`expose-service/src/lib/types.ts` contains the legacy and canonical wire contracts. `expose-service/src/lib/expose-data.ts` is the typed Phase 1 source-of-truth model, including energy, structured address/location, rooms, equipment, image semantics, agent data, and separate Vista branding. `expose-service/src/lib/store.ts` is a local-file repository for immediate demo mode; `prisma/schema.prisma` is the PostgreSQL source of truth for production persistence. Images use a local filesystem asset store while their semantic metadata is persisted with the property.

## Routes

- `/` dashboard and demo entry point
- `/create` creates a draft
- `/create/[id]` wizard, review, AI editor
- `/preview/[id]` HTML exposé preview and PDF actions

## API contracts

- `POST /api/properties` creates a draft
- `GET|PUT /api/properties/:id` reads or updates structured property data
- `POST /api/properties/:id/images` accepts multipart images
- `DELETE /api/properties/:id/images/:imageId` removes an image
- `PUT /api/properties/:id/images/reorder` accepts `{ imageIds: string[] }`
- `POST /api/properties/:id/ai/improve` accepts `{ action?: string }` and returns `ExposeContent`
- `GET|PUT /api/properties/:id/expose` reads or updates generated content
- `POST /api/properties/:id/pdf` renders the same template through Playwright

Image uploads require `category` (`exterior`, `interior`, `floor_plan`, or `document`) and may include `subcategory` and `caption`. Existing records are normalized with optional canonical data on load.

## AI boundary

`buildAIInput()` creates a whitelist-only payload from persisted property data. `AIService` can use an OpenAI-compatible endpoint when configured and otherwise returns transparent deterministic demo copy. Both paths return the same validated `ExposeContent` shape. No location facts are inferred.

## Template boundary

`expose-service/src/lib/expose-template.ts` is the printable HTML template. The Playwright PDF endpoint consumes it. Gallery layout is selected from the image count, with no empty placeholder cells.

## Mastra boundary

`expose-service/src/mastra/` contains the registered `property-expose-agent` and `create-expose-workflow`. The initial workflow only validates and prepares canonical property data. Research, image analysis, content generation, document building, and rendering remain future phases.

## Phase 4 location boundary

`expose-service/src/external-services/location.ts` contains replaceable geocoding, places, and static-map provider contracts. `expose-service/src/lib/location-service.ts` owns address normalization, provider orchestration, Haversine distances, category selection, deterministic summaries, and the cached `LocationIntelligence` payload. No provider receives property descriptions, owner data, contact details, or financial data.

The default application has no active external location provider. Set `GEOCODING_PROVIDER=nominatim` and `PLACES_PROVIDER=overpass` explicitly to enable the opt-in OpenStreetMap integrations; otherwise location resolution reports that the provider is not configured. Provider errors are not converted into empty facility lists. The current map provider is a coordinate-aware local SVG fallback, not a real external static-map service; it receives the property coordinate and generated facility markers, but its roads/background are synthetic. `ResolveLocation` is a deterministic Mastra workflow boundary prepared for Phase 5, with no Tavily or web research.

The root `.env` is the Prisma CLI environment and is intentionally ignored by Git. Copy `.env.example` to `.env` for the local PostgreSQL service from `docker-compose.yml`; CI must provide `DATABASE_URL` as a secret environment variable. The separate `expose-service/.env` is not read by the root Prisma CLI.
