# Deterministic Multi-Floor Villa (Phase 3)

This isolated React, TypeScript, and Three.js prototype converts structured 2D architectural data into a deterministic multi-floor building model. It adopts the data conventions and wall-opening segmentation approach from [openPlan3D](https://github.com/laanlabs/openPlan3D), whose upstream repository is an application rather than a distributable React library.

```text
Building -> Floors -> FloorPlan2D -> validation -> 3D geometry -> Three.js viewer
```

## openPlan3D adoption

openPlan3D was selected because it defines a practical shared architectural model for `Floor`, `Wall`, `Door`, `Window`, and `Room`, renders the same floor data in 2D and 3D, and uses parametric door/window positions along walls. The upstream project is available at https://github.com/laanlabs/openPlan3D and is licensed under MIT; its attribution and license text are preserved in [OPENPLAN3D-LICENSE](OPENPLAN3D-LICENSE).

This prototype reuses the upstream model conventions and the pure `buildWallSegments` rule extracted from `src/lib/components/viewer3d/ThreeViewer.svelte`. [openPlan3D.ts](src/openPlan3D.ts) is the deliberately small integration boundary: it converts the canonical meter model to upstream-style normalized openings and keeps the conversion deterministic. The React viewer remains local because the upstream viewer is coupled to Svelte stores and components. No upstream application shell, persistence, Firebase integration, furniture, or import pipeline is copied.

## Architecture

```text
Building
       -> Floor (explicit elevation in meters)
              -> Room / Wall / Door / Window (one canonical 2D plan)
                     -> openPlan3D adapter -> 2D conventions and wall segmentation
                     -> local Three.js representation
```

The authored source of truth is `Building` in [floorPlan.ts](src/floorPlan.ts). The adapter is a derived representation for integration, not a second editable building model. The current prototype has no interactive 2D editor; the structured floor plan is the 2D representation consumed by the 3D renderer.

## Run locally

```bash
npm install
npm run dev
npm test
```

## Example villa

```text
                         ROOF
                  +----------------+
 FIRST FLOOR     | Bed 1 | Bed 2   |
 elevation 2.80m | Hall  | Bath     |
                  +------ stairs ---+
 GROUND FLOOR    | Living | Kitchen |
 elevation 0.00m | Entry  | Bath     |
                  +------ stairs ---+
 BASEMENT        | Basement room   |
 elevation -2.80 | Utility/storage  |
                  +----------------+
```

The example has three floors, explicit doors and windows on every floor, rooms owned by their floor, and two stair connections: basement to ground and ground to first.

## Building model

`Building` contains a meter unit, `floors`, canonical `stairs`, and a simple `roof`.

Each `Floor2D` has:

- `id` and `name`
- explicit `elevation` in meters
- `floorToFloorHeight` in meters
- one `FloorPlan2D` containing walls, doors, windows, and rooms

The generator never derives elevation from array order. The demo elevations are basement `-2.80m`, ground `0m`, and first `2.80m`.

## Geometry and coordinates

All plans use one global horizontal coordinate system. A plan point is floor-local data in meters with `x` east-west and `y` north-south. This differs from upstream openPlan3D's editor convention, which stores `x/y` in centimeters; the adapter keeps the upstream normalized opening semantics while the canonical prototype remains in meters. It maps to Three.js world coordinates as:

```text
worldX = planX
worldY = floor.elevation + localHeight
worldZ = -planY
```

The south-west plan corner is the shared `(0, 0)` horizontal origin. Three.js `Y` is up. Wall thickness and wall height remain in meters; openings split wall solids into deterministic segments. A floor's global vertical base is its explicit `elevation`; local wall/window/door height is added to that value. The plan `y` axis maps to world `-Z` so the horizontal mapping remains stable and right-handed for the viewer.

## Rooms, stairs, and roof

Rooms stay simple: each room has an ID, name, boundary polygon, and floor ownership through its containing `Floor2D`.

Each `Stair2D` declares `sourceFloorId`, `targetFloorId`, position, width, length, and height. The generator creates eight rising tread boxes, enough to communicate location and vertical direction without attempting realistic stair engineering.

The roof declares the highest floor it belongs to and generates one deterministic roof volume above that floor.

## Viewer

The viewer supports orbit, pan, zoom, camera inspection, and a selector for Basement, Ground Floor, First Floor, or All Floors. Selecting one floor hides unrelated floor geometry while keeping connecting stairs visible. All Floors shows the complete villa.

## Current limitations

This phase intentionally excludes AI, image/PDF parsing, OCR, panoramas, virtual tours, camera placement, measurements overlays, furniture, realistic materials, backend/API/database/authentication, and advanced roof or stair generation. Room boundaries are structured input rather than detected geometry.

## Future direction

This isolated prototype is intended to become the deterministic 3D foundation for Vista later. Vista integration is intentionally not implemented in this phase.
