# Floor plan reconstruction (2D recognition → 3D model)

This document describes the MVP pipeline that turns the output of the
`floorplan-recognition` model (ton731/floorplan-recognition, running in
Docker on port 5000) into normalized geometry, detected rooms, a 2D debug
view and an interactive 3D model.

## Pipeline

```
Recognition JSON (wall/door/window polygons + center lines)
  → normalizeGeometry()    clean walls, openings, bounds (pixel space)
  → detectRooms()          enclosed room polygons from the wall mask
  → buildFloorPlan3DModel() meter-space 3D model with wall openings
  → debug 2D view + GLB (3D)
```

All steps live in `job-processor/src/lib/floorplan-pipeline/`:

| Module | Purpose |
| --- | --- |
| `types.ts` | Normalized floor-plan representation (walls, openings, rooms, bounds) |
| `geometry.ts` | Dependency-free helpers: shoelace, RDP simplify, polygon rasterization, point-in-polygon, flood fill, boundary-edge contour tracing |
| `normalize.ts` | Wall preprocessing: drops tiny fragments, clusters polygon edges into sides, pairs parallel sides into centerline wall runs with inferred thickness, merges collinear runs, extracts openings from center lines and associates them with walls |
| `rooms.ts` | Room detection: rasterizes walls/doors/windows into a blocked mask (doors treated as closed so rooms stay separate), dilates to close recognition gaps, flood-fills from the border (outside), traces each enclosed free component into a simplified polygon, associates openings with the rooms on each side, flags exterior walls and the outside space |
| `model3d.ts` | Builds the meter-space 3D model: room floors as polygons, wall segments extruded to 2.7 m, wall cuts at door/window center lines, door leaves and window glass |
| `svg.ts` | 2D debug SVG of the processed geometry (used by the CLI report) |
| `index.ts` | Pipeline runner + compact debug payload for the frontend |

Room labels are intentionally generic ("Room 1", "Kitchen" when the
recognized kitchen region overlaps the room, "Terrace / outside" for the
exterior component). No OCR/AI is used for room detection.

## 3D model

- `PIXELS_PER_METER = 50` (configurable), model centered on the plan bounds
- Wall height 2.7 m, doors 2.1 m, windows 1.4 m above a 0.9 m sill
- Walls are cut at door/window center lines, so openings are real gaps
- Rooms become floor polygons (AABB fallback for older data)
- The GLB builder (`job-processor/src/lib/floorplan-providers/glb-builder.ts`)
  triangulates the room polygons (ear clipping) and emits per-material
  primitives (wall, floor, door, window)

## How to run

### 2D debug view (CLI report)

```bash
cd job-processor
npm run floorplan:debug -- src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json
# writes floorplan-debug.html; open it in a browser
```

The report shows the processed geometry (walls, doors, windows, detected
rooms, kitchen regions) as one SVG, plus per-room/wall/opening statistics.

### 3D viewer and live debug page

Run the normal stack (expose-service, job-processor, NATS, PostgreSQL) and
upload a floor plan through the 3D preview page (`/3d`). The job stores the
normalized geometry, detected rooms and the 3D model on the job record.
Then open:

```
http://localhost:3000/debug/floorplan/<jobId>
```

This page shows the 2D debug view and the interactive 3D model with a
2D/3D toggle and a reset-camera button. Orbit = drag, zoom = wheel,
pan = right-drag.

## Tests

```bash
cd job-processor
npm test          # includes src/lib/floorplan-pipeline/pipeline.test.ts
npm run lint
cd ../frontend
npm run typecheck
npm test
```

The pipeline tests run against the captured recognition outputs in
`job-processor/src/lib/floorplan-pipeline/fixtures/` (generated from the
sample images in `sample/` via the running Docker model).

## Known limitations

- Rooms are separated by treating doors as closed; the door itself is the
  connector between the two flanking rooms (stored as `roomIds` on each
  opening).
- The mask is dilated (10 px) to close recognition gaps between wall
  fragments; room polygons therefore sit a few pixels inside the true walls
  and very narrow passages (< ~20 px) can be closed off.
- Wall thickness is inferred from the recognized ribbon width; values are
  clamped to a plausible range. No real-world measurements are inferred.
- Long "doors" or "windows" (recognition artifacts, e.g. a 7.8 m window)
  are kept as detected; the geometry pipeline does not merge or split them.
- The outside space (terrace) is detected as the free component connected
  to the image border; it is rendered as an exterior room, not as enclosed
  space.
- Stairs/furniture inside a room do not create rooms; they only shrink the
  free space of the room that contains them.