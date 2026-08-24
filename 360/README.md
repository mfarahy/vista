# Vista 360 Prototype

An isolated React prototype for the future Vista Virtual Tour system. It
renders equirectangular 360° panoramas in the browser using
[Pannellum](https://pannellum.org/) and — since Phase 4 — lets you navigate
spatially between three sample panoramas via navigation arrows.

> This is an intentional, isolated experiment. It lives completely inside the
> `360/` folder and does **not** touch or depend on the existing Vista
> application (`frontend/`, `backend/`, `deploy/`, …). No backend, database,
> authentication, or API is involved. Everything is local and static.

## What this prototype supports

- **Three local sample panoramas** (equilateral triangle arrangement):
  - **Living Room** at `(0, 0)` — warm sand-colored room
  - **Kitchen** at `(10, 0)` — sage-green room
  - **Bedroom** at `(5, 8.66)` — dusty-blue room
- Each panorama has an identifier, a local image, a predefined position and a
  predefined orientation (see `src/panoramas.js` — a small in-memory data
  structure, deliberately no graph abstraction).
- **Spatial navigation arrows**: each panorama shows one arrow per outgoing
  link, positioned at the exact spatial direction of the target panorama.
  Clicking an arrow (`Living Room -> Kitchen`, ...) cross-fades to the target
  panorama; the arriving view keeps the current pitch/zoom and faces back
  toward the panorama the user came from, keeping the entry doorway in view.
- The arrows are locked to their spatial direction: they move correctly while
  the camera rotates and are hidden automatically when the direction is behind
  the camera.
- Spatial annotation prototype (Phase 3): one "Window" annotation with a
  view-dependent fade, living in the living room.
- Interactive panorama viewer, full-screen
  - drag to look around
  - zoom in / zoom out
  - mouse wheel zoom
  - touch (pinch to zoom, drag to look) on mobile browsers
- A minimal title overlay (`Vista 360 Prototype · <room>`)

Not included (by design): floor plans, 3D buildings, measurements, uploads,
authentication, backend, database, API.

## How it works

- `src/panoramas.js` — the in-memory data: three panoramas (id, label, image,
  position, orientation, initial view) plus the links between them. Link
  yaws are derived from the positions, so arrows, painted doorways and arrival
  view directions always stay consistent.
- `src/spatialNavigation.js` — turns the data into Pannellum scene
  configuration: one scene per panorama, one navigation-arrow hotspot per
  outgoing link, and the `navigateToPanorama()` logic (preserves pitch/zoom,
  faces back toward the source panorama, cross-fade via `sceneFadeDuration`).
- `src/spatialAnnotation.js` — the Phase 3 window annotation (fade loop),
  now idempotent so it survives scene re-loads.
- `scripts/generate-panoramas.mjs` — pure-Node (no dependencies) generator
  that paints the three sample equirectangular images (1920×960 PNG). Each
  image shows the room's letter, compass markers and one doorway per outgoing
  link, painted at exactly the navigation arrow's yaw. Regenerate with
  `npm run generate:panos`.

## Panorama images

Generated procedurally by `scripts/generate-panoramas.mjs`:

- `public/pano/living-room.png`
- `public/pano/kitchen.png`
- `public/pano/bedroom.png`

(Phase 1 used `public/pano/rheingauer-dom.jpg`; see
`public/pano/ATTRIBUTION.md` for its license.)

## Install dependencies

Requires Node.js (tested with v22).

```sh
cd 360
npm install
```

## Run the prototype

```sh
npm run dev
```

Then open the printed URL (default `http://localhost:5173`) in a desktop
browser.

Other scripts:

- `npm run generate:panos` – regenerate the three sample panorama images
- `npm run build` – build for production (output in `dist/`)
- `npm run preview` – preview the production build locally