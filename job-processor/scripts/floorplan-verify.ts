/**
 * Deterministic verification: SOURCE overlay vs NORMALIZED 2D vs 3D TOP-DOWN
 * per the geometry verification spec.
 *
 * Usage:
 *   npx tsx scripts/floorplan-verify.ts [fixture.json] [source.jpg] [output.html]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { normalizeGeometry } from '../src/lib/floorplan-pipeline/normalize.js';
import { detectRooms } from '../src/lib/floorplan-pipeline/rooms.js';
import { buildFloorPlan3DModel } from '../src/lib/floorplan-pipeline/model3d.js';
import { renderDebugSvg } from '../src/lib/floorplan-pipeline/svg.js';
import { polygonArea, polygonCentroid } from '../src/lib/floorplan-pipeline/geometry.js';
import type { RecognitionGeometry, WallRun } from '../src/lib/floorplan-pipeline/types.js';

const fixturePath = resolve(process.argv[2] ?? 'src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json');
const imagePath = resolve(process.argv[3] ?? '../sample/c658e915-9247-4904-8032-717dd11ecfdd.jpg');
const outputPath = resolve(process.argv[4] ?? 'floorplan-verify.html');

const geometry: RecognitionGeometry = JSON.parse(readFileSync(fixturePath, 'utf8'));
const plan = normalizeGeometry(geometry, 50);
detectRooms(plan);
const model = buildFloorPlan3DModel(plan);
const debugSvg = renderDebugSvg(plan);

// --- image handling ---
let imageBase64 = '';
let imageW = 1500;
let imageH = 1060;
try {
  const buf = readFileSync(imagePath);
  imageBase64 = buf.toString('base64');
  // parse JPEG SOF marker for dimensions
  for (let i = 0; i < buf.length - 8; i++) {
    if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
      imageH = (buf[i + 5] << 8) | buf[i + 6];
      imageW = (buf[i + 7] << 8) | buf[i + 8];
      break;
    }
  }
} catch (e) {
  console.warn('Could not read image', imagePath, e);
}

// --- helper: wall geometry ---
function wallLength(w: WallRun) {
  return Math.hypot(w.to.x - w.from.x, w.to.y - w.from.y);
}
function endpointDistance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

// === STEP 3: Exterior shell validation ===
console.log('=== STEP 3: EXTERIOR SHELL VALIDATION ===');
for (const w of plan.walls) {
  const len = wallLength(w);
  const exterior = w.exterior;
  // Check touches/intersects another exterior wall
  let touchesExterior = false;
  let minDist = Infinity;
  let nearestId = '';
  for (const other of plan.walls) {
    if (other.id === w.id) continue;
    // distance between any endpoint pair
    const d1 = endpointDistance(w.from.x, w.from.y, other.from.x, other.from.y);
    const d2 = endpointDistance(w.from.x, w.from.y, other.to.x, other.to.y);
    const d3 = endpointDistance(w.to.x, w.to.y, other.from.x, other.from.y);
    const d4 = endpointDistance(w.to.x, w.to.y, other.to.x, other.to.y);
    const d = Math.min(d1, d2, d3, d4);
    if (d < minDist) {
      minDist = d;
      nearestId = other.id;
    }
    if (other.exterior && d < 8) touchesExterior = true;
  }
  console.log(`  ${w.id}: (${w.from.x.toFixed(0)},${w.from.y.toFixed(0)}) -> (${w.to.x.toFixed(0)},${w.to.y.toFixed(0)}) len=${len.toFixed(0)} thick=${w.thickness.toFixed(1)} exterior=${exterior} touchesExterior=${touchesExterior} nearest=${nearestId} dist=${minDist.toFixed(1)}`);
}

// === STEP 4: Wall connectivity graph ===
console.log('\n=== STEP 4: WALL CONNECTIVITY GRAPH ===');
const TOL = 8; // configured geometric tolerance
const n = plan.walls.length;
const adj: number[][] = Array.from({ length: n }, () => []);
for (let i = 0; i < n; i++) {
  for (let j = i + 1; j < n; j++) {
    const a = plan.walls[i];
    const b = plan.walls[j];
    const d1 = endpointDistance(a.from.x, a.from.y, b.from.x, b.from.y);
    const d2 = endpointDistance(a.from.x, a.from.y, b.to.x, b.to.y);
    const d3 = endpointDistance(a.to.x, a.to.y, b.from.x, b.from.y);
    const d4 = endpointDistance(a.to.x, a.to.y, b.to.x, b.to.y);
    const minD = Math.min(d1, d2, d3, d4);
    if (minD <= TOL) {
      adj[i].push(j);
      adj[j].push(i);
    }
  }
}
const visited = new Array(n).fill(false);
const components: number[][] = [];
for (let i = 0; i < n; i++) {
  if (visited[i]) continue;
  const stack = [i];
  visited[i] = true;
  const comp: number[] = [];
  while (stack.length) {
    const u = stack.pop()!;
    comp.push(u);
    for (const v of adj[u]) if (!visited[v]) { visited[v] = true; stack.push(v); }
  }
  components.push(comp);
}
console.log(`  Tolerance: ${TOL}px`);
console.log(`  Walls: ${n}, Components: ${components.length}`);
components
  .sort((a, b) => b.length - a.length)
  .forEach((comp, idx) => {
    const walls = comp.map(i => plan.walls[i].id).join(', ');
    const totalLen = comp.reduce((s, i) => s + wallLength(plan.walls[i]), 0);
    console.log(`  Component ${idx + 1}: ${comp.length} walls, totalLen=${totalLen.toFixed(0)}px -> [${walls}]`);
    // also list if any exterior walls in component
    const exteriors = comp.filter(i => plan.walls[i].exterior).map(i => plan.walls[i].id);
    if (exteriors.length) console.log(`    contains exterior: ${exteriors.join(', ')}`);
  });
if (components.length > 1) {
  console.log('  ISOLATED COMPONENTS:');
  for (let idx = 0; idx < components.length; idx++) {
    const comp = components[idx];
    if (comp.length === 1) {
      const w = plan.walls[comp[0]];
      console.log(`    Isolated ${w.id}: (${w.from.x.toFixed(0)},${w.from.y.toFixed(0)})->(${w.to.x.toFixed(0)},${w.to.y.toFixed(0)}) len=${wallLength(w).toFixed(0)} exterior=${w.exterior}`);
    }
  }
}

// === STEP 9: Coordinate transformation verification ===
console.log('\n=== STEP 9: COORDINATE TRANSFORMATION (2D -> 3D) ===');
const scale = plan.options.pixelsPerMeter;
const cx = (plan.bounds.minX + plan.bounds.maxX) / 2;
const cy = (plan.bounds.minY + plan.bounds.maxY) / 2;
console.log(`  scale=${scale} ppm, center=(${cx.toFixed(1)},${cy.toFixed(1)}), bounds=[${plan.bounds.minX},${plan.bounds.minY}]-[${plan.bounds.maxX},${plan.bounds.maxY}]`);
console.log('  Expected: floorplan X -> Three.js X, floorplan Y -> Three.js Z (via model y), height -> Three.js Y');
for (const w of plan.walls.slice(0, 5)) {
  const fromM = { x: (w.from.x - cx) / scale, y: (w.from.y - cy) / scale };
  const toM = { x: (w.to.x - cx) / scale, y: (w.to.y - cy) / scale };
  console.log(`  ${w.id}: 2D (${w.from.x.toFixed(0)},${w.from.y.toFixed(0)})->(${w.to.x.toFixed(0)},${w.to.y.toFixed(0)}) => 3D (X=${fromM.x.toFixed(3)},Z=${fromM.y.toFixed(3)})->(X=${toM.x.toFixed(3)},Z=${toM.y.toFixed(3)})`);
  // Find corresponding model wall
  const mws = model.walls.filter(mw => mw.id.startsWith(w.id + '-'));
  for (const mw of mws) {
    const dx2d = w.to.x - w.from.x;
    const dy2d = w.to.y - w.from.y;
    const dx3d = mw.to.x - mw.from.x;
    const dz3d = mw.to.y - mw.from.y;
    const len2d = Math.hypot(dx2d, dy2d) / scale;
    const len3d = Math.hypot(dx3d, dz3d);
    const match = Math.abs(len2d - len3d) < 0.05 ? 'OK' : 'MISMATCH';
    console.log(`    -> model ${mw.id}: len2d=${len2d.toFixed(3)}m len3d=${len3d.toFixed(3)}m ${match}`);
  }
}

// === STEP 10: wall dimensions ===
console.log('\n=== STEP 10: WALL DIMENSIONS (length/thickness/height) ===');
for (const mw of model.walls) {
  const len = Math.hypot(mw.to.x - mw.from.x, mw.to.y - mw.from.y);
  const isHorizontal = Math.abs(mw.to.y - mw.from.y) < 0.01; // dy small means horizontal in 3D X
  const isVertical = Math.abs(mw.to.x - mw.from.x) < 0.01;
  const orientation = isHorizontal ? 'H (long X, thick Z)' : isVertical ? 'V (thick X, long Z)' : 'diagonal';
  // check thickness not swapped with length
  if (mw.thickness > len) {
    console.log(`  WARN ${mw.id}: thickness ${mw.thickness.toFixed(3)} > length ${len.toFixed(3)} -> POSSIBLE SWAP! ${orientation}`);
  } else {
    // only log diagonal or suspicious
    if (orientation === 'diagonal') console.log(`  ${mw.id}: len=${len.toFixed(2)} thick=${mw.thickness.toFixed(2)} height=${mw.height} ${orientation}`);
  }
}
console.log(`  Total model walls: ${model.walls.length}, all heights=${model.walls[0]?.height ?? 'N/A'}`);

// === STEP 11: floors ===
console.log('\n=== STEP 11: FLOOR VERIFICATION ===');
for (let i = 0; i < plan.rooms.length; i++) {
  const r = plan.rooms[i];
  const m = model.rooms[i];
  if (!m) continue;
  const areaDiff = Math.abs(r.areaM2 - m.areaM2);
  const pts2d = r.polygon.length;
  const pts3d = m.points.length;
  const c2d = polygonCentroid(r.polygon);
  const c3d = { x: (c2d.x - cx) / scale, y: (c2d.y - cy) / scale };
  console.log(`  ${r.id} (${r.exterior ? 'exterior' : r.hint ?? 'room'}): 2D pts=${pts2d} area=${r.areaM2.toFixed(1)}m2 centroid=(${c2d.x.toFixed(0)},${c2d.y.toFixed(0)}) -> 3D pts=${pts3d} area=${m.areaM2.toFixed(1)}m2 centroidM=(${m.x.toFixed(2)},${m.y.toFixed(2)}) expectedM=(${c3d.x.toFixed(2)},${c3d.y.toFixed(2)}) diff=${areaDiff.toFixed(2)} ${pts2d === pts3d ? 'pts OK' : 'PTS MISMATCH'} ${areaDiff < 1 ? 'area OK' : 'AREA MISMATCH'}`);
}

// === STEP 12: Detached wall investigation ===
console.log('\n=== STEP 12: DETACHED WALL INVESTIGATION ===');
// Find rightmost walls (x > 900) that are suspicious
const rightmost = plan.walls.filter(w => Math.max(w.from.x, w.to.x) > 900);
console.log(`  Walls with maxX > 900: ${rightmost.length}`);
for (const w of rightmost) {
  console.log(`    ${w.id}: (${w.from.x.toFixed(0)},${w.from.y.toFixed(0)})->(${w.to.x.toFixed(0)},${w.to.y.toFixed(0)}) len=${wallLength(w).toFixed(0)} thick=${w.thickness.toFixed(1)} exterior=${w.exterior} polyArea=${polygonArea(w.polygon).toFixed(0)}`);
  // trace source polygon: which original wall polygon generated it? w.polygon is the source
  const b = { minX: Math.min(...w.polygon.map(p=>p.x)), maxX: Math.max(...w.polygon.map(p=>p.x)), minY: Math.min(...w.polygon.map(p=>p.y)), maxY: Math.max(...w.polygon.map(p=>p.y)) };
  console.log(`      source polygon bounds: [${b.minX},${b.minY}]-[${b.maxX},${b.maxY}] size ${b.maxX-b.minX}x${b.maxY-b.minY}`);
}

// === Overall summary for source overlay correctness ===
console.log('\n=== BOUNDS SUMMARY ===');
console.log(`  Image: ${imageW}x${imageH}`);
console.log(`  Plan bounds: [${plan.bounds.minX},${plan.bounds.minY}]-[${plan.bounds.maxX},${plan.bounds.maxY}]`);
console.log(`  Plan size: ${plan.bounds.maxX - plan.bounds.minX} x ${plan.bounds.maxY - plan.bounds.minY}`);
console.log(`  Walls: ${plan.walls.length}, Rooms interior=${plan.rooms.filter(r=>!r.exterior).length} exterior=${plan.rooms.filter(r=>r.exterior).length}`);

// --- Generate overlay SVG (exact image coords) ---
// Render source overlay deterministically with distinct styling
function overlaySvg(): string {
  // Wall thickness: as filled polygon (actual wall ribbon), or rect? We'll draw thickness as translucent rect centered on centerline
  // For accuracy, draw wall polygon translucent too.
  const wallThicknessPolys = plan.walls.map(w => {
    const dx = w.to.x - w.from.x;
    const dy = w.to.y - w.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const hw = w.thickness / 2;
    // four corners of thick wall
    const p1 = { x: w.from.x + nx * hw, y: w.from.y + ny * hw };
    const p2 = { x: w.from.x - nx * hw, y: w.from.y - ny * hw };
    const p3 = { x: w.to.x - nx * hw, y: w.to.y - ny * hw };
    const p4 = { x: w.to.x + nx * hw, y: w.to.y + ny * hw };
    return `<polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}" fill="#ff4444" fill-opacity="0.25" stroke="#ff0000" stroke-width="1.5"/>`;
  }).join('\n');

  const wallCenterlines = plan.walls.map(w =>
    `<line x1="${w.from.x}" y1="${w.from.y}" x2="${w.to.x}" y2="${w.to.y}" stroke="#ff0000" stroke-width="2" stroke-linecap="round" opacity="0.9"/>`
  ).join('\n');

  const wallLabels = plan.walls.map(w => {
    const mx = (w.from.x + w.to.x) / 2;
    const my = (w.from.y + w.to.y) / 2;
    return `<text x="${mx}" y="${my - 4}" font-size="7" fill="#b00000" text-anchor="middle" font-weight="bold" paint-order="stroke" stroke="white" stroke-width="2">${w.id}</text>`;
  }).join('\n');

  const roomPolys = plan.rooms.map((r, idx) => {
    const pts = r.polygon.map(p => `${p.x},${p.y}`).join(' ');
    const fill = r.exterior ? '#f0e040' : `hsl(${(idx * 47) % 360} 70% 85%)`;
    const stroke = r.exterior ? '#b8a000' : '#3366cc';
    return `<polygon points="${pts}" fill="${fill}" fill-opacity="0.35" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${r.exterior ? '6 3' : 'none'}"/>`;
  }).join('\n');

  const roomLabels = plan.rooms.map(r => {
    const c = polygonCentroid(r.polygon);
    return `<text x="${c.x}" y="${c.y}" font-size="8" fill="#000" text-anchor="middle" font-weight="700" paint-order="stroke" stroke="white" stroke-width="3">${r.id}${r.exterior ? ' (OUT)' : r.hint ? ' ('+r.hint+')' : ''}</text>`;
  }).join('\n');

  const doors = plan.openings.filter(o => o.kind === 'door' || o.kind === 'entry_door');
  const windows = plan.openings.filter(o => o.kind === 'window');
  const doorLines = doors.map(o =>
    `<line x1="${o.from.x}" y1="${o.from.y}" x2="${o.to.x}" y2="${o.to.y}" stroke="#0066ff" stroke-width="4" stroke-linecap="round" opacity="0.85"/>`
  ).join('\n');
  const windowLines = windows.map(o =>
    `<line x1="${o.from.x}" y1="${o.from.y}" x2="${o.to.x}" y2="${o.to.y}" stroke="#00cc99" stroke-width="4" stroke-linecap="round" opacity="0.85"/>`
  ).join('\n');
  const openingLabels = plan.openings.map(o => {
    const mx = (o.from.x + o.to.x) / 2;
    const my = (o.from.y + o.to.y) / 2;
    const color = o.kind === 'window' ? '#006644' : '#003399';
    return `<text x="${mx}" y="${my - 6}" font-size="6" fill="${color}" text-anchor="middle" paint-order="stroke" stroke="white" stroke-width="2">${o.id}</text>`;
  }).join('\n');

  // Original wall polygons (recognition) as thin gray outline for reference
  const rawWallPolys = plan.regions.wall.map(poly => {
    const pts = poly.map(p => `${p.x},${p.y}`).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#888888" stroke-width="0.7" stroke-dasharray="4 2" opacity="0.5"/>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${imageW} ${imageH}" width="${imageW}" height="${imageH}" style="max-width:100%;height:auto;background:#fff">
  <image href="data:image/jpeg;base64,${imageBase64}" x="0" y="0" width="${imageW}" height="${imageH}" preserveAspectRatio="xMidYMid meet" opacity="0.92"/>
  ${rawWallPolys}
  ${roomPolys}
  ${wallThicknessPolys}
  ${wallCenterlines}
  ${wallLabels}
  ${doorLines}
  ${windowLines}
  ${openingLabels}
  ${roomLabels}
</svg>`;
  return svg;
}

function topDown3DSvg(): string {
  // Render model walls+floors top-down: map meter -> pixel via inverse of toM
  // To compare, we need same coordinate orientation and scale as overlay.
  // We'll render in original pixel space by inverting toM: p_px = p_m * scale + center
  // But model walls are already in meter space centered. Invert.
  const walls3d = model.walls.map(w => {
    const fromPx = { x: w.from.x * scale + cx, y: w.from.y * scale + cy };
    const toPx = { x: w.to.x * scale + cx, y: w.to.y * scale + cy };
    // thickness in pixels = thickness_m * scale
    const thickPx = w.thickness * scale;
    const dx = toPx.x - fromPx.x;
    const dy = toPx.y - fromPx.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const hw = thickPx / 2;
    const p1 = { x: fromPx.x + nx * hw, y: fromPx.y + ny * hw };
    const p2 = { x: fromPx.x - nx * hw, y: fromPx.y - ny * hw };
    const p3 = { x: toPx.x - nx * hw, y: toPx.y - ny * hw };
    const p4 = { x: toPx.x + nx * hw, y: toPx.y + ny * hw };
    return `<polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}" fill="#444444" fill-opacity="0.9" stroke="#222" stroke-width="0.5"/>`;
  }).join('\n');

  const floors3d = model.rooms.map((r, idx) => {
    const pts = r.points.map(p => {
      const px = p.x * scale + cx;
      const py = p.y * scale + cy;
      return `${px},${py}`;
    }).join(' ');
    const fill = idx === 0 ? '#cfe3cf' : `hsl(${(idx*47)%360} 70% 88%)`;
    // r.y is actually centroid Y in model; not needed
    return `<polygon points="${pts}" fill="${fill}" fill-opacity="0.6" stroke="#333" stroke-width="1"/>`;
  }).join('\n');

  // also draw wall centerlines for comparison
  const wallLines3d = model.walls.map(w => {
    const fromPx = { x: w.from.x * scale + cx, y: w.from.y * scale + cy };
    const toPx = { x: w.to.x * scale + cx, y: w.to.y * scale + cy };
    return `<line x1="${fromPx.x}" y1="${fromPx.y}" x2="${toPx.x}" y2="${toPx.y}" stroke="#ff6600" stroke-width="1" opacity="0.6"/>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${imageW} ${imageH}" width="${imageW}" height="${imageH}" style="max-width:100%;height:auto;background:#fafaf8;border:1px solid #ddd">
  <rect x="0" y="0" width="${imageW}" height="${imageH}" fill="#fafaf8"/>
  ${floors3d}
  ${walls3d}
  ${wallLines3d}
</svg>`;
}

// Generate HTML with three synchronized panels
const overlay = overlaySvg();
const topDown = topDown3DSvg();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Floorplan Geometry Verification — ${basename(fixturePath)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:16px;color:#222;background:#fff}
  h1{font-size:18px;margin:0 0 8px}
  h2{font-size:14px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .subtitle{font-size:12px;color:#666;margin-bottom:12px}
  .panels{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
  .panel{border:1px solid #ccc;border-radius:8px;overflow:hidden;background:#fff}
  .panel h3{font-size:12px;margin:0;padding:8px 10px;background:#f5f5f5;border-bottom:1px solid #ddd}
  .panel .content{padding:8px}
  .panel .content svg{width:100%;height:auto;display:block}
  .legend{font-size:11px;line-height:1.6;margin:8px 0}
  .legend span{display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:4px;border-radius:2px;border:1px solid #888}
  .stats{font-size:11px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;padding:10px;white-space:pre-wrap;font-family:monospace;max-height:400px;overflow:auto}
  @media(max-width:900px){.panels{grid-template-columns:1fr}}
</style>
</head>
<body>
<h1>Final Geometry Verification — Source Overlay vs 2D vs 3D</h1>
<div class="subtitle">Fixture: ${basename(fixturePath)} · Image: ${basename(imagePath)} (${imageW}×${imageH}) · Bounds [${plan.bounds.minX.toFixed(0)},${plan.bounds.minY.toFixed(0)}]–[${plan.bounds.maxX.toFixed(0)},${plan.bounds.maxY.toFixed(0)}] · walls ${plan.walls.length} · rooms ${plan.rooms.length} (interior ${plan.rooms.filter(r=>!r.exterior).length}, exterior ${plan.rooms.filter(r=>r.exterior).length}) · 3D walls ${model.walls.length}</div>

<div class="legend">
  <b>Overlay styling:</b>
  <span style="background:#ff0000;opacity:0.25"></span> wall thickness (red translucent) &amp;
  <span style="background:#ff0000"></span> wall centerline (red) &amp;
  <span style="background:#888"></span> raw recognition wall polygons (gray dashed) &amp;
  <span style="background:#3366cc;opacity:0.35"></span> room polygons (blue/sand) &amp;
  <span style="background:#f0e040"></span> exterior/terrace &amp;
  <span style="background:#0066ff"></span> door centerlines (blue) &amp;
  <span style="background:#00cc99"></span> window centerlines (teal)
  | <b>All panels share same viewBox 0 0 ${imageW} ${imageH} and orientation (y-down image coords)</b>
</div>

<div class="panels">
  <div class="panel">
    <h3>1. SOURCE + NORMALIZED OVERLAY (ground truth check)</h3>
    <div class="content">${overlay}</div>
  </div>
  <div class="panel">
    <h3>2. NORMALIZED 2D (debugSvg, walls+rooms+openings)</h3>
    <div class="content">${debugSvg}</div>
  </div>
  <div class="panel">
    <h3>3. 3D TOP-DOWN (walls + floors only, orthographic)</h3>
    <div class="content">${topDown}</div>
  </div>
</div>

<h2>Diagnostic Logs (see console for full)</h2>
<div class="stats" id="stats">Open browser console for detailed step-by-step logs. Key stats:
- Image ${imageW}x${imageH}, plan ${plan.bounds.maxX - plan.bounds.minX}x${plan.bounds.maxY - plan.bounds.minY}
- Wall components: ${components.length}
- Right-side walls (>900px): ${rightmost.length}
- 3D walls: ${model.walls.length}
</div>

<h2>What to verify</h2>
<ul style="font-size:12px">
  <li>Panel 1 vs source drawing: do red wall centerlines + thickness exactly trace black wall strokes? Are interior walls present? Is terrace (top balcony?) correctly excluded?</li>
  <li>Panel 2 vs Panel 1: does normalized 2D match overlay? Should be same topology.</li>
  <li>Panel 3 vs Panel 1: does 3D top-down reproduce 2D wall lengths/positions? Check right-side detached wall.</li>
  <li>Acceptance: wall connectivity should be 1 main component; isolated walls explain detached 3D artifacts.</li>
</ul>

<script>console.log('Verification page loaded');</script>
</body>
</html>`;

writeFileSync(outputPath, html);
console.log(`\nWrote verification page to ${outputPath}`);
console.log(`Image ${imageW}x${imageH}, plan bounds [${plan.bounds.minX},${plan.bounds.minY}]-[${plan.bounds.maxX},${plan.bounds.maxY}]`);
