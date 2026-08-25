// Isolated 360 viewer preview — in-memory panorama data.
// Typed port of the standalone prototype's `360/src/panoramas.js`.
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
// the two positions, so the navigation arrows and the arrival view direction
// stay consistent.
//
// `image` is an absolute URL under the app's `/public`, because the preview
// page lives at `/360` and Pannellum resolves scene panoramas against the
// current page URL.

export type PanoramaId = 'living-room' | 'kitchen' | 'bedroom';

export type PanoramaPosition = { x: number; y: number };

export type Panorama = {
  id: PanoramaId;
  label: string;
  image: string;
  position: PanoramaPosition;
  orientation: number;
  initial: { yaw: number; pitch: number; hfov: number };
};

export type PanoramaLink = { from: PanoramaId; to: PanoramaId };

export const PANORAMAS: Panorama[] = [
  {
    id: 'living-room',
    label: 'Living Room',
    image: '/vista-360/pano/living-room.png',
    position: { x: 0, y: 0 },
    orientation: 0,
    initial: { yaw: 0, pitch: -5, hfov: 100 },
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    image: '/vista-360/pano/kitchen.png',
    position: { x: 10, y: 0 },
    orientation: 0,
    // Fresh load looks back toward the living room, making the spatial
    // arrangement immediately visible.
    initial: { yaw: 180, pitch: -5, hfov: 100 },
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    image: '/vista-360/pano/bedroom.png',
    position: { x: 5, y: 8.66 },
    orientation: 0,
    // Fresh load looks back toward the living room.
    initial: { yaw: 240, pitch: -5, hfov: 100 },
  },
];

export const LINKS: PanoramaLink[] = [
  { from: 'living-room', to: 'kitchen' },
  { from: 'kitchen', to: 'living-room' },
  { from: 'living-room', to: 'bedroom' },
  { from: 'bedroom', to: 'living-room' },
  { from: 'kitchen', to: 'bedroom' },
  { from: 'bedroom', to: 'kitchen' },
];

export function panoramaById(id: string | undefined): Panorama | undefined {
  return PANORAMAS.find((p) => p.id === id);
}

// World yaw (degrees) of the direction from `from` to `to`.
export function worldYawBetween(from: Panorama, to: Panorama): number {
  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// Yaw (degrees) of a link inside the source panorama's own frame.
export function linkYaw(link: PanoramaLink): number {
  const from = panoramaById(link.from);
  const to = panoramaById(link.to);
  if (!from || !to) return 0;
  return worldYawBetween(from, to) - from.orientation;
}

// Normalizes an angle to the [-180, 180) range.
export function normalizeYaw(yaw: number): number {
  return ((yaw + 180) % 360 + 360) % 360 - 180;
}

// View direction to use when arriving in `link.to` after traveling along
// `link`: face back toward the panorama the user came from, expressed in the
// target panorama's frame. This keeps the entry doorway in view.
export function arrivalYaw(link: PanoramaLink): number {
  const from = panoramaById(link.from);
  const to = panoramaById(link.to);
  if (!from || !to) return 0;
  return normalizeYaw(worldYawBetween(to, from) - to.orientation);
}