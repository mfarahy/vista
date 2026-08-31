/**
 * 2D debug visualization (Phase 7).
 *
 * Renders the processed geometry — walls, openings, detected rooms, kitchen
 * regions — as a single SVG document with distinct visual styles per
 * category, so geometry problems can be separated from 3D problems.
 *
 * The SVG uses y-up coordinates (the y axis is flipped), matching the 3D
 * model orientation.
 */

import { polygonArea, polygonCentroid } from './geometry.js';
import type { DetectedRoom, NormalizedFloorPlan } from './types.js';

export interface DebugSvgLabels {
  /** Label for a generic room, receives the 1-based index. */
  room: (index: number) => string;
  /** Label for the outside space (terrace, garden, …). */
  outside: string;
  /** Label for a room hinted as kitchen. */
  kitchen: string;
  /** Area suffix, e.g. " m²". */
  areaSuffix: string;
  walls: string;
  doors: string;
  entryDoors: string;
  windows: string;
  rooms: string;
  kitchenRegion: string;
  outsideSpace: string;
}

const defaultLabels: DebugSvgLabels = {
  room: (index) => `Room ${index}`,
  outside: 'Terrace / outside',
  kitchen: 'Kitchen',
  areaSuffix: ' m²',
  walls: 'Walls',
  doors: 'Doors',
  entryDoors: 'Entry doors',
  windows: 'Windows',
  rooms: 'Rooms',
  kitchenRegion: 'Kitchen region',
  outsideSpace: 'Outside space',
};

const ROOM_COLORS = [
  '#f9e7b3', // sand (living)
  '#cfe3cf', // sage (kitchen)
  '#c9daf0', // blue (bathroom)
  '#e3d3ec', // lavender (hallway)
  '#f2d1cf', // terracotta
  '#d6eadf', // mint
  '#f0d9e8', // rose
  '#dce4c9', // olive
];

const OUTSIDE_COLOR = '#e8e8e0';
const WALL_COLOR = '#5a5650';
const DOOR_COLOR = '#1f6fb2';
const ENTRY_DOOR_COLOR = '#0f4c81';
const WINDOW_COLOR = '#2fa8c9';
const KITCHEN_COLOR = '#9a6b2f';

function pointsAttr(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x.toFixed(1)},${(-p.y).toFixed(1)}`).join(' ');
}

function polygonElement(points: Array<{ x: number; y: number }>, attrs: Record<string, string>): string {
  const attr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<polygon ${attr} points="${pointsAttr(points)}"/>`;
}

function roomLabel(room: DetectedRoom, index: number, labels: DebugSvgLabels): string {
  const area = room.areaM2.toFixed(1);
  if (room.exterior) return `${labels.outside} · ${area}${labels.areaSuffix}`;
  if (room.hint === 'kitchen') return `${labels.kitchen} · ${area}${labels.areaSuffix}`;
  return `${labels.room(index)} · ${area}${labels.areaSuffix}`;
}

function legend(labels: DebugSvgLabels): string {
  const items: Array<[string, string]> = [
    [WALL_COLOR, labels.walls],
    [DOOR_COLOR, labels.doors],
    [ENTRY_DOOR_COLOR, labels.entryDoors],
    [WINDOW_COLOR, labels.windows],
    [ROOM_COLORS[0], labels.rooms],
    [KITCHEN_COLOR, labels.kitchenRegion],
    [OUTSIDE_COLOR, labels.outsideSpace],
  ];
  return items
    .map(
      ([color, text], i) =>
        `<rect x="12" y="12" width="12" height="12" rx="2" fill="${color}" stroke="#888" stroke-width="0.5"/>` +
        `<text x="30" y="${i * 16 + 22}" font-size="11" fill="#333">${text}</text>`,
    )
    .join('');
}

/**
 * Renders the normalized floor plan (walls, openings, rooms, kitchen
 * regions) as an SVG string. `labels` localizes the text; defaults are
 * English developer-facing names.
 */
export function renderDebugSvg(plan: NormalizedFloorPlan, labels: Partial<DebugSvgLabels> = {}): string {
  const l: DebugSvgLabels = { ...defaultLabels, ...labels };
  const b = plan.bounds;
  const pad = 30;
  const width = b.maxX - b.minX + pad * 2;
  const height = b.maxY - b.minY + pad * 2;

  const parts: string[] = [];

  // Outside space (terrace / surroundings) fills under everything else.
  for (const room of plan.rooms) {
    if (!room.exterior) continue;
    parts.push(polygonElement(room.polygon, { fill: OUTSIDE_COLOR, stroke: '#b8b4ac', 'stroke-width': '1' }));
  }

  // Rooms (interior) with labels.
  let roomIndex = 0;
  for (const room of plan.rooms) {
    if (room.exterior) continue;
    roomIndex += 1;
    const color = ROOM_COLORS[(roomIndex - 1) % ROOM_COLORS.length];
    parts.push(polygonElement(room.polygon, { fill: color, stroke: '#8a867e', 'stroke-width': '1' }));
    const c = polygonCentroid(room.polygon);
    const text = roomLabel(room, roomIndex, l);
    parts.push(
      `<text x="${c.x}" y="${-c.y}" font-size="12" font-weight="600" fill="#444" text-anchor="middle">${text}</text>`,
    );
  }

  // Recognized kitchen regions (dashed outline).
  for (const region of plan.kitchenRegions) {
    if (polygonArea(region) < 50) continue;
    parts.push(polygonElement(region, { fill: 'none', stroke: KITCHEN_COLOR, 'stroke-width': '2', 'stroke-dasharray': '6 4' }));
  }

  // Walls: thick strokes along the center lines.
  for (const wall of plan.walls) {
    const stroke = Math.max(wall.thickness, 2);
    parts.push(
      `<line x1="${wall.from.x}" y1="${-wall.from.y}" x2="${wall.to.x}" y2="${-wall.to.y}" stroke="${WALL_COLOR}" stroke-width="${stroke}" stroke-linecap="round"/>`,
    );
  }

  // Openings: door / entry door / window markers on top of the walls.
  for (const opening of plan.openings) {
    const color = opening.kind === 'window' ? WINDOW_COLOR : opening.kind === 'entry_door' ? ENTRY_DOOR_COLOR : DOOR_COLOR;
    const strokeWidth = opening.kind === 'window' ? 4 : 3;
    parts.push(
      `<line x1="${opening.from.x}" y1="${-opening.from.y}" x2="${opening.to.x}" y2="${-opening.to.y}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    );
    if (opening.kind !== 'window') {
      const mid = { x: (opening.from.x + opening.to.x) / 2, y: (opening.from.y + opening.to.y) / 2 };
      parts.push(`<circle cx="${mid.x}" cy="${-mid.y}" r="2.5" fill="${color}"/>`);
    }
  }

  // Coordinates are drawn as (x, -y); shift by bounds so the plan lands
  // inside the viewBox instead of the raw (possibly large) pixel offsets.
  const offsetX = pad - b.minX;
  const offsetY = pad + b.maxY;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#fafaf8"/>` +
    `<g transform="translate(${offsetX},${offsetY})">${parts.join('')}</g>` +
    `<g class="legend">${legend(l)}</g>` +
    '</svg>'
  );
}