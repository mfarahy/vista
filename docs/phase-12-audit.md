# Phase 12 — MVP Audit Report

Audit date: 2026-08-23 · Scope: complete MVP flow (documents → OCR → property model → wizard → review → marketing → Builder → templates → preview → PDF)

## Executive Summary

**Ready with minor fixes.**

The MVP is production-ready for its intended single-tenant, locally/self-hosted usage. The full fresh-property flow works end-to-end in a real browser with real OCR (Google Document AI) and real AI (OpenAI): 6-document upload → analysis → prefill → review → marketing generation → template switch → branding → save → reload → preview → print → A4 PDF, with all user-approved values present in the final PDF.

One P0 was found and fixed during the audit (an AI extraction value broke autosave, silently blocking the entire wizard flow for properties with "geplant" building status — it was reproduced live). All P1 issues found were fixed. The remaining P2 backlog is cosmetic or explicitly deferred per the MVP scope. Evidence for every claim is in this report; a 19-check real-browser regression script passed 19/19 after the fixes.

## P0 Issues

**P0-1 — AI value `buildingStatus: "planned"` broke autosave and blocked the whole flow (FIXED)**

- **Problem:** The document understanding produced `buildingStatus: "planned"` (the Lageplan states "geplantes eingeschossiges Wohnhaus"). The wizard wrote it verbatim into `exposeData.propertyDetails.buildingStatus`; the backend zod schema only accepts `new | existing` → every autosave PUT returned 400. Reproduced live: 6 repeated "Die Angaben konnten nicht gespeichert werden" alerts, server data stayed at the default state, and marketing generation failed with 422 "Fügen Sie … mehr Objektinformationen hinzu" because the server never received the wizard data. Any user edit since the last successful save was lost.
- **Cause:** Extraction prompt did not constrain the value set (prompt.ts), and the prefill boundary (`applyDocumentDefaults` in wizard-client.tsx) wrote AI strings verbatim into enum-typed persistence fields without validation.
- **Solution:** (1) Prompt now maps building status to exactly `new`/`existing` and returns null for "geplant/im Bau" (prompt.ts). (2) The prefill boundary now validates every enum-typed field (`buildingStatus`, `commissionPayer`) and only writes values the backend accepts. Defense in depth: backend still rejects invalid values (verified with a defensive PUT → 400).

## P1 Issues (all fixed)

| # | Issue | Fix |
|---|-------|-----|
| P1-1 | `primaryEnergySource` was wrongly derived as `other` from heating type "Zentralheizung" (substring "heizung" → "other"); the derived value then blocked the real AI value `gas` because `setEnergy` only fills empty fields. UI showed "Sonstige" with a false "Von Ihnen geändert" label. | `normalizeEnergySource` no longer maps "heizung" strings to `other` (wizard-steps.ts). Verified live: Energieträger now shows "Gas". |
| P1-2 | AI returned boolean `true` for the count field `guestToilets`; `Number(true)` → 1 produced a false "Von Ihnen geändert" provenance label. | Strict numeric coercion in the prefill boundary: booleans and non-numeric values are skipped (wizard-client.tsx `toFiniteNumber`). |
| P1-3 | Raw technical keys shown to users in "Zusätzliche Informationen" panels (`registryCourt`, `cadastralFlur`, `projectedBuildingDimensions`, `registrationNumber`, …) and in the document card expansion. | Extended `additionalInfoLabel()` with the camelCase keys the AI actually produces; the document card now uses the same label map (types.ts, documents-step.tsx). |
| P1-4 | English leftovers in used UI: "Energy efficiency class" / "Selected class: C" (EnergyClassPicker), "Property photo"/"Other" document badges, raw `buyer`/`seller` and `modernized` in the review, English note labels ("Features:", "Energy:", …). | Germanized: "Energieeffizienzklasse", "Ausgewählte Klasse: …", "Immobilienfoto"/"Sonstiges", commission-payer and renovation-status labels in review, German note labels. |
| P1-5 | Home page, create page and demo page were entirely English while the product is German; `<html lang="en">`. | Germanized all landing/create/demo copy; `lang="de"` + German metadata (layout.tsx). |
| P1-6 | Backend user-facing error messages were English ("Only JPG, PNG and WEBP are supported", "Not found", "Location could not be resolved", …) and were shown verbatim to users via `result.error` at several call sites; zod/AI internals could leak. | Germanized all user-facing route errors; frontend AI/upload call sites now show fixed German messages instead of raw `result.error`; malformed JSON bodies now return 400 instead of 500; multer limit violations return German 400s instead of generic 500s. |
| P1-7 | Horizontal overflow at 390px on the documents step: UUID-prefixed filenames forced document cards to ~780px because grid items lacked `min-w-0`. | `min-w-0` on the document card so the existing `truncate` works. Verified: no page-level overflow at 390px (Builder had none). |

## P2 Backlog (not implemented, per MVP scope)

1. **Authentication/authorization:** the API has no auth; `/uploads` serves raw uploaded documents without access control. Acceptable for the current single-tenant/local deployment; required before multi-user hosting. `GET /api/properties` lists all properties.
2. **Real data committed to git:** `expose-service/data/properties.json` (live store incl. real addresses) and `public/uploads/*.pdf` (real Grundbuchauszug/Kaufvertrag/Mietvertrag/Energieausweis documents) are tracked. Recommend `.gitignore` + migration to a real DB for production. Not changed during the audit (live store).
3. **JSON store:** non-atomic writes were hardened (temp file + rename), but the store remains a JSON file with `readDB` silently returning an empty DB on parse errors — acceptable for MVP; PostgreSQL/Prisma path exists.
4. **Duplicate uploads:** no deduplication; uploading the same document twice creates a second record. Verified non-corrupting (candidates/conflicts/sources stay intact); dedup is deliberately out of scope.
5. **Floorplan 3D PoC page** (`/floorplan`): English UI, editable AI prompts, raw fal.ai URL displayed. Experimental feature, not part of the MVP flow; keep as backlog.
6. **No exact AI confidence scores, no drag-and-drop editor, no full audit history** — accepted MVP limitations.
7. **Cover suggestion is never auto-selected** (correct behavior, verified) — nothing to change.
8. **Location research cache** is an unbounded in-memory Map with TTL; fine for MVP, should be bounded in long-running deployments.
9. **`PUT /images/:imageId` ignores the cover value** (any truthy value sets cover); cosmetic, low impact.
10. **Dead code:** legacy v1 `exposeContentSchema` validation on `PUT /expose` and the Mastra workflow/agent layer are not wired to routes; harmless, could be cleaned up later.
11. **DatePicker (English, dead code)** in wizard UI kit — unused; removed from consideration.
12. **ISO dates in wizard review rows** (Ausgestellt am / Gültig bis) — the found-info panel and builder energy facts now format German dates; the review step rows still show ISO. Cosmetic.

## Fixes Implemented

| Problem | Cause | Solution |
|---------|-------|----------|
| Autosave 400 on `buildingStatus: "planned"`; wizard flow blocked, server data stale, marketing blocked (P0). | Unconstrained AI enum output + unvalidated prefill boundary. | Prompt constraint (prompt.ts) + enum validation in `applyDocumentDefaults` (wizard-client.tsx). |
| "Sonstige" instead of "Gas" + false "Von Ihnen geändert" (P1). | `normalizeEnergySource` substring "heizung" → "other"; derived value blocked the real AI value. | Removed the "heizung" → "other" branch; added regression tests. |
| Boolean `guestToilets` coerced to 1 → false provenance label (P1). | `Number(boolean)` coercion in prefill. | Strict numeric coercion helper in prefill boundary. |
| Raw technical keys / English labels in UI (P1). | Label map incomplete; two panels diverged; enum values rendered raw. | Extended `additionalInfoLabel`, unified usage, German enums in review, German EnergyClassPicker, German doc-type labels. |
| English product pages and `<html lang="en">` (P1). | Copy written in English during early phases. | Full German copy on home/create/demo; `lang="de"`. |
| English API errors + raw error leakage to users (P1). | English route messages; several call sites displayed `result.error` verbatim. | German route messages; fixed German frontend messages; 400 for malformed JSON; German multer-limit errors. |
| Horizontal overflow at 390px in documents step (P1). | Grid items `min-width: auto` + unbreakable filenames. | `min-w-0` on document cards. |
| Torn-write risk in JSON store (hardening). | Non-atomic `fs.writeFile`. | Atomic write via temp file + rename (store.ts). |
| Unbounded multipart memory buffering (hardening). | multer without limits. | `limits: { fileSize: 25 MB, files: 20, fieldSize: 1 MB }` + German MulterError mapping. |
| ISO dates in builder energy facts / found-info (P2). | Raw persisted dates rendered. | German date formatting helper + tests. |

## Security

- **File access:** document reads use `path.basename(document.url)` and UUID-prefixed sanitized filenames — no traversal found. Uploads live under `/uploads` (static, unauthenticated — see backlog).
- **Property isolation:** every document route checks `document.propertyId === property.id` (404 otherwise). No cross-property access found on document/image/configuration routes. No authentication exists (single-tenant scope); do not rely on frontend routing if hosting multi-user.
- **URL safety:** branding logo URLs pass through `safeImageUrl` (rejects `javascript:`/`data:`); verified by tests ("rejects unsafe logo urls"). PDF print URL is constructed from the property id only, encoded as a single segment; tests prove external URLs cannot slip in.
- **XSS:** zero `dangerouslySetInnerHTML` in the frontend; all AI/user content renders as escaped React text. Test coverage exists ("escapes malicious user content" per template, "never renders as raw HTML").
- **Prompt injection:** OCR text enters only the **user** message; system prompts are fixed constants; output is constrained by structured schemas (zod) with controlled vocabularies for document type/tags/wizard fields/photo tags. No dynamic content reaches the system role. The remaining free-text fields (`summary`, `additionalInformation`) are persisted as JSON and rendered escaped — no vulnerability found.
- **Credential exposure:** logger redacts authorization/apiKey/token/secret/private_key/credentials paths; request logs omit bodies; no credentials logged in audit runs.

## Performance (actual measurements)

| Operation | Measurement |
|-----------|-------------|
| Initial application load (home) | 200 ms RTT class (static Next.js); no measurable issue |
| Wizard navigation | Instant (client-side state), verified live |
| 6-document upload + analysis (real Google Document AI + OpenAI, concurrency 3) | ~2.5–3 min end-to-end incl. OCR + AI per document; bounded concurrency preserved |
| Marketing generation (real OpenAI) | 5.5 s (measured) |
| PDF generation (Playwright/Chromium, A4) | modern 2.2 s · classic 1.3 s · elegant 1.4 s (measured) |
| Builder load / template switching | Instant client-side |

No performance issues materially affecting MVP UX were found. Document concurrency stays bounded by `DOCUMENT_ANALYSIS_CONCURRENCY` (default 3); no queues/workers introduced.

## UX

- **German wording:** all user-facing strings audited; remaining English found on the floorplan PoC page only (backlog). Wizard, builder, review, documents, marketing, empty/loading/error states are German and consistent.
- **Loading states:** "6 Dokumente werden analysiert…", "Ihr Exposé wird vorbereitet…", "Wird analysiert…", "PDF wird erstellt" (toast with filename) — verified live.
- **Errors:** German, no stack traces, data preserved, retry supported (document re-analysis, marketing regeneration). Malformed JSON/multer limits now produce German 400s.
- **Empty states:** no documents / no photos / no marketing content / no location data / no agent all render useful German guidance — verified.
- **Responsive:** 390px wizard overflow fixed; builder verified clean at 390px and 1280px. No other real issues found.

## PDF

- **Templates tested:** Modern, Classic, Elegant — all render A4 PDFs (6–7 pages) with correct structure, German characters, no blank pages, no broken/distorted images.
- **Scenarios tested:** House/Sale (fresh wizard flow), Apartment/Sale (demo), plus smoke test for all templates; rental path covered by unit tests (rental pricing, never sale wording).
- **Hidden sections stay hidden** (verified: hiding Grundrisse removed the section from Builder, Preview, Print and PDF).
- **Preview/Print consistency:** Builder live preview, `/preview/[id]`, `/expose/print/[id]` and the PDF share one template/data path (`ExposeDocument`); verified identical section order, content and branding in the browser. Only print-specific CSS differs.

## Verification

| Check | Result |
|-------|--------|
| Backend tests (`npm test`) | 235/235 pass |
| Backend lint (`npm run lint`) | 0 errors (13 pre-existing warnings in tests) |
| Backend build (`npm run build`) | passes |
| Frontend tests (`npm test`) | 149/149 pass |
| Frontend typecheck (`npx tsc --noEmit`) | passes |
| Frontend lint (`npm run lint`) | clean |
| Frontend build (`npm run build`) | passes |
| PDF smoke (`npm run pdf:smoke`) | all 3 templates, A4, pass |
| Real-browser fresh-property flow (Playwright, 19 checks) | 19/19 pass (upload 6 docs → analyze → prefill → edit → marketing → edit content → Classic → save → reload → preview → print → PDF) |

## Known residual risks (not blocking MVP)

- The wizard saves on every step transition; a browser crash between saves still loses the current step's edits (same as before; autosave retry on failure is now effective because the 400 cause is gone).
- AI extraction quality depends on the live models; the controlled vocabularies and prefill-boundary validation now make invalid outputs harmless instead of fatal.