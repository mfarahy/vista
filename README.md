# Raumwerk Exposé Generator

Phase 1 MVP für hochwertige Immobilien-Exposés auf Deutsch. Der lokale Demo-Modus funktioniert ohne externe Dienste: Eigenschaften werden in `data/properties.json` gespeichert, Uploads liegen unter `public/uploads/`, und die KI liefert ohne `OPENAI_API_KEY` einen transparenten Demo-Entwurf. Der kanonische Vertrag liegt in `src/lib/expose-data.ts`; der getrennte Backend-Dienst enthält die Mastra-Grundlage. Für Produktion ist PostgreSQL/Prisma als Zielmodell enthalten.

## Starten

```bash
npm install
cp .env.example .env
npm run dev
```

Danach `http://localhost:3000` öffnen und **Neues Exposé** wählen.

## Umgebungsvariablen

- `DATABASE_URL`: PostgreSQL-Verbindung für Prisma
- `OPENAI_API_KEY`: optionaler OpenAI-kompatibler API-Key; ohne Key läuft der Demo-Generator
- `OPENAI_BASE_URL`: optionaler kompatibler Endpoint
- `OPENAI_MODEL`: Modellname, Standard `gpt-4o-mini`
- `NEXT_PUBLIC_APP_URL`: öffentliche App-URL
- `GEOCODING_PROVIDER`: optional `nominatim`; bleibt leer, wenn kein Geocoder aktiviert ist
- `GEOCODING_API_KEY`: reserviert für austauschbare Provider, niemals hard-coden
- `PLACES_PROVIDER`: optional `overpass` für strukturierte POI-Suche
- `LOCATION_SEARCH_RADIUS_METERS`: Suchradius, Standard `1000`

## PostgreSQL

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Die aktuelle MVP-Oberfläche nutzt absichtlich den lokalen Repository-Adapter, damit sie direkt nach `npm run dev` testbar ist. `src/lib/store.ts` ist die austauschbare Persistenzgrenze; Prisma-Schema und Seed sind für den Wechsel auf PostgreSQL vorbereitet.

## PDF

PDFs werden aus dem gleichen HTML/CSS-Template wie die Vorschau über Playwright/Chromium gerendert. Beim ersten PDF-Aufruf muss die Chromium-Binary verfügbar sein. Falls sie nicht installiert ist:

```bash
npx playwright install chromium
```

## Architektur

Die Entscheidungsgrundlage sowie die API-, Routen-, Daten- und AI-Verträge stehen in [`docs/architecture.md`](docs/architecture.md). AI erhält ausschließlich den Whitelist-Payload aus `buildAIInput()`, und die Ausgabe wird vor dem Speichern mit Zod validiert.
