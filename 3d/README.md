# Deterministic 2D Floor Plan to 3D Prototype

This isolated React, TypeScript, and Three.js research prototype demonstrates a deterministic pipeline:

```
FloorPlan2D -> Geometry Generator -> BuildingModel3D -> Three.js Renderer
```

It deliberately uses structured 2D geometry, not an image. AI, image recognition, OCR, image/PDF processing, and automatic floor-plan extraction are out of scope for this phase.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL reported by the command. Use drag to rotate, right-drag to pan, and the mouse wheel to zoom.

Run the focused deterministic geometry tests with:

```bash
npm test
```

## Input data

The predefined input is `src/floorPlan.ts`. It contains explicit walls, room polygons, doors, and windows. Every measurement is in meters.

```ts
{
  id: "divider",
  start: { x: 5, y: 0 },
  end: { x: 5, y: 6 },
  thickness: 0.15,
  height: 2.8,
  kind: "interior"
}
```

Doors and windows reference a wall by ID. `offset` and `width` are measured along that wall from its `start`; window openings also define `sillHeight` and `height`.

## Conversion and coordinates

`src/geometryGenerator.ts` is a pure conversion layer. It sorts openings by their offset and splits each wall into exact rectangular wall boxes around every opening. This produces a serializable `BuildingModel3D` composed of wall boxes, floor polygons, and opening metadata. There is no randomness, mutable global state, or rendering logic in that layer, so equivalent input produces equal geometry every time.

The canonical 2D plan uses a right-handed metric ground plane: `x` increases east and `y` increases north. In Three.js, plan `x` maps to world `x`, plan `y` maps to world `-z`, and height maps to world `y`. Floors sit at elevation `0 m`.

## Current limitations

- One predefined plan only; no editor or input import.
- Wall joins are intentionally simple overlapping boxes.
- Doors and windows are represented as empty openings, with no frames, doors, glass, materials, or textures.
- No furniture, backend, database, authentication, API, Vista integration, panoramas, or measurement overlay.

## Possible next steps

- Validate self-intersecting polygons and overlapping openings.
- Add explicit wall-joint rules and a file-based structured input format.
- Add a dimension overlay and more geometry regression tests.