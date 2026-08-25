# Vista 3D — Independent Architecture Audit

Audit date: 2026-08-25 · Scope: **3D only** — no 3D ↔ 360 integration.

Primary sources examined:

- `3d/src/floorPlan.ts` (canonical model / demo villa)
- `3d/src/geometryGenerator.ts` (geometry + measurement logic)
- `3d/src/openPlan3D.ts` (OpenPlan3D wall-segmentation adapter)
- `3d/src/BuildingViewer.tsx` (Three.js renderer / selection)
- `3d/src/geometryGenerator.test.ts` (13 tests — all green; build passes)

These are byte-identical to the live frontend port at
`frontend/components/preview/three-d/` mounted on `/3d`
(`frontend/app/3d/page.tsx`), which is fully isolated from `/360`.

---

## 1. Current 3D architecture

A single pipeline, already close to the "semantic building → geometry →
renderer" ideal:

```
Canonical Building (floorPlan.ts)
  -> geometryGenerator.ts  (validation, wall segmentation, spatial metadata, measurements)
  -> BuildingModel3D
  -> BuildingViewer.tsx (Three.js meshes + raycast selection)
  -> App / ThreeDPreview (inspector UI)
```

**Data model** (`floorPlan.ts`):

- `Building` → `floors[]`, `stairs[]`, `roof`
- `Floor2D` → `id`, `elevation`, `floorToFloorHeight`, `plan`
- `FloorPlan2D` → `walls[]`, `doors[]`, `windows[]`, `rooms[]`
- `Wall2D` = independent **line segment** (`start`/`end`) + `thickness`/`height`/`kind` (exterior/interior)
- `Room2D` = **boundary polygon** (`Point2D[]`) + `name`
- `Door2D` / `Window2D` = reference a `wallId` + `offset` + `width`/`height` (+ `sillHeight`, `openingDirection`)

**Geometry** (`geometryGenerator.ts`):

- Each wall is split into solid `WallBox3D` segments using the OpenPlan3D
  `buildOpenPlan3DWallSegments` algorithm, which already cuts **real voids**
  for doors (floor→top) and windows (sill→lintel) — see `openPlan3D.ts:139`.
- `Opening3D` records door/window placement (center, width, height, sill, rotation).
- `FloorSurface3D` per **room** polygon (not per floor contour).
- `StairBox3D`: 8 tread boxes per stair.
- A single flat `Roof3D` box.

**Spatial metadata** (`BuildingSpatial`) resolves every element to canonical
world position/dimensions for selection and measurement. Selection maps
`userData.type+id` back to `spatialElements` via raycast (`BuildingViewer.tsx:144`).

**Measurements** (`createMeasurements`, `geometryGenerator.ts:504`) derive wall
length/thickness, room area/width/length, door/window width+height and sill from
canonical geometry (not pixels). Rendered as lines.

---

## 2. Current implementation weaknesses

### Walls — closest to correct, but not topological
- Walls are independent primitives sharing endpoints; there is **no junction /
  corner handling** and **no splitting at T-intersections**. The `cross-divider`
  box passes straight *through* the `center-divider`, and interior walls punch
  through the exterior envelope. Visual intersections, no clean joints.
- Segmentation only splits a single wall for openings; it does not split walls
  where another wall meets them.

### Doors — real void, but rendered as decorative filler
- The wall void is genuine (good). However the rendered "door" is a
  **translucent marker box** (`BuildingViewer.tsx:102`, opacity 0.28) — no leaf,
  no frame, no swing. `openingDirection` is carried but never rendered.
- Doors are not linked to rooms, so "which rooms does this door connect" is
  unresolved.

### Windows — real void, decorative render only
- Void is real (sill→lintel). Render is again a translucent marker box — no
  frame, sill, or glazing; nothing derived into actual window geometry.

### Stairs — **the biggest weakness, geometry is wrong**
`createStairBoxes` (`geometryGenerator.ts:700`) emits 8 boxes where every box
shares the **same bottom** (`sourceElevation`) and only the top grows
(`height = stair.height * progress`). This produces a sloped wedge of stacked
boxes — it is **not an ascending run with risers/threads**. No real rise/run,
no landing at the target elevation, no step depth or gradient control
(`gradient`/`run` are undefined in `Stair2D`).

### Rooms — insufficient topology
- `Room2D` is only a polygon. There is **no link between a room and its
  enclosing walls** (the wall-matching in `toOpenPlan3DFloor`,
  `openPlan3D.ts:116`, is a fragile heuristic used only for the adapter).
- **No room adjacency** (shared-wall notion), **no connections**, and **no
  doors connecting rooms**.
- Area is correct (shoelace), but **dimensions use an axis-aligned bounding box**
  (`roomDimensions`, `geometryGenerator.ts:220`) — wrong for any rotated or
  non-rectilinear room.
- The demo plan happens to be rectilinear, so these gaps are invisible but are
  real limits for arbitrary floor plans.

### Floor / ceiling
- **No ceiling geometry exists at all.** Only per-room floor polygons.

### Measurements — source is sound, drawing is not
- Values come from canonical geometry (good), but the **drawn lines are
  axis-aligned in world space**, not aligned to each element's local
  orientation (e.g. a door/window on the vertical east wall has its width line
  drawn along world X, perpendicular to the wall). `roomDimensions` bbox is also
  wrong for rotated rooms. So "measurements" are numerically right only for
  axis-aligned layouts.

### Other spatial issues
- Roof position is a **hard-coded magic number** (`geometryGenerator.ts:762`,
  `center: {x:4.5,…,z:-3.5}`) instead of being derived from the floor contour.
- The floor selector box and camera target also use hard-coded extents
  (`BuildingViewer.tsx:78,57`) rather than computed bounds.

---

## 3. OpenPlan3D techniques worth adopting

OpenPlan3D already underpins the wall segmentation here; the remaining
high-value adoptions:

1. **Wall segment as a first-class primitive.** Model walls as connected wall
   segments (from corner/T-junction to corner/T-junction), then apply opening
   cuts per segment. This is what makes OpenPlan3D walls clean at corners and
   intersections. Incremental: split walls at shared endpoints/intersections
   before boxing, instead of one box per whole wall.
2. **Rooms defined by their enclosing wall IDs** (`room.walls: string[]`), not
   just a polygon. Area stays shoelace; the wall list gives room boundaries,
   adjacency (shared walls), and opens the door-to-room relationship. This also
   removes the fragile heuristic adapter in `openPlan3D.ts:116`.
3. **Openings as cuts in the wall segment** — already done. Keep it; the
   improvement is to expose the cut as explicit door/window openings with
   frame/leaf geometry rather than a translucent filler box.
4. **Doors as real 3D doorway objects** (OpenPlan3D ships `doorway.glb` /
   `doorwayOpen.glb` models). MVP version: derive a leaf + frame + swing from
   the door's width/height/orientation in the local wall frame — cheap, no GLB
   needed.
5. **First-class stair config** (straight/L/U with rise, run, gradient,
   landings). For the MVP adopt only **straight stairs with proper riser/thread
   rise-and-run**, using `sourceElevation/targetElevation` and a configurable
   `gradient`/`stepCount`.

---

## 4. Plan2Scene concepts worth adopting

Plan2Scene's neural texture synthesis is **out of scope** (Vista MVP has no
textures). Adopt only its **semantic scene structure**, which it already aligns
with:

1. **Wall segments, not room polygons, as the wall unit** (reinforces OpenPlan3D
   #1): the scene is decomposed into named wall segments and architectural
   openings lying *in* those walls.
2. **Architectural openings as a first-class, wall-owned concept** that consume
   wall segments, with doors/windows being wall openings rather than floating
   objects placed on top. (Vista already models this in `Opening3D` — keep and
   promote it.)
3. **Room topology**: rooms ↔ enclosing walls, room adjacency via shared walls,
   and connections (door openings) between rooms. This is the missing piece for
   "rooms connecting rooms" and spatial accuracy.
4. **Floor and ceiling as horizontal room surfaces** at `elevation` and
   `elevation + wallHeight` (or `floorToFloorHeight`), defined per room. Vista
   has floors; **add the mirrored ceiling surface**.
5. **Building → Floors → Rooms → Walls → Openings → Floor/Ceiling** semantic
   hierarchy as the renderer's input — which is exactly the recommended MVP
   structure below (no new framework needed).

---

## 5. Recommended minimal architecture

Keep the existing single pipeline and incremental shape. Do **not** introduce a
framework or a second model — evolve `floorPlan.ts`/`geometryGenerator.ts`.

1. **Rooms reference their enclosing wall ids.** Add `Room2D.wallIds: string[]`
   (source of truth in the canonical model). Derive, cheaply:
   - room ↔ wall boundaries,
   - adjacency (two rooms sharing a wall),
   - door↔room connections (a door's host wall is shared by both rooms).
   These can live in `BuildingSpatial` without new abstractions.
2. **Walls split at junctions before opening cuts.** In `generateWallBoxes`,
   first split each `Wall2D` at every intersection/T-junction/corner point
   shared with other walls (exact-endpoint matching, then a small segment merge
   tolerance), then run the existing `buildOpenPlan3DWallSegments` per sub-wall.
   Keeps the proven opening logic; fixes clean corners and stops boxes passing
   through one another.
3. **Openings stay wall-owned; add real door/window meshes.**
   - Door: derive leaf + swing from width/height/`openingDirection` in the
     local wall frame; render frame + leaf instead of the translucent filler.
   - Window: derive sill, frame, and glass panel from sill/width/height.
   The `Opening3D` void logic is unchanged.
4. **Rework stairs to a real straight run.** Replace `createStairBoxes` with
   proper riser/thread boxes: `rise = (target-src)/steps`, `run = length/steps`,
   each tread at `src + rise*(i+1)` bottom, depth `run`, width `width`.
   Keep `createWallBox`-style per-tread boxes. (Fix the shared-bottom bug.)
5. **Add explicit ceiling surfaces** mirroring the floor polygons at
   `elevation + wallHeight` (or `floorToFloorHeight`).
6. **Align measurements to local element axes.** Draw a door/window/wall
   length line along that element's wall direction via its `rotation`, not
   along a global axis. Compute rotated-room dimensions via the oriented
   bounding box (project boundary onto the wall axes) instead of the AABB.
7. **Derive roof + camera bounds from geometry** (replace magic numbers with
   computed floor extents).

The renderer (`BuildingViewer`) then simply consumes the richer `BuildingModel3D`
— its mesh loops, raycast selection, and `userData` → canonical mapping remain
unchanged.

---

## 6. Recommended implementation order

1. **Stairs rework** (biggest visual/geometric defect, isolated, low risk).
2. **Ceiling surfaces** (trivial, completes the room shell).
3. **Room↔wall linking** (`Room2D.wallIds` + wall adjacency + door↔room) —
   foundational for the rest; keep `boundary` for area.
4. **Wall junction splitting** (clean corners/intersections) using the existing
   segmentation.
5. **Door/window real meshes** (leaf/swing/frame/sill) — depends on clean wall
   segments (3→4).
6. **Measurement alignment + rotated-room dimensions** (local axes).
7. **Geometry-derived roof/camera bounds.**

Each is an incremental, independently verifiable change with existing test
coverage (`geometryGenerator.test.ts`) plus new cases added as they land.

---

## 7. Specific risks and compatibility concerns

- **Keep the canonical model source of truth.** Do not let the renderer
  recompute architecture or introduce a UI-only model. Every change must extend
  `floorPlan.ts` → `geometryGenerator.ts` → `BuildingModel3D`, with
  `BuildingViewer` consuming output only.
- **Determinism / test regression.** `generateBuildingModel(demoBuilding)` must
  remain deterministic and all 13 tests must stay green; add tests per change
  (wall splitting, rotated-room dimensions, stair rise/run, ceiling, local-axis
  measurements). The frontend port is byte-identical today — **mirror any edit
  to both `3d/src` and `frontend/components/preview/three-d/`** or the two
  diverge and the frontend build/typecheck breaks (`tsc --noEmit`).
- **Rotation correctness.** The current code is effectively verified against an
  axis-aligned demo only. Wall splitting, room dimensions, and measurement
  alignment must be validated against rotated walls (add a rotated-room unit
  test) or accuracy claims regress for real floor plans.
- **Room area vs. wall thickness.** Room polygons currently ignore wall
  thickness (area is interior-fill). Keep `Room2D.area` semantics explicit and
  consistent with the floor/ceiling surfaces so displayed m² and geometry agree.
- **Do not over-abstract for a future 360 integration.** Do not add generic
  "annotations"/"anchors"/"element registry" abstractions anticipating a 3D↔360
  sync. The task is to finalize 3D only; the existing `userData` →
  `spatialElements` mapping is sufficient and 360 handles its own model
  (verified: `/360` and `/3d` share nothing).
- **Out of scope by design:** Plan2Scene neural texture synthesis, OpenPlan3D
  furniture library, L/U stairs, multi-style doors/windows, material editor —
  none are needed for the MVP and all would add scope/complexity.
- **No code changed in this audit** (deliverable is this document only); the
  referenced OpenPlan3D/License and existing test suite are untouched.

---

## Summary

Vista is closer to the target architecture than the weaknesses suggest: real
wall segmentation with true door/window voids already exists. The highest-value,
lowest-risk fixes are (1) the **stair geometry**, (2) **missing ceilings**,
(3) **room↔wall topology** (walls + adjacency + door↔room connections), and
(4) **fabricated door/window meshes** so openings read as architecture instead
of translucent filler — followed by measurement/roof accuracy hardening. All fit
the existing pipeline without a framework or any 360 coupling.
