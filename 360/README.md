# Vista 360 Prototype

An isolated React prototype for the future Vista Virtual Tour system. It renders
a single equirectangular 360° panorama image in the browser using
[Pannellum](https://pannellum.org/).

> This is an intentional, isolated experiment. It lives completely inside the
> `360/` folder and does **not** touch or depend on the existing Vista
> application (`frontend/`, `backend/`, `deploy/`, …). No backend, database,
> authentication, or API is involved.

## What this prototype supports

- Loads one local equirectangular 360° panorama image
- Interactive panorama viewer, full-screen
  - drag to look around
  - zoom in / zoom out
  - mouse wheel zoom
  - touch (pinch to zoom, drag to look) on mobile browsers
- A minimal title overlay (`Vista 360 Prototype`)

Not included (by design): navigation between rooms, floor plans, hotspots,
measurements, 3D, uploads, authentication, backend.

## Panorama image

Located at `public/pano/rheingauer-dom.jpg` (3840x1920 equirectangular JPEG).
See `public/pano/ATTRIBUTION.md` for the license and source.

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

- `npm run build` – build for production (output in `dist/`)
- `npm run preview` – preview the production build locally
