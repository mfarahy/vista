# Raumwerk Property Exposé Generator

Phase 1 MVP for high-quality real estate exposés in German. The local demo mode works without external services: properties are stored in `expose-service/data/properties.json`, uploads are stored under `expose-service/public/uploads/`, and the AI returns a transparent demo draft without `OPENAI_API_KEY`. The frontend and service can be deployed separately from `frontend/` and `expose-service/`. PostgreSQL/Prisma is included as the target production data model.

## Getting Started

```bash
npm install
cp .env.example .env
npm run dev
```

Then open `http://localhost:3000` and select **New Exposé**.

## Project Structure

- `frontend/`: separately deployable Next.js web client for `expose-service/`
- `expose-service/`: separately deployable Express/Mastra service
- `expose-service/prisma/`: PostgreSQL schema, migrations, and seed for production persistence
- `job-processor/`: standalone async job worker that consumes jobs from NATS and persists status to PostgreSQL
- `deploy/frontend/`, `deploy/expose-service/`, and `deploy/job-processor/`: Kubernetes manifests
- `deploy/helm/vista-expose-service/` and `deploy/helm/vista-job-processor/`: Helm charts

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection for Prisma
- `OPENAI_API_KEY`: optional OpenAI-compatible API key; the demo generator runs without a key
- `OPENAI_BASE_URL`: optional compatible endpoint
- `OPENAI_MODEL`: model name, default `gpt-4o-mini`
- `NEXT_PUBLIC_APP_URL`: public app URL
- `GEOCODING_PROVIDER`: optional `nominatim`; leave empty when no geocoder is enabled
- `GEOCODING_BASE_URL`: optional Nominatim endpoint
- `GEOCODING_USER_AGENT`: user agent for Nominatim
- `PLACES_PROVIDER`: optional `overpass` for structured POI searches
- `PLACES_BASE_URL`: optional Overpass endpoint
- `PLACES_USER_AGENT`: user agent for Overpass
- `ROUTING_PROVIDER`: optional `osrm` for verified distances and travel times of nearby facilities (foot/bike/car; no public transport)
- `ROUTING_FOOT_BASE_URL`: optional OSRM walking endpoint
- `ROUTING_BIKE_BASE_URL`: optional OSRM cycling endpoint
- `ROUTING_CAR_BASE_URL`: optional OSRM driving endpoint
- `LOCATION_SEARCH_RADIUS_METERS`: search radius, default `1000`
- `LOCATION_FACILITY_CATEGORIES`: comma-separated POI categories
- `DOCUMENT_ANALYSIS_CONCURRENCY`: maximum parallel document analyses per upload batch, default `3`
- `NATS_URL`: NATS server URL for publishing/consuming jobs (default `nats://localhost:4222`)
- `NATS_SUBJECT_PREFIX`: NATS subject prefix; jobs are published to `<prefix>.<jobType>` and consumed via the `<prefix>.>` wildcard (default `vista.jobs`)
- `MAP_ATTRIBUTION`: attribution for the local map fallback
- `FRONTEND_URL`: base URL of the Next.js app that hosts the PDF print route, default `http://localhost:3000`
- `BORIS_BASE_URL`: optional Brandenburg BORIS OGC API endpoint for Bodenrichtwert enrichment (default `https://ogc-api.geobasis-bb.de/boris`)

The OpenStreetMap adapters use Nominatim for geocoding and Overpass for supermarkets, kindergartens, schools, public transit, pharmacies, parks, and restaurants/cafés. They are active only when the providers are explicitly configured. Verified distances and travel times for the Exposé's Nearby Amenities section come from the OSRM routing endpoints (`ROUTING_PROVIDER=osrm`, walking/cycling/driving); without a routing provider, facilities are collected but never presented with distances or travel times. There is currently no external static map provider: the local, coordinate-aware SVG fallback is exposed for development and testing and must not be considered a real map-service integration.

## Jobs

The system has minimal async job infrastructure built on NATS and PostgreSQL:

- `POST /api/jobs` with `{ "type": "test-job", "payload": {...}, "metadata": {...} }` creates a `jobId`, persists the job as `queued`, publishes a job event to NATS (`vista.jobs.test-job`), and returns the `jobId` immediately.
- `GET /api/jobs/:id` returns the persisted job record (status, progress, currentStep, message, error).
- `job-processor/` subscribes to `vista.jobs.>`, dispatches each job to a handler by `jobType`, and advances the persisted status `queued → processing → completed|failed`. A failing job is marked `failed` and logged without crashing the worker. Only `test-job` is implemented so far; `payload.fail` exercises the failure path.

The (shared) `Job` model and `JobStatus` (`queued`, `processing`, `completed`, `failed`) live in `expose-service/prisma/schema.prisma`; both expose-service and job-processor persist to the same PostgreSQL table. NATS and PostgreSQL run via `docker-compose.yml`.

## Tests

Unit tests are deterministic and require no infrastructure:

```bash
npm run test:unit
```

The live location integration test is separate and requires network access and enabled providers. It uses the address from the Prisma test seed and writes the PDF output only to `/tmp`:

```bash
RUN_LOCATION_INTEGRATION=1 GEOCODING_PROVIDER=nominatim PLACES_PROVIDER=overpass ROUTING_PROVIDER=osrm npm run test:integration
```

Without these variables, integration tests are skipped. No API keys are logged or committed.

Job integration tests (NATS publishing, job status persistence, consumer execution/failure) need a running NATS and PostgreSQL and are skipped unless enabled:

```bash
# expose-service: NATS publishing + Prisma job status persistence
cd expose-service && RUN_JOB_INTEGRATION=1 NATS_URL=nats://localhost:4222 npm test
# job-processor: consumption, dispatching, success/failure execution, status persistence
cd job-processor && RUN_JOB_INTEGRATION=1 NATS_URL=nats://localhost:4222 npm test
```

## PostgreSQL

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

The Express service is the central runtime for persistence, AI, location resolution, uploads, and PDF rendering. `expose-service/src/lib/store.ts` is the replaceable persistence boundary; the Prisma schema and seed are prepared for the migration to PostgreSQL.

## PDF

PDFs are generated on demand through `POST /api/properties/:id/pdf`. The backend opens the same React Exposé the Builder previews — the print route `/expose/print/:id` on the frontend renders `ModernExposeTemplate` with print-only CSS — and prints it to A4 via Playwright/Chromium. The frontend must be reachable from the expose-service; set `FRONTEND_URL` in `expose-service/.env` when the app is not on `http://localhost:3000`.

The Chromium binary must be available when a PDF is generated for the first time. If it is not installed:

```bash
npx playwright install chromium
```

A manual end-to-end smoke test (demo property → real PDF) requires both services running:

```bash
cd expose-service
npm run pdf:smoke
```

## Architecture

The rationale and the API, route, data, and AI contracts are documented in [`docs/architecture.md`](docs/architecture.md). AI receives only the whitelist payload from `buildAIInput()`, and the output is validated with Zod before it is saved.
