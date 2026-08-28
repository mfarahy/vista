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
- `mcp-server/`: minimal stateless MCP server exposing the Agent Bridge as `vista_task`, `vista_screenshot`, and `vista_session` tools for an external supervisor. See [Vista MCP Supervisor Server](#vista-mcp-supervisor-server)
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
- `DOCUMENT_STORAGE_PROVIDER`: document file storage; `local` (default, files on disk under `UPLOAD_DIR`) or `r2` (Cloudflare R2 / S3-compatible bucket via the `CLOUDFLARE_*` variables)
- `NATS_URL`: NATS server URL for publishing/consuming jobs (default `nats://localhost:4222`)
- `NATS_SUBJECT_PREFIX`: NATS subject prefix; jobs are published to `<prefix>.<jobType>` and consumed via the `<prefix>.>` wildcard (default `vista.jobs`)
- `NATS_PROGRESS_SUBJECT_PREFIX`: NATS subject prefix for job progress events (`<prefix>.<jobId>`), published by `job-processor` and consumed by expose-service to feed SSE (default `vista.progress`)
- `MAP_ATTRIBUTION`: attribution for the local map fallback
- `FRONTEND_URL`: base URL of the Next.js app that hosts the PDF print route, default `http://localhost:3000`
- `BORIS_BASE_URL`: optional Brandenburg BORIS OGC API endpoint for Bodenrichtwert enrichment (default `https://ogc-api.geobasis-bb.de/boris`)

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
agent response, report session status, and — for visual verification — capture
a screenshot of the running Vista frontend with Playwright. No auth, database,
or queues.

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
- `VISTA_APP_URL`: base URL of the running Vista frontend, default
  `http://localhost:3000` (used by `POST /screenshot` as default target and as
  prefix for relative page paths)
- `SCREENSHOT_TIMEOUT_MS`: max time to wait for a page to load before
  screenshotting, default `60000`
- `SCREENSHOT_DIR`: directory where captured screenshots are stored, default
  `./data/screenshots` (relative to `agent-bridge/`)
- `SCREENSHOT_HEADLESS`: launch the screenshot browser headless,
  default `true`

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

### 6. Capture a screenshot (visual verification)

The bridge can capture a screenshot of the running Vista frontend with
Playwright (headless Chromium) so an external supervisor can verify that
agent-made changes actually render. It assumes the Vista app is already
running and never starts it itself.

Start the Vista frontend (if not running):

```bash
cd frontend
npm install
cp .env.example .env   # optional; defaults work for the demo
npm run dev            # serves http://localhost:3000
```

Request a screenshot:

```bash
curl -X POST http://localhost:4200/screenshot \
  -H "content-type: application/json" \
  -d '{"url":"/demo"}'
```

The request body is optional and supports:

- `url`: absolute URL or page path to capture (default: the `VISTA_APP_URL`
  root)
- `selector`: CSS selector of an element to capture instead of the whole page
- `fullPage`: `true` to capture the full scrollable page instead of the
  viewport (ignored when `selector` is set)

Returns `200` with a file reference (the PNG is written to disk, not
base64-encoded into the response):

```json
{
  "status": "ok",
  "format": "png",
  "path": "D:\\repo\\vista\\agent-bridge\\data\\screenshots\\vista-2026-08-27T09-15-00Z-1a2b3c.png",
  "url": "http://localhost:3000/demo",
  "width": 1440,
  "height": 900,
  "bytes": 182347
}
```

Screenshots are stored under `SCREENSHOT_DIR` (default
`agent-bridge/data/screenshots/`, git-ignored). Full flow with an OpenCode
edit: `POST /prompt` to change the app, then `POST /screenshot` against the
changed page, and read the returned `path` to inspect the result.

### 7. Retrieve a screenshot

Because `POST /screenshot` returns an absolute filesystem `path`, an external
caller should not treat that string as directly addressable. Instead it should
use the returned `filename` (a plain basename inside `SCREENSHOT_DIR`) with a
safe retrieval endpoint:

```bash
curl -o shot.png http://localhost:4200/screenshot/<filename>
```

`GET /screenshot/:filename` serves the PNG with `Content-Type: image/png` and
returns `404` when the file does not exist. Only files inside the configured
`SCREENSHOT_DIR` are reachable; path traversal (e.g. `..`, `%2F`, `%5C`) is
rejected — arbitrary filesystem files are never exposed.

### 8. Combined task (single call)

`POST /task` wraps session handling + prompt + optional screenshot into one
call, which is what an external supervisor drives. Request:

```json
{
  "prompt": "Inspect this repository and report the project structure.",
  "sessionId": "ses_...",                 // optional; a new session is created when omitted
  "screenshot": { "url": "/demo", "fullPage": false }  // optional
}
```

Behavior:

1. Creates a new OpenCode session when `sessionId` is omitted (otherwise it
   verifies and reuses the given session, preserving agent context).
2. Sends the prompt and blocks until the agent finishes.
3. If screenshot options are provided, captures the Vista app.
4. Returns a single structured response with the session, agent response,
   token/cost data, screenshot metadata (when requested), and duration.

```json
{
  "sessionId": "ses_...",
  "status": "completed",
  "messageId": "msg_...",
  "response": "Top-level structure of `/root/vista`: ...",
  "tokens": { "input": 186, "output": 205, "reasoning": 0 },
  "cost": 0.000234,
  "screenshot": {
    "filename": "vista-2026-08-27T09-14-00Z-4wupt4.png",
    "path": "/root/vista/agent-bridge/data/screenshots/vista-...png",
    "url": "http://localhost:3000/",
    "format": "png",
    "width": 1440,
    "height": 900,
    "bytes": 84835
  },
  "durationMs": 12740
}
```

### Intended supervisor workflow

The bridge is supervisor-ready: reuse the same `sessionId` across tasks so the
agent keeps its conversational context, and pair each task with a screenshot
retrieved by filename:

```
POST /task   { "prompt": "Inspect the current 3D renderer." }        → create session
POST /task   { "sessionId": "<id>", "prompt": "Fix the door geometry.",
               "screenshot": { "url": "/demo" } }                     → same session + visual check
GET  /screenshot/<filename>                                            → inspect the PNG
POST /task   { "sessionId": "<id>", "prompt": "Now fix the stairs." } → same session continues
```

A ChatGPT-based supervisor is a possible future consumer of this interface, but
it is **not** implemented in this repository yet — the bridge only exposes the
HTTP endpoints the supervisor would call.

### Error handling

The bridge maps failures to clear HTTP status codes: `400` malformed requests,
`404` unknown session, missing screenshot selector, or missing screenshot file,
`503` OpenCode server unreachable, `504` prompt timeout or screenshot page
timeout, `502` OpenCode API/agent errors or an unreachable screenshot target.
`GET /health` reports bridge liveness.

## Vista MCP Supervisor Server

`mcp-server/` is a minimal, stateless MCP server that exposes the existing
Agent Bridge as three tools for an external supervisor such as ChatGPT. It is a
thin adapter only: it talks to the Agent Bridge HTTP API (`/task`, `/screenshot`,
`/session/:id`) and never communicates with OpenCode or captures screenshots
itself. No database, no authentication, no OpenCode/screenshot logic of its own.

```
ChatGPT
 → MCP (Streamable HTTP)
 → Vista MCP Server (mcp-server/)
 → Vista Agent Bridge HTTP API (agent-bridge/)
 → OpenCode (opencode serve)
```

### 1. Start the Agent Bridge (and its dependencies)

The MCP server only needs the Agent Bridge running. Follow the
[OpenCode Agent Bridge](#opencode-agent-bridge) steps above — OpenCode server,
bridge — and optionally the Vista frontend for screenshots:

```bash
# terminal 1: opencode serve --port 4096
# terminal 2: cd agent-bridge && npm run dev     (http://127.0.0.1:4200)
# terminal 3: cd frontend && npm run dev         (http://localhost:3000, for screenshots)
```

### 2. Start the MCP server

```bash
cd mcp-server
npm install
cp .env.example .env
npm run dev        # or: npm run build && npm start
```

Configuration (see `mcp-server/.env.example`):

- `AGENT_BRIDGE_URL`: base URL of the running Agent Bridge, default
  `http://127.0.0.1:4200` — every tool call is forwarded to this server.
- `MCP_HOST`: MCP server bind address, default `127.0.0.1`
- `MCP_PORT`: MCP server port, default `4300`
- `LOG_LEVEL` / `LOG_FORMAT`: same semantics as the Agent Bridge

The MCP server uses the official `@modelcontextprotocol/sdk` with the
**Streamable HTTP** transport at `http://localhost:4300/mcp` (stateless:
one server instance per request, no sessions tracked).

### 3. The three tools

| Tool | Purpose | Key input | Output |
| --- | --- | --- | --- |
| `vista_task` | Send a task to OpenCode via the bridge `POST /task` | `prompt` (required), `sessionId` (optional), `screenshot` (optional) | session id, status, agent response, tokens/cost, screenshot metadata + retrieval URL |
| `vista_screenshot` | Capture the current Vista UI via the bridge `POST /screenshot` | `url`, `selector`, `fullPage` (all optional) | filename, retrieval URL, width, height, bytes, format |
| `vista_session` | Inspect an existing session via the bridge `GET /session/:id` | `sessionId` (required) | title, directory, status, timestamps |

`vista_task` with a `screenshot` block, or `vista_screenshot`, returns the
screenshot `filename` and a `retrievalUrl` pointing at the bridge's safe
`GET /screenshot/:filename` endpoint (the only way the MCP server ever exposes
screenshot bytes). Absolute filesystem paths are never returned.

### 4. Test the MCP server locally

Try it directly with any MCP-compatible client or test inspector. A quick
HTTP-only sanity check of the Streamable HTTP endpoint:

```bash
# initialize
curl -X POST http://localhost:4300/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}}}'

# list tools
curl -X POST http://localhost:4300/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-03-26' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# call vista_task
curl -X POST http://localhost:4300/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-03-26' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"vista_task","arguments":{"prompt":"Inspect this repository and report the project structure."}}}'
```

The unit suite covers the three tools (success, screenshot-in-task, session
lookup, screenshot capture, bridge unavailable, unknown session, malformed
input) and runs without any infrastructure:

```bash
cd mcp-server
npm test
```

### 5. How the MCP server connects to the Agent Bridge

Every tool forwards to the Agent Bridge over plain HTTP: `vista_task` →
`POST /task`, `vista_screenshot` → `POST /screenshot`, and `vista_session` →
`GET /session/:id`. When `vista_task` is called with a `screenshot` block, the
block is forwarded verbatim and the returned `retrievalUrl` is built from
`AGENT_BRIDGE_URL`. Bridge error bodies (`{ "error": "..." }`) are translated
into MCP tool errors with `isError: true`, preserving the bridge's status and
message. If the bridge is unreachable the tool reports a `503`
bridge-unavailable error.

### Connecting to ChatGPT

This repository contains only the **local** MCP server. Pointing ChatGPT (or
another remote MCP host) at it requires a supported remote MCP / tunnel setup
(e.g. an MCP-enabled tunnel that exposes the local `4300` port over HTTPS with
authentication). That is a separate integration step and is **not** implemented
or claimed here.

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

The bridge's real-browser screenshot test (`agent-bridge/src/screenshot.e2e.ts`)
is isolated from the fast unit suite because it launches Chromium. It serves a
local page, captures it through `POST /screenshot`, and verifies a valid PNG:

```bash
cd agent-bridge
npm test            # fast unit tests (fake screenshot service)
npm run test:e2e    # real headless Chromium (requires `npx playwright install chromium`)
```

The MCP server's unit suite covers `vista_task`, `vista_screenshot`, and
`vista_session` (success, screenshot-in-task, session lookup, bridge errors,
malformed input) with no infrastructure required:

```bash
cd mcp-server
npm test
```

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
