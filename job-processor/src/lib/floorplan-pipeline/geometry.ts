/**
 * Small computational-geometry helpers used by the floor-plan pipeline.
 * Deliberately dependency-free and kept simple for the MVP.
 */

import type { Point } from './types.js';

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Signed area (shoelace). Positive for clockwise point order in y-down space. */
export function polygonSignedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(polygonSignedArea(points));
}

export function polygonCentroid(points: Point[]): Point {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
    area += cross;
  }
  if (area === 0) {
    const n = points.length;
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

export function polygonBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Ramer–Douglas–Peucker simplification. `epsilon` is the maximum allowed
 * deviation in pixels. Always keeps the first point.
 */
export function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 3) return points.slice();
  const kept = new Uint8Array(points.length);
  kept[0] = 1;
  kept[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      kept[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }

  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (kept[i]) result.push(points[i]);
  }
  return result;
}

/** Removes duplicate consecutive points and points closer than `minDist` to their successor. */
export function cleanPolygon(points: Point[], minDist = 0.5): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || distance(prev, p) >= minDist) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && distance(first, last) < minDist) out.pop();
  return out;
}

/** Removes collinear intermediate points (angle deviation below `epsilonDeg`). */
export function removeCollinear(points: Point[], epsilonDeg = 2): Point[] {
  if (points.length < 4) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const v1 = { x: b.x - a.x, y: b.y - a.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    if (len1 > 0 && len2 > 0) {
      const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
      const angleDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
      if (angleDeg >= epsilonDeg) out.push(b);
    } else {
      out.push(b);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Scanline rasterization of a polygon onto a boolean grid (false = outside). */
export function rasterizePolygon(
  polygon: Point[],
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originY: number,
): Uint8Array {
  const grid = new Uint8Array(gridWidth * gridHeight);
  const minY = Math.floor(Math.min(...polygon.map((p) => p.y)) - originY);
  const maxY = Math.ceil(Math.max(...polygon.map((p) => p.y)) - originY);
  const n = polygon.length;

  for (let gy = Math.max(0, minY); gy <= Math.min(gridHeight - 1, maxY); gy++) {
    const y = gy + originY + 0.5;
    const crossings: number[] = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (a.y > y === b.y > y) continue;
      const x = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
      crossings.push(x);
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const x0 = Math.max(0, Math.floor(crossings[k] - originX));
      const x1 = Math.min(gridWidth - 1, Math.ceil(crossings[k + 1] - originX));
      for (let gx = x0; gx <= x1; gx++) grid[gy * gridWidth + gx] = 1;
    }
  }
  return grid;
}

/**
 * Traces the boundary of a connected component on a grid (Moore tracing).
 */
export function traceContour(grid: Uint8Array, gridWidth: number, gridHeight: number, startX: number, startY: number): Point[] {
  // Moore-neighbor offsets (clockwise from the pixel above).
  const dirs = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ];
  const inside = (x: number, y: number) => x >= 0 && x < gridWidth && y >= 0 && y < gridHeight && grid[y * gridWidth + x] === 1;

  // Find the topmost-leftmost pixel of the component to start at.
  let startX0 = -1;
  let startY0 = -1;
  for (let y = startY; y < gridHeight; y++) {
    for (let x = y === startY ? startX : 0; x < gridWidth; x++) {
      if (inside(x, y)) {
        startX0 = x;
        startY0 = y;
        break;
      }
    }
    if (startX0 >= 0) break;
  }
  if (startX0 < 0) return [];

  const contour: Point[] = [];
  let cx = startX0;
  let cy = startY0;
  let dir = 0; // start scanning from the top neighbor
  let guard = 0;
  const maxSteps = gridWidth * gridHeight * 8 + 1024;

  do {
    contour.push({ x: cx + 0.5, y: cy + 0.5 });
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (dir + i) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (inside(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = (d + 5) % 8; // continue from the previous neighbor
        found = true;
        break;
      }
    }
    if (!found) break;
    guard++;
  } while ((cx !== startX0 || cy !== startY0) && guard < maxSteps);

  return contour;
}

/**
 * Traces the outer boundary of a connected FREE region (cells where
 * `free === 1`) as an oriented edge chain: every free cell that touches a
 * blocked 4-neighbor contributes the shared edge, oriented so the free cell
 * lies to the left. Chaining the edges yields closed loops; the loop with
 * the largest area (the outer boundary) is returned as a polygon in grid
 * coordinates. 4-connectivity matches `floodFill`, so boundaries are simple
 * edge loops without diagonal ambiguities.
 */
export function traceFreeRegionBoundary(
  free: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  startX: number,
  startY: number,
): Point[] {
  const isFree = (x: number, y: number) => x >= 0 && y >= 0 && x < gridWidth && y < gridHeight && free[y * gridWidth + x] === 1;

  // Topmost-leftmost free pixel of the component containing (startX, startY).
  let startX0 = -1;
  let startY0 = -1;
  for (let y = startY; y < gridHeight; y++) {
    for (let x = y === startY ? startX : 0; x < gridWidth; x++) {
      if (isFree(x, y)) {
        startX0 = x;
        startY0 = y;
        break;
      }
    }
    if (startX0 >= 0) break;
  }
  if (startX0 < 0) return [];

  // Collect oriented boundary edges for the whole component (cells reachable
  // via 4-connectivity), so nested loops (holes) are handled as well.
  const cells: Array<[number, number]> = [[startX0, startY0]];
  const seen = new Uint8Array(gridWidth * gridHeight);
  seen[startY0 * gridWidth + startX0] = 1;
  // Each edge: [ax, ay, bx, by] with the free cell on the left.
  const edges: Array<[number, number, number, number]> = [];

  for (let head = 0; head < cells.length; head++) {
    const [cx, cy] = cells[head];
    const neighbors: Array<[number, number]> = [
      [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      const blocked = !isFree(nx, ny);
      if (blocked) {
        // The shared edge between (cx,cy) and (nx,ny), oriented with the
        // free cell on the left.
        if (nx === cx + 1) edges.push([cx + 1, cy, cx + 1, cy + 1]); // free west of vertical edge, walk down
        else if (nx === cx - 1) edges.push([cx, cy + 1, cx, cy]); // free east, walk up
        else if (ny === cy - 1) edges.push([cx, cy, cx + 1, cy]); // free south, walk right
        else edges.push([cx + 1, cy + 1, cx, cy + 1]); // free north, walk left
      } else if (!seen[ny * gridWidth + nx]) {
        seen[ny * gridWidth + nx] = 1;
        cells.push([nx, ny]);
      }
    }
  }

  if (edges.length === 0) return [];

  // Chain edges into closed loops by matching corners.
  const used = new Uint8Array(edges.length);
  const loops: Point[][] = [];
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    const loop: Point[] = [];
    let e = i;
    let guard = 0;
    while (guard < edges.length + 1) {
      used[e] = 1;
      const [ax, ay, bx, by] = edges[e];
      loop.push({ x: ax, y: ay });
      const endKey = `${bx},${by}`;
      let next = -1;
      for (let j = 0; j < edges.length; j++) {
        if (used[j]) continue;
        if (`${edges[j][0]},${edges[j][1]}` === endKey) {
          next = j;
          break;
        }
      }
      if (next < 0) break;
      e = next;
      guard++;
    }
    if (loop.length >= 3) loops.push(loop);
  }

  // The outer boundary is the loop with the largest absolute area.
  let best = loops[0] ?? [];
  let bestArea = -Infinity;
  for (const loop of loops) {
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area > bestArea) {
      bestArea = area;
      best = loop;
    }
  }
  return best;
}

/**
 * Morphological dilation of a binary grid. `radius` extra cells are added
 * around every filled cell, closing hairline gaps between walls.
 */
export function dilateGrid(grid: Uint8Array, gridWidth: number, gridHeight: number, radius: number): Uint8Array {
  if (radius <= 0) return grid;
  const out = new Uint8Array(gridWidth * gridHeight);
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (grid[y * gridWidth + x] !== 1) continue;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(gridWidth - 1, x + radius);
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(gridHeight - 1, y + radius);
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          out[ny * gridWidth + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** Flood fill from `start` over free cells (value 0). Returns visited cells. */
export function floodFill(
  grid: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  startX: number,
  startY: number,
  blocked: Uint8Array,
): Array<{ x: number; y: number }> {
  const visited = new Uint8Array(gridWidth * gridHeight);
  const queue: Array<[number, number]> = [[startX, startY]];
  const cells: Array<{ x: number; y: number }> = [];
  visited[startY * gridWidth + startX] = 1;
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    cells.push({ x, y });
    const neighbors: Array<[number, number]> = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue;
      const idx = ny * gridWidth + nx;
      if (visited[idx] || blocked[idx]) continue;
      visited[idx] = 1;
      queue.push([nx, ny]);
    }
  }
  return cells;
}