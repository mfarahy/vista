// Window geometry (Phase 7).
//
// Minimal 3D representation of a floor-plan window. The floor-plan `{ x, y }`
// coordinate system stays the single source of truth: a window belongs to a
// specific wall, with a configurable width and horizontal offset along the
// wall plus configurable vertical dimensions (sill + height). The four
// world-space corners are derived from those values via the canonical
// `floorPlanToWorld3D()` mapping — no duplicated coordinate system.

import { floorPlanToWorld3D } from './coordinates.js'
import { roomById, roomWalls } from './floorplan.js'

// Wall segment `{ x1, y1, x2, y2 }` this window belongs to.
export function windowWall(win) {
  const room = roomById(win.roomId)
  return roomWalls(room)[win.wallIndex]
}

// Horizontal window segment in floor-plan coordinates: `{ a, b, center }`
// where `a`/`b` are the two ends along the wall and `center` is the midpoint.
export function windowFloorSegment(win) {
  const wall = windowWall(win)
  const dx = wall.x2 - wall.x1
  const dy = wall.y2 - wall.y1
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 }
  const center = { x: mid.x + ux * win.offsetM, y: mid.y + uy * win.offsetM }
  const half = win.widthM / 2
  return {
    center,
    a: { x: center.x - ux * half, y: center.y - uy * half },
    b: { x: center.x + ux * half, y: center.y + uy * half },
  }
}

export function windowTopM(win) {
  return win.sillM + win.heightM
}

// Four world-space corners (three.js convention, meters), ordered
// bottomA -> bottomB -> topB -> topA for polygon rendering.
export function windowWorldCorners(win) {
  const { a, b } = windowFloorSegment(win)
  const top = windowTopM(win)
  return [
    floorPlanToWorld3D(a, win.sillM),
    floorPlanToWorld3D(b, win.sillM),
    floorPlanToWorld3D(b, top),
    floorPlanToWorld3D(a, top),
  ]
}

// Human-readable measurement label, e.g. "1.80 m".
export function windowWidthLabel(win) {
  return `${win.widthM.toFixed(2)} m`
}
