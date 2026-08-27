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
- `agent-bridge/`: minimal local HTTP bridge that lets an external client (e.g. an AI supervisor) drive an OpenCode session programmatically. See [OpenCode Agent Bridge](#opencode-agent-bridge)
- `deploy/frontend/`, `deploy/expose-service/`, and `deploy/job-processor/`: Kubernetes manifests
- `deploy/helm/vista-expose-service/` and `deploy/helm/vista-job-processor/`: Helm charts
- `geometry-ai/`: Phase 2 feasibility harness for AI floor-plan geometry extraction (local Python inference service + evaluation). See `docs/geometry-ai-evaluation.md`.

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
- `DOCUMENT_STORAGE_PROVIDER`: document file storage; `local` (default, files on disk under `UPLOAD_DIR`) or `r2` (Cloudflare R2 / S3-compatible bucket via the `CLOUDFLARE_*` variables)
- `NATS_URL`: NATS server URL for publishing/consuming jobs (default `nats://localhost:4222`)
- `NATS_SUBJECT_PREFIX`: NATS subject prefix; jobs are published to `<prefix>.<jobType>` and consumed via the `<prefix>.>` wildcard (default `vista.jobs`)
- `NATS_PROGRESS_SUBJECT_PREFIX`: NATS subject prefix for job progress events (`<prefix>.<jobId>`), published by `job-processor` and consumed by expose-service to feed SSE (default `vista.progress`)
- `MAP_ATTRIBUTION`: attribution for the local map fallback
- `FRONTEND_URL`: base URL of the Next.js app that hosts the PDF print route, default `http://localhost:3000`
- `BORIS_BASE_URL`: optional Brandenburg BORIS OGC API endpoint for Bodenrichtwert enrichment (default `https://ogc-api.geobasis-bb.de/boris`)
- `GEOMETRY_AI_SERVICE_URL`: base URL of the local geometry-ai inference service used by the `/geometry` playground's AI provider (default `http://127.0.0.1:8787`)

The OpenStreetMap adapters use Nominatim for geocoding and Overpass for supermarkets, kindergartens, schools, public transit, pharmacies, parks, and restaurants/cafés. They are active only when the providers are explicitly configured. Verified distances and travel times for the Exposé's Nearby Amenities section come from the OSRM routing endpoints (`ROUTING_PROVIDER=osrm`, walking/cycling/driving); without a routing provider, facilities are collected but never presented with distances or travel times. There is currently no external static map provider: the local, coordinate-aware SVG fallback is exposed for development and testing and must not be considered a real map-service integration.

## Jobs

The system has async job infrastructure built on NATS and PostgreSQL:

- `POST /api/jobs` with `{ "type": "test-job", "payload": {...}, "metadata": {...} }` creates a `jobId`, persists the job as `queued`, publishes a job event to NATS (`vista.jobs.test-job`), and returns the `jobId` immediately.
- `GET /api/jobs/:id` returns the persisted job record (status, progress, currentStep, message, error).
- `GET /api/jobs/:id/events` opens a Server-Sent Events stream for a job. It sends the current job state on connect, then forwards live updates (jobId, status, progress, currentStep, message, updatedAt, error) until the job reaches a terminal state (or the client disconnects). A job that already completed/failed returns its final state and closes immediately.
- `job-processor/` subscribes to `vista.jobs.>`, dispatches each job to a handler by `jobType`, and advances the persisted status `queued → processing → completed|failed`. A failing job is marked `failed` and logged without crashing the worker. Implemented handlers: `test-job` (example) and `document-processing`.

Progress flows `job-processor → NATS → expose-service → SSE → frontend`: whenever the processor advances a job it persists the state and publishes a progress event to `vista.progress.<jobId>`. expose-service holds a single wildcard subscription that fans the events out to the in-memory SSE clients subscribed to that `jobId` (an MVP in-process registry, no Redis). The frontend uses the browser `EventSource` (SSE) to render a live progress bar, current step, and status/message without polling.

Document processing is fully asynchronous: `POST /api/properties/:id/documents` (and the per-document analyze endpoint) now persist the uploaded files and the document records, enqueue a `document-processing` job (persisted as `queued`, published to `vista.jobs.document-processing`), and return the `jobId` immediately instead of analyzing inline. `job-processor` consumes the event, runs the existing OCR → understanding pipeline per document (reporting progress via `currentStep`/`message`), and finally marks the job `completed` (success) or `failed`. A single failing document is contained and logged; the job still completes unless every document failed.

Document file bytes live behind a swappable storage abstraction (`expose-service/src/lib/document-storage.ts`): `DOCUMENT_STORAGE_PROVIDER=local` (default, dev/tests) stores files on disk under `UPLOAD_DIR`, while `DOCUMENT_STORAGE_PROVIDER=r2` stores them in Cloudflare R2 / any S3-compatible bucket (see `CLOUDFLARE_*` variables in `expose-service/.env.example`). expose-service uploads the bytes on `POST /api/properties/:id/documents` and serves them back via `GET /api/documents/:id/file`; it never reads them for processing. `job-processor` downloads the bytes directly from the same storage (R2) and runs the OCR → understanding pipeline locally, writing the results back to the shared `Document` table. There is no HTTP call from the worker to expose-service.

The (shared) `Job` and `Document` models live in `expose-service/prisma/schema.prisma`; both expose-service and job-processor persist to the same PostgreSQL tables. NATS and PostgreSQL run via `docker-compose.yml` locally, and in production they are deployed from the separate Helm charts `deploy/helm/vista-nats` (NATS broker + `nats-surveyor` Prometheus observer, reachable at `nats:4222` / `nats-surveyor:7777`) and `deploy/helm/vista-postgres`. In the `vista` namespace both expose-service and job-processor point at `nats://nats:4222`, expose-service stores document bytes in R2 (`DOCUMENT_STORAGE_PROVIDER=r2`), and job-processor reads them from the same R2 bucket to run the pipeline.

## OpenCode Agent Bridge

`agent-bridge/` is a minimal local HTTP bridge that exposes an OpenCode session
to external clients (e.g. a ChatGPT-based supervisor for this project) without
touching the OpenCode CLI directly. It talks to the official OpenCode HTTP API
via the official `@opencode-ai/sdk` (version-matched to the installed CLI) and
only supports the MVP flow: create/reuse a session, send a prompt, wait for the
agent response, and report session status. No auth, database, or queues.

### 1. Start OpenCode in server mode

Run the OpenCode server in the directory the agent should work in (the bridge
reuses the server's project directory):

```bash
# in the project root (D:\repo\vista)
opencode serve --port 4096
```

This starts a headless server on `http://127.0.0.1:4096`. Verify it with
`curl http://127.0.0.1:4096/global/health`.

### 2. Start the bridge

```bash
cd agent-bridge
npm install
cp .env.example .env
npm run dev        # or: npm run build && npm start
```

Configuration (see `agent-bridge/.env.example`):

- `OPENCODE_URL`: OpenCode server URL, default `http://127.0.0.1:4096`
- `OPENCODE_TIMEOUT_MS`: max time to wait for an agent response, default `600000`
- `PORT` / `HOST`: bridge HTTP server, default `4200` / `0.0.0.0`

### 3. Create a session

```bash
curl -X POST http://localhost:4200/session \
  -H "content-type: application/json" \
  -d '{"title":"Vista review"}'
```

Returns `201` with `{ "sessionId": "...", "title": "...", "createdAt": ... }`.
Keep the `sessionId` and reuse it for subsequent prompts.

### 4. Send a prompt

```bash
curl -X POST http://localhost:4200/prompt \
  -H "content-type: application/json" \
  -d '{"sessionId":"<sessionId>","prompt":"Inspect this repository and report the project structure."}'
```

The bridge blocks until the agent finishes and returns `200` with
`{ "sessionId", "status": "completed", "messageId", "response", "tokens", "cost" }`.

### 5. Check session status

```bash
curl http://localhost:4200/session/<sessionId>
```

Returns basic session information and the OpenCode status
(`idle` | `busy` | `retry`).

### Error handling

The bridge maps failures to clear HTTP status codes: `400` malformed requests,
`404` unknown session, `503` OpenCode server unreachable, `504` prompt timeout,
`502` OpenCode API/agent errors. `GET /health` reports bridge liveness.

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
# expose-service: NATS publishing + Prisma job status persistence + NATS → SSE delivery
cd expose-service && RUN_JOB_INTEGRATION=1 NATS_URL=nats://localhost:4222 npm test
# job-processor: consumption, dispatching, success/failure execution, status persistence
cd job-processor && RUN_JOB_INTEGRATION=1 NATS_URL=nats://localhost:4222 npm test
```

The SSE endpoint itself is covered by deterministic unit tests (`src/routes/jobs-sse.test.ts`): initial state, live progress events, completed/failed close behavior, and already-terminal jobs.

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
