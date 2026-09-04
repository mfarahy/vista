// Static 2D floor-plan data (Phase 6).
//
// A very small, hand-sized floor plan: three square rooms, one centered on
// each panorama position from `panoramas.js`, plus the walls and doors that
// connect them. This is intentionally NOT a floor-plan editor or a general
// geometry engine — rooms are simple axis-aligned squares and doors are
// derived with one small helper, just enough to demonstrate the spatial
// data model.
//
// Room centers reuse the exact panorama positions, so the floor plan, the
// 3D view and the 360 panoramas all agree on where each room is (see
// `coordinates.js` for how positions map between the three views).

import { LINKS, panoramaById } from './panoramas.js'

const ROOM_SIZE = 6 // meters, square room side length

export const ROOMS = [
  { id: 'living-room', label: 'Living Room', size: ROOM_SIZE },
  { id: 'kitchen', label: 'Kitchen', size: ROOM_SIZE },
  { id: 'bedroom', label: 'Bedroom', size: ROOM_SIZE },
].map((room) => ({ ...room, center: panoramaById(room.id).position }))

export function roomById(id) {
  return ROOMS.find((r) => r.id === id)
}

// The four wall segments (as { x1, y1, x2, y2 }) bounding a square room.
export function roomWalls(room) {
  const half = room.size / 2
  const { x, y } = room.center
  const corners = [
    { x: x - half, y: y - half },
    { x: x + half, y: y - half },
    { x: x + half, y: y + half },
    { x: x - half, y: y + half },
  ]
  return corners.map((corner, i) => {
    const next = corners[(i + 1) % corners.length]
    return { x1: corner.x, y1: corner.y, x2: next.x, y2: next.y }
  })
}

export const WALLS = ROOMS.flatMap((room) => roomWalls(room))

// Point where the ray from `room.center` toward `towardPoint` crosses the
// room's square boundary. Used to place a door where two rooms face each
// other, derived from their positions rather than hand-picked coordinates.
function roomBoundaryPoint(room, towardPoint) {
  const half = room.size / 2
  const dx = towardPoint.x - room.center.x
  const dy = towardPoint.y - room.center.y
  const t = half / Math.max(Math.abs(dx), Math.abs(dy))
  return { x: room.center.x + dx * t, y: room.center.y + dy * t }
}

// One door per undirected pair of linked rooms (LINKS stores both
// directions, e.g. living-room->kitchen and kitchen->living-room).
function uniqueLinkPairs() {
  const seen = new Set()
  const pairs = []
  for (const link of LINKS) {
    const key = [link.from, link.to].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push(link)
  }
  return pairs
}

// A door is drawn as the short segment connecting the two boundary points
// where the line between the two room centers exits each room — i.e. the
// gap in the corridor between them.
export const DOORS = uniqueLinkPairs().map((link) => {
  const from = roomById(link.from)
  const to = roomById(link.to)
  const a = roomBoundaryPoint(from, to.center)
  const b = roomBoundaryPoint(to, from.center)
  return { rooms: [from.id, to.id], a, b }
})

// Real window geometry (Phase 7).
//
// One test window in the Living Room, defined entirely in the canonical
// floor-plan `{ x, y }` coordinate system (meters). The window belongs to a
// specific wall of its room (index into `roomWalls(room)`), with a
// configurable width, a configurable horizontal offset from the wall
// midpoint along the wall direction, and configurable vertical dimensions
// (sill height + height) for the minimal 3D representation.
//
// Living Room layout reminder (center 0,0, size 6): wall 0 = north
// (y = -3, yaw -90°), wall 1 = east (x = 3, yaw 0°), wall 2 = south
// (y = 3, yaw 90°), wall 3 = west (x = -3, yaw 180°). The window sits on the
// north wall, centered, far from both doorways (yaws 0° and 60°) and from
// the room letter (yaw 180°), so alignment is visually unambiguous.
export const WINDOWS = [
  {
    id: 'living-room-window',
    roomId: 'living-room',
    wallIndex: 0,
    offsetM: 0,
    widthM: 1.8,
    sillM: 0.9,
    heightM: 1.2,
  },
]

export function windowById(id) {
  return WINDOWS.find((w) => w.id === id)
}
