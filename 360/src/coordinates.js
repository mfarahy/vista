// Canonical spatial coordinate system (Phase 6).
//
// One 2D floor-plan coordinate system is the single source of truth for
// every panorama position. `panoramas.js` already stores each panorama's
// `position` in this system: `{ x, y }` in meters, x = east, y = south
// (same convention already used by `worldYawBetween()` — yaw 0° = +x,
// yaw 90° = +y).
//
// The 3D view and the 360 panorama metadata are both *derived* from this
// same `{ x, y }` pair, never duplicated as independent data:
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
//   (`spatialNavigation.js`) are derived from these same positions via
//   `worldYawBetween()`, so the floor plan, the 3D scene and the panorama
//   navigation arrows can never drift apart.

export const EYE_HEIGHT_M = 1.6

// Floor-plan `{ x, y }` (meters) -> three.js world `{ x, y, z }` (meters).
export function floorPlanToWorld3D({ x, y }, height = EYE_HEIGHT_M) {
  return { x, y: height, z: y }
}

// three.js world `{ x, z }` (meters) -> floor-plan `{ x, y }` (meters).
export function world3DToFloorPlan({ x, z }) {
  return { x, y: z }
}
