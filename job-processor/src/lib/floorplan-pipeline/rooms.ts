/**
 * Room detection from wall geometry (Phase 3).
 *
 * Simple computational-geometry approach, no OCR/AI:
 *
 * 1. Rasterize the recognized wall/door/window polygons onto a binary grid
 *    (blocked space). Doors are treated as closed for detection purposes so
 *    every enclosed room becomes its own connected component.
 * 2. Flood-fill the free space from the grid border → "outside" region.
 * 3. Each remaining enclosed free component is a room candidate.
 * 4. Tiny components (furniture, stairs, noise) are removed.
 * 5. The component boundary is traced and simplified into a polygon.
 * 6. Openings are associated with the rooms on each of their two sides.
 */

import {
  cleanPolygon,
  dilateGrid,
  floodFill,
  pointInPolygon,
  polygonArea,
  rasterizePolygon,
  removeCollinear,
  simplifyPolygon,
  traceFreeRegionBoundary,
} from './geometry.js';
import type { DetectedRoom, NormalizedFloorPlan, Point } from './types.js';

/** Minimum room area (square pixels); smaller components are noise. */
const MIN_ROOM_AREA = 900;
/**
 * Grid dilation radius in pixels. The recognition model often leaves small
 * gaps between adjacent wall/door/window polygons (window piers, door
 * jambs); dilating the mask closes gaps up to twice this radius while doors
 * and windows stay blocked, so enclosed rooms remain separate components.
 */
const DILATE_RADIUS = 10;
/** Grid padding in pixels around the geometry bounds. */
const GRID_PADDING = 4;
/** Contour simplification epsilon in pixels. */
const SIMPLIFY_EPSILON = 2;

interface Grid {
  width: number;
  height: number;
  originX: number;
  originY: number;
  blocked: Uint8Array;
}

function buildGrid(plan: NormalizedFloorPlan, polygons: Point[][]): Grid {
  const b = plan.bounds;
  const pad = GRID_PADDING;
  const width = Math.max(1, Math.ceil(b.maxX - b.minX) + pad * 2);
  const height = Math.max(1, Math.ceil(b.maxY - b.minY) + pad * 2);
  const originX = b.minX - pad;
  const originY = b.minY - pad;
  const blocked = new Uint8Array(width * height);
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    const mask = rasterizePolygon(polygon, width, height, originX, originY);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) blocked[i] = 1;
    }
  }
  return { width, height, originX, originY, blocked };
}

/** All blocked polygons: walls, doors, entry doors and windows (not kitchen). */
function blockedPolygons(plan: NormalizedFloorPlan): Point[][] {
  return [
    ...plan.regions.wall,
    ...plan.regions.door,
    ...plan.regions.entry_door,
    ...plan.regions.window,
  ];
}

function roomAt(rooms: DetectedRoom[], point: Point): DetectedRoom | null {
  for (const room of rooms) {
    if (pointInPolygon(point, room.polygon)) return room;
  }
  return null;
}

/**
 * Probe distances (pixels) used to find the rooms flanking an opening or
 * wall. The first probe that lands in a room wins; the increasing distances
 * handle the dilated wall band and jagged wall outlines.
 */
const PROBE_DISTANCES = [DILATE_RADIUS + 2, DILATE_RADIUS + 6, DILATE_RADIUS + 12, DILATE_RADIUS + 24];

/** Rooms on each side of a centerline midpoint, probing along the normal. */
function flankingRooms(
  mid: Point,
  normal: Point,
  rooms: DetectedRoom[],
): Array<{ room: DetectedRoom; side: number }> {
  const found: Array<{ room: DetectedRoom; side: number }> = [];
  for (const side of [1, -1]) {
    for (const d of PROBE_DISTANCES) {
      const room = roomAt(rooms, { x: mid.x + normal.x * side * d, y: mid.y + normal.y * side * d });
      if (room) {
        if (!found.some((f) => f.side === side && f.room.id === room.id)) {
          found.push({ room, side });
        }
        break;
      }
    }
  }
  return found;
}

/** Samples a polygon at regular spacing and returns the sample points. */
function samplePolygon(polygon: Point[], step: number): Point[] {
  const samples: Point[] = [];
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      const p = { x, y };
      if (pointInPolygon(p, polygon)) samples.push(p);
    }
  }
  return samples;
}

/**
 * Detects rooms from the normalized wall geometry and fills `plan.rooms`.
 * Also associates openings with the rooms on their two sides and marks
 * exterior walls.
 */
export function detectRooms(plan: NormalizedFloorPlan): DetectedRoom[] {
  const grid = buildGrid(plan, blockedPolygons(plan));

  // Close hairline gaps between wall polygons (recognition noise).
  const closed = dilateGrid(grid.blocked, grid.width, grid.height, DILATE_RADIUS);
  // Free cells: the walkable space the rooms are made of.
  const free = new Uint8Array(grid.width * grid.height);
  for (let i = 0; i < free.length; i++) {
    if (closed[i] !== 1) free[i] = 1;
  }

  // The outside region: free cells connected to the grid border.
  const outside = new Uint8Array(grid.width * grid.height);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (x !== 0 && y !== 0 && x !== grid.width - 1 && y !== grid.height - 1) continue;
      if (closed[y * grid.width + x]) continue;
      if (outside[y * grid.width + x]) continue;
      const cells = floodFill(grid.blocked, grid.width, grid.height, x, y, closed);
      for (const cell of cells) outside[cell.y * grid.width + cell.x] = 1;
    }
  }

  // Free components = room candidates. Components connected to the grid
  // border (the outside region) become exterior rooms (terrace, garden, …).
  const visited = new Uint8Array(grid.width * grid.height);
  const rooms: DetectedRoom[] = [];
  const scaleSq = plan.options.pixelsPerMeter * plan.options.pixelsPerMeter;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const idx = y * grid.width + x;
      if (closed[idx] || visited[idx]) continue;
      const cells = floodFill(grid.blocked, grid.width, grid.height, x, y, closed);
      for (const cell of cells) visited[cell.y * grid.width + cell.x] = 1;
      if (cells.length < MIN_ROOM_AREA) continue;

      const contour = traceFreeRegionBoundary(free, grid.width, grid.height, x, y);
      if (contour.length < 4) continue;
      // The tracer returns grid coordinates; convert to world/pixel space.
      const worldContour = contour.map((p) => ({ x: p.x + grid.originX, y: p.y + grid.originY }));
      let polygon = simplifyPolygon(worldContour, SIMPLIFY_EPSILON);
      polygon = cleanPolygon(polygon, 1);
      polygon = removeCollinear(polygon, 2);
      if (polygon.length < 4) continue;

      const area = polygonArea(polygon);
      if (area < MIN_ROOM_AREA) continue;

      rooms.push({
        id: `room-${rooms.length}`,
        polygon,
        area,
        areaM2: area / scaleSq,
        exterior: cells.some((c) => outside[c.y * grid.width + c.x]),
        hint: null,
      });
    }
  }

  // Interior rooms first (largest first), exterior space last.
  rooms.sort((a, b) => (a.exterior === b.exterior ? b.area - a.area : a.exterior ? 1 : -1));

  // Kitchen hint: recognized kitchen regions overlap one room.
  for (const region of plan.kitchenRegions) {
    if (region.length < 3) continue;
    const regionSamples = samplePolygon(region, 10);
    if (regionSamples.length === 0) continue;
    let best: DetectedRoom | null = null;
    let bestRatio = 0;
    for (const room of rooms) {
      if (room.exterior) continue;
      let inside = 0;
      for (const p of regionSamples) {
        if (pointInPolygon(p, room.polygon)) inside += 1;
      }
      const ratio = inside / regionSamples.length;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = room;
      }
    }
    if (best && bestRatio > 0.5) best.hint = 'kitchen';
  }

  // Associate openings with the rooms on each side.
  for (const opening of plan.openings) {
    const mid = { x: (opening.from.x + opening.to.x) / 2, y: (opening.from.y + opening.to.y) / 2 };
    const dx = opening.to.x - opening.from.x;
    const dy = opening.to.y - opening.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / len, y: dx / len };
    for (const { room } of flankingRooms(mid, normal, rooms)) {
      if (!opening.roomIds.includes(room.id)) opening.roomIds.push(room.id);
    }
  }

  // Mark exterior walls: a wall is interior when at least one of its two
  // sides borders an interior room; otherwise it separates the interior from
  // the outside (or the grid border).
  for (const wall of plan.walls) {
    const dx = wall.to.x - wall.from.x;
    const dy = wall.to.y - wall.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / len, y: dy / len };
    const mid = { x: (wall.from.x + wall.to.x) / 2, y: (wall.from.y + wall.to.y) / 2 };
    const flanking = flankingRooms(mid, normal, rooms);
    wall.exterior = !flanking.some(({ room }) => !room.exterior);
  }

  plan.rooms = rooms;
  return rooms;
}