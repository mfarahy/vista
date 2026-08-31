/**
 * Temporary debugging script (Step 1/3/10 of the 3D reconstruction trace).
 * Prints normalized wall runs and 3D model wall segments with full
 * coordinates, plus bounding boxes at each pipeline stage.
 *
 * Usage: npx tsx scripts/trace-geometry.ts <recognition.json>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runFloorplanPipeline } from '../src/lib/floorplan-pipeline/index.js';

const input = process.argv[2] ?? 'src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json';
const geometry = JSON.parse(readFileSync(resolve(input), 'utf8'));
const result = runFloorplanPipeline(geometry);

console.log('=== STEP 1: normalized wall runs ===');
for (const w of result.normalized.walls) {
  const dx = w.to.x - w.from.x;
  const dy = w.to.y - w.from.y;
  const len = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const axisAligned = Math.abs(dx) < 1 || Math.abs(dy) < 1;
  console.log(
    `${w.id}: from=(${w.from.x.toFixed(1)},${w.from.y.toFixed(1)}) to=(${w.to.x.toFixed(1)},${w.to.y.toFixed(1)}) ` +
      `len=${len.toFixed(1)} thick=${w.thickness.toFixed(1)} angle=${angleDeg.toFixed(1)}deg ${axisAligned ? 'AXIS' : '*** DIAGONAL ***'}` +
      `${w.exterior ? ' exterior' : ''}`,
  );
}

console.log('\n=== STEP 3: 3D model wall segments ===');
for (const w of result.model3d.walls) {
  const dx = w.to.x - w.from.x;
  const dy = w.to.y - w.from.y;
  const len = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  console.log(
    `${w.id}: 2D(x,z)=(${w.from.x.toFixed(2)},${w.from.y.toFixed(2)})->(${w.to.x.toFixed(2)},${w.to.y.toFixed(2)}) ` +
      `len=${len.toFixed(2)}m thick=${w.thickness.toFixed(2)}m height=${w.height.toFixed(2)}m angle=${angleDeg.toFixed(1)}deg`,
  );
}

function bounds(points: Array<{ x: number; y: number }>) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

console.log('\n=== STEP 10: bounding boxes per stage ===');
const srcB = result.normalized.bounds;
console.log(`Source/normalized bounds (px): x[${srcB.minX.toFixed(0)},${srcB.maxX.toFixed(0)}] y[${srcB.minY.toFixed(0)},${srcB.maxY.toFixed(0)}] ` +
  `width=${(srcB.maxX - srcB.minX).toFixed(0)}px height=${(srcB.maxY - srcB.minY).toFixed(0)}px aspect=${((srcB.maxX - srcB.minX) / (srcB.maxY - srcB.minY)).toFixed(3)}`);

const wallPts3d = result.model3d.walls.flatMap((w) => [w.from, w.to]);
const b3d = bounds(wallPts3d);
console.log(`3D model wall bounds (m): x[${b3d.minX.toFixed(2)},${b3d.maxX.toFixed(2)}] z[${b3d.minY.toFixed(2)},${b3d.maxY.toFixed(2)}] ` +
  `width=${(b3d.maxX - b3d.minX).toFixed(2)}m depth=${(b3d.maxY - b3d.minY).toFixed(2)}m aspect=${((b3d.maxX - b3d.minX) / (b3d.maxY - b3d.minY)).toFixed(3)}`);

const diagonalWalls = result.normalized.walls.filter((w) => {
  const dx = w.to.x - w.from.x;
  const dy = w.to.y - w.from.y;
  const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  return angle > 3 && angle < 87; // more than 3deg off horizontal/vertical
});
console.log(`\nTruly diagonal (>3deg off axis) normalized walls: ${diagonalWalls.length} / ${result.normalized.walls.length}`);

console.log('\n=== Openings vs host wall orientation ===');
const wallById = new Map(result.normalized.walls.map((w) => [w.id, w]));
for (const o of result.normalized.openings) {
  const odx = o.to.x - o.from.x;
  const ody = o.to.y - o.from.y;
  const oAngle = (Math.atan2(ody, odx) * 180) / Math.PI;
  const wall = o.wallId ? wallById.get(o.wallId) : undefined;
  let wAngle: number | null = null;
  let diff: number | null = null;
  if (wall) {
    const wdx = wall.to.x - wall.from.x;
    const wdy = wall.to.y - wall.from.y;
    wAngle = (Math.atan2(wdy, wdx) * 180) / Math.PI;
    diff = Math.abs(((oAngle - wAngle + 540) % 360) - 180);
  }
  console.log(
    `${o.id} (${o.kind}): from=(${o.from.x.toFixed(1)},${o.from.y.toFixed(1)}) to=(${o.to.x.toFixed(1)},${o.to.y.toFixed(1)}) ` +
      `oAngle=${oAngle.toFixed(1)}deg wall=${o.wallId} wAngle=${wAngle?.toFixed(1) ?? 'n/a'}deg diff=${diff?.toFixed(1) ?? 'n/a'}deg` +
      `${diff !== null && diff > 5 ? ' *** MISMATCH ***' : ''}`,
  );
}

console.log('\n=== 3D model openings (doors/windows) rotation ===');
for (const d of [...result.model3d.doors, ...result.model3d.windows]) {
  console.log(`${d.id}: pos=(${d.x.toFixed(2)},${d.y.toFixed(2)}) width=${d.width.toFixed(2)} height=${d.height.toFixed(2)} rotation=${((d.rotation * 180) / Math.PI).toFixed(1)}deg`);
}
