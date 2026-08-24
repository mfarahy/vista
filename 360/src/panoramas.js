// Spatial navigation prototype (Phase 4) — in-memory panorama data.
//
// This is intentionally NOT a graph abstraction: it is a small, static
// in-memory list of three sample panoramas plus the links between them.
//
// Spatial arrangement (top-down, world coordinates):
//
//                 B (Kitchen, 10, 0)
//                / \
//               /   \
//              /     \
//   A (Living Room)   \
//   (0, 0)  -------->  C (Bedroom, 5, 8.66)
//
// A, B and C form an equilateral triangle. Every link's yaw is derived from
// the two positions, so the navigation arrows, the painted doorways in the
// generated images and the arrival view direction all stay consistent.
//
// Yaw convention (matches Pannellum): 0° = +x (east), 90° = +y (south),
// -180°/180° = -x (west).
//
// `orientation` is each panorama's predefined world orientation in degrees:
// the rotation offset between its own yaw frame and the world frame.
// worldYaw = yawInPanorama + orientation

// `image` is a relative URL (resolved against `import.meta.env.BASE_URL` in
// the app) so this module can also be imported by plain Node scripts, e.g.
// the panorama image generator in `scripts/`.

export const PANORAMAS = [
  {
    id: 'living-room',
    label: 'Living Room',
    image: 'pano/living-room.png',
    position: { x: 0, y: 0 },
    orientation: 0,
    initial: { yaw: 0, pitch: -5, hfov: 100 },
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    image: 'pano/kitchen.png',
    position: { x: 10, y: 0 },
    orientation: 0,
    // Fresh load looks back toward the living room, making the spatial
    // arrangement immediately visible.
    initial: { yaw: 180, pitch: -5, hfov: 100 },
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    image: 'pano/bedroom.png',
    position: { x: 5, y: 8.66 },
    orientation: 0,
    // Fresh load looks back toward the living room.
    initial: { yaw: 240, pitch: -5, hfov: 100 },
  },
]

export const LINKS = [
  { from: 'living-room', to: 'kitchen' },
  { from: 'kitchen', to: 'living-room' },
  { from: 'living-room', to: 'bedroom' },
  { from: 'bedroom', to: 'living-room' },
  { from: 'kitchen', to: 'bedroom' },
  { from: 'bedroom', to: 'kitchen' },
]

export function panoramaById(id) {
  return PANORAMAS.find((p) => p.id === id)
}

// World yaw (degrees) of the direction from `from` to `to`.
export function worldYawBetween(from, to) {
  const dx = to.position.x - from.position.x
  const dy = to.position.y - from.position.y
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

// Yaw (degrees) of a link inside the source panorama's own frame.
export function linkYaw(link) {
  const from = panoramaById(link.from)
  const to = panoramaById(link.to)
  return worldYawBetween(from, to) - from.orientation
}

// Normalizes an angle to the [-180, 180) range.
export function normalizeYaw(yaw) {
  return ((yaw + 180) % 360 + 360) % 360 - 180
}

// View direction to use when arriving in `link.to` after traveling along
// `link`: the camera keeps facing the same world direction as the arrow the
// user clicked (the direction of travel), expressed in the target panorama's
// frame. With `orientation` 0 everywhere this equals linkYaw(link).
export function arrivalYaw(link) {
  const from = panoramaById(link.from)
  const to = panoramaById(link.to)
  return normalizeYaw(worldYawBetween(from, to) - to.orientation)
}