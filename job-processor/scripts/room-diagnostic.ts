/**
 * Diagnostic report for room/topology validation (task: "Validate Room
 * Topology and Floor Geometry"). Prints per-room geometry, adjacency and
 * aggregate stats, and writes a debug SVG next to the fixture.
 *
 * Usage: npx tsx scripts/room-diagnostic.ts <recognition.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runFloorplanPipeline } from '../src/lib/floorplan-pipeline/index.js';
import { pointInPolygon, polygonArea, polygonBounds, polygonCentroid } from '../src/lib/floorplan-pipeline/geometry.js';

const input = process.argv[2] ?? 'src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json';
const geometry = JSON.parse(readFileSync(resolve(input), 'utf8'));
const result = runFloorplanPipeline(geometry);
const { normalized } = result;

function overlapsPolygon(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  const step = 8;
  const bnds = polygonBounds(a);
  for (let y = bnds.minY; y <= bnds.maxY; y += step) {
    for (let x = bnds.minX; x <= bnds.maxX; x += step) {
      const p = { x, y };
      if (pointInPolygon(p, a) && pointInPolygon(p, b)) return true;
    }
  }
  return false;
}

console.log(`=== Fixture: ${input} ===`);
console.log(`Image bounds (px): x[${normalized.bounds.minX.toFixed(0)},${normalized.bounds.maxX.toFixed(0)}] y[${normalized.bounds.minY.toFixed(0)},${normalized.bounds.maxY.toFixed(0)}]`);
console.log(`Walls: ${normalized.walls.length}, Openings: ${normalized.openings.length} (doors=${normalized.openings.filter((o) => o.kind === 'door').length}, entry=${normalized.openings.filter((o) => o.kind === 'entry_door').length}, windows=${normalized.openings.filter((o) => o.kind === 'window').length})`);
console.log(`Kitchen regions (raw): ${normalized.kitchenRegions.length}`);
console.log(`Rooms detected: ${normalized.rooms.length}\n`);

let totalInterior = 0;
let totalExterior = 0;

for (const room of normalized.rooms) {
  const b = polygonBounds(room.polygon);
  const c = polygonCentroid(room.polygon);
  const touchesBoundary =
    Math.abs(b.minX - normalized.bounds.minX) < 3 ||
    Math.abs(b.minY - normalized.bounds.minY) < 3 ||
    Math.abs(b.maxX - normalized.bounds.maxX) < 3 ||
    Math.abs(b.maxY - normalized.bounds.maxY) < 3;
  const kitchenOverlap = normalized.kitchenRegions.some((k) => k.length >= 3 && overlapsPolygon(room.polygon, k));
  const doors = normalized.openings.filter((o) => o.kind !== 'window' && o.roomIds.includes(room.id));
  const adjacentRooms = new Set<string>();
  for (const d of doors) {
    for (const rid of d.roomIds) if (rid !== room.id) adjacentRooms.add(rid);
  }

  if (room.exterior) totalExterior += room.area;
  else totalInterior += room.area;

  console.log(`--- ${room.id} ${room.exterior ? '[EXTERIOR]' : ''}${room.hint ? ` [hint=${room.hint}]` : ''} ---`);
  console.log(`  area: ${room.area.toFixed(0)}px2 / ${room.areaM2.toFixed(1)}m2`);
  console.log(`  bbox: x[${b.minX.toFixed(0)},${b.maxX.toFixed(0)}] y[${b.minY.toFixed(0)},${b.maxY.toFixed(0)}]`);
  console.log(`  centroid: (${c.x.toFixed(0)}, ${c.y.toFixed(0)})`);
  console.log(`  touchesImageBoundary: ${touchesBoundary}`);
  console.log(`  overlapsKitchenRegion: ${kitchenOverlap}`);
  console.log(`  doors: ${doors.map((d) => d.id).join(', ') || '(none)'}`);
  console.log(`  adjacentRooms: ${[...adjacentRooms].join(', ') || '(none)'}`);
  console.log(`  polygon (${room.polygon.length} pts): ${room.polygon.map((p) => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' ')}`);
  console.log('');
}

console.log('=== Aggregate ===');
console.log(`Total interior area: ${totalInterior.toFixed(0)}px2 / ${(totalInterior / (normalized.options.pixelsPerMeter ** 2)).toFixed(1)}m2`);
console.log(`Total exterior area: ${totalExterior.toFixed(0)}px2 / ${(totalExterior / (normalized.options.pixelsPerMeter ** 2)).toFixed(1)}m2`);
console.log(`Room count: ${normalized.rooms.length} (interior=${normalized.rooms.filter((r) => !r.exterior).length}, exterior=${normalized.rooms.filter((r) => r.exterior).length})`);

let adjacencyEdges = 0;
const seenPairs = new Set<string>();
for (const o of normalized.openings) {
  if (o.kind === 'window') continue;
  if (o.roomIds.length < 2) continue;
  const key = [...o.roomIds].sort().join('|');
  if (seenPairs.has(key)) continue;
  seenPairs.add(key);
  adjacencyEdges += 1;
}
console.log(`Room adjacency connections (via doors): ${adjacencyEdges}`);

const outPath = resolve(input.replace(/\.json$/, '') + '.debug.svg');
writeFileSync(outPath, result.debugSvg, 'utf8');
console.log(`\nDebug SVG written to: ${outPath}`);
