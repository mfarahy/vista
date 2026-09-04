// 360 viewer preview — canonical spatial coordinate system.
// Typed port of the former standalone prototype's `coordinates.js`.
//
// One 2D floor-plan coordinate system is the single source of truth for
// every panorama position: `{ x, y }` in meters, x = east, y = south
// (same convention used by `worldYawBetween()` — yaw 0° = +x, yaw 90° = +y).
//
// The 360 panorama metadata is *derived* from this same `{ x, y }` pair,
// never duplicated as independent data:
//
// - 3D world coordinates (three.js, right-handed, Y-up):
//     worldX = x
//     worldY = height (a fixed eye-level constant, see EYE_HEIGHT_M)
//     worldZ = y
//   i.e. the floor-plan plane becomes the 3D ground plane (X/Z), and height
//   is the only added dimension.
//
// - 360 panorama metadata: the panorama's `position` field *is* the
//   floor-plan coordinate; the link yaws used for navigation arrows
//   (`spatialNavigation.ts`) are derived from these same positions via
//   `worldYawBetween()`.

export const EYE_HEIGHT_M = 1.6;

export type FloorPlanPoint = { x: number; y: number };

export type WorldPoint = { x: number; y: number; z: number };

// Floor-plan `{ x, y }` (meters) -> three.js world `{ x, y, z }` (meters).
export function floorPlanToWorld3D(point: FloorPlanPoint, height: number = EYE_HEIGHT_M): WorldPoint {
  return { x: point.x, y: height, z: point.y };
}

// three.js world `{ x, z }` (meters) -> floor-plan `{ x, y }` (meters).
export function world3DToFloorPlan(point: WorldPoint): FloorPlanPoint {
  return { x: point.x, y: point.z };
}
