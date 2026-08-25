# Deterministic Multi-Floor Villa (Phase 4)

This isolated React, TypeScript, and Three.js prototype converts structured 2D architectural data into a deterministic multi-floor building model with explicit spatial metadata, canonical measurements, and 3D selection support. It continues to use the shared architectural conventions from [openPlan3D](https://github.com/laanlabs/openPlan3D), while keeping the prototype independent from the upstream Svelte application shell.

```text
Canonical Building Model -> Geometry / Measurement Logic -> 3D Renderer -> Selection / UI
```

## Spatial element model

The canonical model remains the structured source of truth for architecture. The current `Building` structure includes explicit `floors`, `rooms`, `walls`, `doors`, `windows`, and derived spatial metadata produced from the same geometry model:

```ts
const windowExample = {
  id: "ground-north-window",
  floorId: "ground",
  hostWallId: "north",
  worldPosition: { x: 1.6, y: 1.5, z: -7 },
  rotation: 0,
  width: 1.6,
  height: 1.2,
  sillHeight: 0.9,
};
```

Every architectural item is defined by its canonical geometry, not by a second UI-only copy. The Three.js meshes keep a lightweight element mapping back to the canonical object so later phases can connect the same element to annotations, measurements, and panorama anchors without duplicating the architecture.

## Coordinate system

The model keeps a single consistent metric coordinate system:

- Horizontal axes: `x` = east-west, `y` = north-south in floor plan space
- Vertical axis: `Y` in Three.js world space, derived from explicit floor elevation and local building height
- Origin: the south-west corner of the villa plan, at the floor's plan origin
- Units: meters
- Local coordinates: plan points remain in meters and are floor-local
- World coordinates: `x = planX`, `y = floorElevation + localHeight`, `z = -planY`

This matches the existing Phase 3 geometry and keeps all floors aligned on a single deterministic global frame.

## Measurement model

Measurements are derived from the canonical geometry and not from the rendered canvas or screenshot pixels. The model can represent wall length, thickness, height, room dimensions, room area, door width/height, window width/height, window sill height, and floor elevation.

```text
wall.length = distance(start, end)
room.area = polygonArea(boundary)
window.sillHeight = explicit floor-local value
```

Each `Measurement` carries:

- `subjectType` and `subjectId` to resolve back to the canonical element
- `kind` such as `length`, `width`, `height`, `area`, `sillHeight`, or `elevation`
- `value` in meters
- `floorId` and spatial endpoints used by the 3D overlay

## Selection architecture

The separation stays simple and practical:

```text
Canonical Building Model
  -> Geometry / Measurement Logic
  -> 3D Renderer
  -> Selection / UI
```

Three.js objects are assigned a `userData` payload containing the canonical `type` and `id`, and the app resolves selection back to the model's canonical records. This avoids creating a separate UI-only representation and keeps the later `2D Floor Plan -> 3D Model -> 360 Panorama -> Spatial Annotations` chain grounded in the same architecture.

## How dimensions are calculated

The geometry and measurement logic is centralized in [src/geometryGenerator.ts](src/geometryGenerator.ts). It calculates:

- wall length from the actual 2D wall endpoints
- room dimensions from the boundary extents and polygon area
- door and window offsets from the host wall and opening dimensions
- floor elevation from the explicit `Floor2D.elevation` parameter

Because these values come from the canonical model, measurement overlays remain deterministic and accurate.

## Example villa

The demo villa keeps the multi-floor arrangement from Phase 3:

- Basement: rooms, walls, and doors
- Ground Floor: living room, kitchen, bathroom, doors, and windows
- First Floor: bedrooms, bathroom, doors, and windows

The same canonical structure supports all floors, while selection and measurements remain tied to the current floor and host element.

## Viewer and measurement overlay

The viewer renders the model with simple wall, door, window, and room geometry and adds a light measurement overlay for dimensions. The overlay is intentionally minimal and meant to validate the coordinate system and metric accuracy rather than mimic a CAD application.

## Future extension

This phase is intentionally limited to the spatial foundation. It does not add AI, OCR, 360 viewers, panoramas, or backend systems. The canonical model is ready, however, for future work that connects the same elements to spatial annotations and panorama anchors.
