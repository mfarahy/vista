// Panorama projection (Phase 7).
//
// Converts world-space window corners into current 360 view coordinates.
// Chain: floor-plan {x,y} -> 3D world (coordinates.js, windowGeometry.js)
// -> panorama yaw/pitch -> screen pixels.
//
// Screen math reuses exactly the projection Pannellum itself uses for custom
// hotspots (see `Ca()` in pannellum.js): the same sin/cos formulation, so the
// overlay aligns with Pannellum's own rendering. Because it works on
// direction vectors (sin/cos of the yaw delta), the equirectangular
// 0°/360° seam needs no special case.

import { normalizeYaw } from './panoramas.js'

const DEG = Math.PI / 180

// World point `{ x, y, z }` (three.js, Y-up) -> panorama `{ yaw, pitch }`
// (degrees), accounting for camera world position and panorama orientation:
// worldYaw = yawInPanorama + orientation.
export function worldPointToYawPitch(point, cameraPos, orientation = 0) {
  const dx = point.x - cameraPos.x
  const dy = point.y - cameraPos.y
  const dz = point.z - cameraPos.z
  const horiz = Math.hypot(dx, dz)
  const worldYaw = (Math.atan2(dz, dx) * 180) / Math.PI
  const pitch = (Math.atan2(dy, horiz) * 180) / Math.PI
  return { yaw: normalizeYaw(worldYaw - orientation), pitch }
}

// Panorama `(yaw, pitch)` -> screen pixels for the current view. Mirrors
// Pannellum's hotspot projection (`k = tan(hfov/2)`, focal `f = w/2k`).
export function yawPitchToScreen(yaw, pitch, view) {
  const { yaw: viewYaw, pitch: viewPitch, hfov, width, height } = view
  const sinP = Math.sin(pitch * DEG)
  const cosP = Math.cos(pitch * DEG)
  const sinV = Math.sin(viewPitch * DEG)
  const cosV = Math.cos(viewPitch * DEG)
  const delta = (viewYaw - yaw) * DEG
  const g = Math.cos(delta)
  const l = Math.sin(delta)
  // Cosine of the angle between view and target direction.
  const h = sinP * sinV + cosP * g * cosV
  const k = Math.tan((hfov * DEG) / 2)
  const focal = width / 2 / k
  const x = width / 2 - (focal * l * cosP) / h
  const y = height / 2 - (focal * (sinP * cosV - cosP * g * sinV)) / h
  return { x, y, h, behind: h <= 0, yaw, pitch }
}

// Full chain for one world point.
export function projectWorldPoint(point, cameraPos, orientation, view) {
  const { yaw, pitch } = worldPointToYawPitch(point, cameraPos, orientation)
  const screen = yawPitchToScreen(yaw, pitch, view)
  return { ...screen, worldYawPitch: { yaw, pitch } }
}

// Project all window corners. Returns screen points in order.
export function projectWindowCorners(corners, cameraPos, orientation, view) {
  return corners.map((corner) => projectWorldPoint(corner, cameraPos, orientation, view))
}

// True when at least one corner is in front of the camera and lands inside
// (or near) the viewport. Small windows can't surround the view, so this is
// enough to decide hide/fade. Margin keeps the overlay from popping at edges.
export function isWindowVisible(projected, width, height, margin = 80) {
  return projected.some(
    (p) =>
      !p.behind &&
      p.x >= -margin &&
      p.x <= width + margin &&
      p.y >= -margin &&
      p.y <= height + margin,
  )
}
