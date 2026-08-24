// 2D floor-plan view (Phase 6).
//
// Renders the static floor plan (`floorplan.js`) as SVG: room outlines,
// walls, doors (drawn as gaps in the wall) and one clickable marker per
// panorama position, using the exact same `{ x, y }` coordinates the 360
// panoramas and the 3D view use (see `coordinates.js`).

import { PANORAMAS } from './panoramas.js'
import { DOORS, ROOMS, WALLS } from './floorplan.js'

const SCALE = 40 // px per meter
const PADDING = 40 // px

const xs = ROOMS.flatMap((r) => [r.center.x - r.size / 2, r.center.x + r.size / 2])
const ys = ROOMS.flatMap((r) => [r.center.y - r.size / 2, r.center.y + r.size / 2])
const MIN_X = Math.min(...xs)
const MIN_Y = Math.min(...ys)
const WIDTH = (Math.max(...xs) - MIN_X) * SCALE + PADDING * 2
const HEIGHT = (Math.max(...ys) - MIN_Y) * SCALE + PADDING * 2

function toSvg({ x, y }) {
  return { x: (x - MIN_X) * SCALE + PADDING, y: (y - MIN_Y) * SCALE + PADDING }
}

// Distance from a door's midpoint used to shorten the two wall segments it
// interrupts, drawing a visible gap for the doorway.
const DOOR_GAP_M = 1.1

// Each door has one opening per room it connects (the point where it meets
// that room's wall) — flatten to a list of { point } openings to carve.
const DOOR_OPENINGS = DOORS.flatMap((door) => [door.a, door.b])

function pointIsOnWall(wall, point) {
  const dx = wall.x2 - wall.x1
  const dy = wall.y2 - wall.y1
  const len = Math.hypot(dx, dy)
  const collinear =
    Math.abs(dx * (point.y - wall.y1) - dy * (point.x - wall.x1)) < 1e-6
  if (!collinear) return false
  const t = (dx * (point.x - wall.x1) + dy * (point.y - wall.y1)) / (len * len)
  return t > 0 && t < 1
}

function wallSegmentsAroundOpening(wall, point) {
  const dx = wall.x2 - wall.x1
  const dy = wall.y2 - wall.y1
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const halfGap = DOOR_GAP_M / 2
  return [
    { x1: wall.x1, y1: wall.y1, x2: point.x - ux * halfGap, y2: point.y - uy * halfGap },
    { x1: point.x + ux * halfGap, y1: point.y + uy * halfGap, x2: wall.x2, y2: wall.y2 },
  ]
}

function wallsWithDoorGaps() {
  const segments = []
  for (const wall of WALLS) {
    const opening = DOOR_OPENINGS.find((point) => pointIsOnWall(wall, point))
    if (!opening) {
      segments.push(wall)
      continue
    }
    segments.push(...wallSegmentsAroundOpening(wall, opening))
  }
  return segments
}

export default function FloorPlan2D({ activePanoramaId, onSelectPanorama }) {
  const wallSegments = wallsWithDoorGaps()

  return (
    <svg
      className="floorplan-2d"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="2D floor plan"
    >
      {ROOMS.map((room) => {
        const half = room.size / 2
        const topLeft = toSvg({ x: room.center.x - half, y: room.center.y - half })
        return (
          <g key={room.id}>
            <rect
              x={topLeft.x}
              y={topLeft.y}
              width={room.size * SCALE}
              height={room.size * SCALE}
              className="floorplan-room"
            />
            <text
              x={toSvg(room.center).x}
              y={topLeft.y + 18}
              className="floorplan-room-label"
              textAnchor="middle"
            >
              {room.label}
            </text>
          </g>
        )
      })}

      {wallSegments.map((wall, i) => {
        const p1 = toSvg({ x: wall.x1, y: wall.y1 })
        const p2 = toSvg({ x: wall.x2, y: wall.y2 })
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            className="floorplan-wall"
          />
        )
      })}

      {PANORAMAS.map((pano) => {
        const p = toSvg(pano.position)
        const isActive = pano.id === activePanoramaId
        return (
          <g
            key={pano.id}
            className={`floorplan-marker${isActive ? ' floorplan-marker--active' : ''}`}
            transform={`translate(${p.x}, ${p.y})`}
            onClick={() => onSelectPanorama(pano.id)}
            role="button"
            tabIndex={0}
            aria-label={`Open ${pano.label} panorama`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectPanorama(pano.id)
            }}
          >
            <circle r={12} className="floorplan-marker-dot" />
            <text y={-18} textAnchor="middle" className="floorplan-marker-label">
              {pano.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
