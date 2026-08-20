# Raumwerk Exposé Generator

Phase 1 MVP für hochwertige Immobilien-Exposés auf Deutsch. Der lokale Demo-Modus funktioniert ohne externe Dienste: Eigenschaften werden in `expose-service/data/properties.json` gespeichert, Uploads liegen unter `expose-service/public/uploads/`, und die KI liefert ohne `OPENAI_API_KEY` einen transparenten Demo-Entwurf. Die getrennte Bereitstellung liegt in `frontend/` und `expose-service/`. Für Produktion ist PostgreSQL/Prisma als Zielmodell enthalten.

## Starten

```bash
npm install
cp .env.example .env
npm run dev
```

Danach `http://localhost:3000` öffnen und **Neues Exposé** wählen.

## Projektstruktur

- `frontend/`: separat deploybarer Next.js-Webclient für `expose-service/`
- `expose-service/`: separat deploybarer Express/Mastra-Dienst
- `prisma/`: PostgreSQL-Schema und Seed für die Produktionspersistenz
- `deploy/frontend/` und `deploy/expose-service/`: Kubernetes-Manifeste

## Umgebungsvariablen

- `DATABASE_URL`: PostgreSQL-Verbindung für Prisma
- `OPENAI_API_KEY`: optionaler OpenAI-kompatibler API-Key; ohne Key läuft der Demo-Generator
- `OPENAI_BASE_URL`: optionaler kompatibler Endpoint
- `OPENAI_MODEL`: Modellname, Standard `gpt-4o-mini`
- `NEXT_PUBLIC_APP_URL`: öffentliche App-URL
- `GEOCODING_PROVIDER`: optional `nominatim`; bleibt leer, wenn kein Geocoder aktiviert ist
- `GEOCODING_BASE_URL`: optionaler Nominatim-Endpunkt
- `GEOCODING_USER_AGENT`: User-Agent für Nominatim
- `PLACES_PROVIDER`: optional `overpass` für strukturierte POI-Suche
- `PLACES_BASE_URL`: optionaler Overpass-Endpunkt
- `PLACES_USER_AGENT`: User-Agent für Overpass
- `LOCATION_SEARCH_RADIUS_METERS`: Suchradius, Standard `1000`
- `LOCATION_FACILITY_CATEGORIES`: durch Komma getrennte POI-Kategorien
- `MAP_ATTRIBUTION`: Attribution für den lokalen Kartenfallback

Die OpenStreetMap-Adapter verwenden Nominatim für Geocoding und Overpass für Supermärkte, Kindergärten, Schulen, ÖPNV, Apotheken, Parks sowie Restaurants/Cafés. Sie sind nur aktiv, wenn die Provider explizit gesetzt sind. Es gibt aktuell keinen externen Static-Map-Provider: Der lokale, koordinatenabhängige SVG-Fallback ist für Entwicklung und Tests sichtbar als Fallback und darf nicht als echte Kartendienstintegration bewertet werden.

## Tests

Unit-Tests sind deterministisch und benötigen keine Infrastruktur:

```bash
npm run test:unit
```

Der reale Location-Integrationstest ist getrennt und benötigt Netzwerkzugriff sowie aktivierte Provider. Er nutzt die Adresse aus dem Prisma-Test-Seed und schreibt die PDF-Ausgabe nur nach `/tmp`:

```bash
RUN_LOCATION_INTEGRATION=1 GEOCODING_PROVIDER=nominatim PLACES_PROVIDER=overpass npm run test:integration
```

Ohne diese Variablen werden Integrationstests übersprungen. Keine API-Schlüssel werden geloggt oder committed.

## PostgreSQL

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Der Express-Dienst ist die zentrale Laufzeit für Persistenz, AI, Standortauflösung, Uploads und PDF-Rendering. `expose-service/src/lib/store.ts` ist die austauschbare Persistenzgrenze; Prisma-Schema und Seed sind für den Wechsel auf PostgreSQL vorbereitet.

## PDF

PDFs werden aus dem gleichen HTML/CSS-Template wie die Vorschau über Playwright/Chromium gerendert. Beim ersten PDF-Aufruf muss die Chromium-Binary verfügbar sein. Falls sie nicht installiert ist:

```bash
npx playwright install chromium
```

## Architektur

Die Entscheidungsgrundlage sowie die API-, Routen-, Daten- und AI-Verträge stehen in [`docs/architecture.md`](docs/architecture.md). AI erhält ausschließlich den Whitelist-Payload aus `buildAIInput()`, und die Ausgabe wird vor dem Speichern mit Zod validiert.
