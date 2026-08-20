# Raumwerk Exposé: Phase 1 Architecture

## Shape

The Next.js App Router is the web client and the initial REST host. Route handlers are deliberately thin: they validate input, call a repository/service, and return DTOs. The same service modules can move behind Fastify when authentication or multi-tenant deployment is introduced.

`src/lib/types.ts` contains the shared wire contracts. `src/lib/store.ts` is a local-file repository for immediate demo mode; `prisma/schema.prisma` is the PostgreSQL source of truth for production persistence. Images use a `StorageProvider`-shaped local filesystem implementation and are never stored in the database.

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

## AI boundary

`buildAIInput()` creates a whitelist-only payload from persisted property data. `AIService` can use an OpenAI-compatible endpoint when configured and otherwise returns transparent deterministic demo copy. Both paths return the same validated `ExposeContent` shape. No location facts are inferred.

## Template boundary

`src/lib/expose-template.ts` is the printable HTML template. The preview iframe/document and Playwright PDF both consume it. Gallery layout is selected from the image count, with no empty placeholder cells.
