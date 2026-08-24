# Deterministic 2D Floor Plan to 3D Prototype (Phase 2)

This isolated React, TypeScript, and Three.js prototype focuses on deterministic and geometrically correct architectural conversion:

```
FloorPlan2D -> Validation -> Deterministic Geometry Generator -> BuildingModel3D -> Three.js Renderer
```

The same `FloorPlan2D` input always produces the same `BuildingModel3D` output.

Out of scope for this phase: AI, OCR, computer vision, PDF/image parsing, furniture, realistic materials/textures, backend, API, auth, panoramas, and integration work.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

Run geometry tests:

```bash
npm test
```

## Geometry model

`src/floorPlan.ts` defines explicit metric architectural elements.

### Walls

- `id`
- `start: {x, y}`
- `end: {x, y}`
- `thickness` (m)
- `height` (m)
- `kind` (`exterior` or `interior`)

### Doors

- `id`
- `wallId` (host wall)
- `offset` (m along host wall from wall start)
- `width` (m)
- `height` (m)
- optional `openingDirection`

### Windows

- `id`
- `wallId` (host wall)
- `offset` (m along host wall)
- `width` (m)
- `height` (m)
- `sillHeight` (m)

Doors and windows are attached to a specific wall by ID, not as unrelated world-space rectangles.

## Deterministic wall and opening generation

`src/geometryGenerator.ts` performs pure deterministic conversion.

- Each wall line segment is converted to 3D wall boxes preserving exact length, thickness, height, position, and orientation.
- Openings are sorted deterministically along each wall.
- The wall is segmented into:
  - solid segment before opening
  - lower segment under opening (for windows)
  - upper segment above opening
  - solid segment after opening
- This creates real voids in the wall geometry (no fake overlay rectangles).
- Multiple openings on one wall are supported.

## Validation

Validation runs before generation and throws `FloorPlanValidationError` with clear messages when invalid.

Current checks include:

- negative/non-positive dimensions
- zero-length walls
- invalid wall height/thickness
- opening width larger than host wall
- opening range outside host wall
- opening height/sill exceeding wall height
- unknown wall IDs for doors/windows
- overlapping openings on the same wall
- invalid room polygons (too few vertices / zero area)

## Coordinate system

The coordinate convention is explicit and standardized.

- Units: meters
- 2D plan axes:
  - `X`: east-west on ground plane
  - `Y`: north-south on ground plane
- 3D world axes:
  - `X`: east-west
  - `Y`: vertical height (up)
  - `Z`: opposite of 2D Y direction
- Mapping from plan to Three.js world:
  - `worldX = planX`
  - `worldY = height`
  - `worldZ = -planY`
- Origin: south-west apartment corner at floor elevation (`0 m`)

## Example apartment

The demo plan contains a small apartment with realistic metric dimensions:

- Living Room
- Kitchen
- Bedroom
- Bathroom
- Exterior and interior walls
- Multiple doors
- Multiple windows (including more than one opening on the same wall)

The resulting 3D wall geometry includes true openings for doors and windows.

## Viewer notes

The Three.js viewer remains simple and inspection-focused:

- Exterior walls and interior walls use different colors.
- Door and window opening volumes are shown with transparent debug markers.
- Floors are rendered from room boundaries.

This is intended to verify geometric correctness quickly, not realism.