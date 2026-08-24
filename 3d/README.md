# Deterministic Multi-Floor Villa (Phase 3)

This isolated React, TypeScript, and Three.js prototype converts structured 2D architectural data into a deterministic multi-floor building model.

```text
Building -> Floors -> FloorPlan2D -> validation -> 3D geometry -> Three.js viewer
```

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

All plans use one global horizontal coordinate system. A plan point is local floor data with `x` east-west and `y` north-south. It maps to Three.js world coordinates as:

```text
worldX = planX
worldY = floor.elevation + localHeight
worldZ = -planY
```

The south-west plan corner is the shared `(0, 0)` horizontal origin. Three.js `Y` is up. Wall thickness and wall height remain in meters; openings split wall solids into deterministic segments.

## Rooms, stairs, and roof

Rooms stay simple: each room has an ID, name, boundary polygon, and floor ownership through its containing `Floor2D`.

Each `Stair2D` declares `sourceFloorId`, `targetFloorId`, position, width, length, and height. The generator creates eight rising tread boxes, enough to communicate location and vertical direction without attempting realistic stair engineering.

The roof declares the highest floor it belongs to and generates one deterministic roof volume above that floor.

## Viewer

The viewer supports orbit, pan, zoom, camera inspection, and a selector for Basement, Ground Floor, First Floor, or All Floors. Selecting one floor hides unrelated floor geometry while keeping connecting stairs visible. All Floors shows the complete villa.

## Current limitations

This phase intentionally excludes AI, image/PDF parsing, OCR, panoramas, virtual tours, camera placement, measurements overlays, furniture, realistic materials, backend/API/database/authentication, and advanced roof or stair generation. Room boundaries are structured input rather than detected geometry.
