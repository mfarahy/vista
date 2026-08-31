/**
 * CLI debug tool for the floor-plan reconstruction pipeline.
 *
 * Reads a raw floorplan-recognition JSON file, runs the full pipeline
 * (normalize → rooms → 3D model) and writes a self-contained HTML report
 * with the 2D debug view (walls, openings, rooms), pipeline statistics and
 * the raw normalized geometry.
 *
 * Usage:
 *   npm run floorplan:debug -- <recognition.json> [output.html]
 *
 * Example:
 *   npm run floorplan:debug -- src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runFloorplanPipeline } from '../src/lib/floorplan-pipeline/index.js';

const input = process.argv[2];
if (!input) {
  console.error('Usage: floorplan-debug <recognition.json> [output.html]');
  process.exit(1);
}

const geometry = JSON.parse(readFileSync(resolve(input), 'utf8'));
const result = runFloorplanPipeline(geometry);
const output = resolve(process.argv[3] ?? 'floorplan-debug.html');

const roomsHtml = result.rooms
  .map((room) => {
    const kind = room.exterior ? 'outside' : room.hint === 'kitchen' ? 'kitchen' : 'room';
    return `<li><code>${room.id}</code> — ${kind} — ${room.areaM2.toFixed(1)} m² (${room.area.toFixed(0)} px²)</li>`;
  })
  .join('');

const wallsHtml = result.normalized.walls
  .map((wall) => {
    const len = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
    return `<li><code>${wall.id}</code> — ${len.toFixed(1)} px, ${wall.thickness.toFixed(1)} px${wall.exterior ? ', exterior' : ''}</li>`;
  })
  .join('');

const openingsHtml = result.normalized.openings
  .map((o) => `<li><code>${o.id}</code> — ${o.kind}, ${o.width.toFixed(1)} px, wall ${o.wallId ?? '—'}, rooms [${o.roomIds.join(', ')}]</li>`)
  .join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Floor plan reconstruction debug</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #222; }
  h1 { font-size: 18px; }
  h2 { font-size: 14px; margin-top: 24px; }
  .layout { display: grid; grid-template-columns: 1fr 320px; gap: 24px; }
  .svg-wrap { border: 1px solid #ddd; border-radius: 8px; padding: 8px; background: #fafaf8; }
  .svg-wrap svg { width: 100%; height: auto; }
  ul { margin: 4px 0; padding-left: 18px; font-size: 12px; }
  li { margin: 2px 0; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
  .stats { font-size: 12px; }
</style>
</head>
<body>
<h1>Floor plan reconstruction — debug report</h1>
<p class="stats">Input: <code>${input}</code> · bounds x [${result.normalized.bounds.minX.toFixed(0)}, ${result.normalized.bounds.maxX.toFixed(0)}], y [${result.normalized.bounds.minY.toFixed(0)}, ${result.normalized.bounds.maxY.toFixed(0)}] · pixelsPerMeter ${result.normalized.options.pixelsPerMeter} · walls ${result.normalized.walls.length} · openings ${result.normalized.openings.length} · rooms ${result.rooms.length} · 3D walls ${result.model3d.walls.length}</p>
<div class="layout">
  <div>
    <h2>2D debug view (processed geometry)</h2>
    <div class="svg-wrap">${result.debugSvg}</div>
  </div>
  <div>
    <h2>Detected rooms</h2>
    <ul>${roomsHtml}</ul>
    <h2>Walls</h2>
    <ul>${wallsHtml}</ul>
    <h2>Openings</h2>
    <ul>${openingsHtml}</ul>
  </div>
</div>
</body>
</html>`;

writeFileSync(output, html);
console.log(`Wrote debug report to ${output}`);
console.log(`Rooms: ${result.rooms.length}, walls: ${result.normalized.walls.length}, openings: ${result.normalized.openings.length}`);
console.log(`3D model: ${result.model3d.rooms.length} floors, ${result.model3d.walls.length} wall segments, ${result.model3d.doors.length} doors, ${result.model3d.windows.length} windows`);