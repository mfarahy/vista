import { runFloorplanPipeline } from '../floorplan-pipeline/index.js';
import type { FloorPlan3DModel, ModelOpening, ModelWall } from '../floorplan-pipeline/model3d.js';
import type { RecognitionGeometry } from '../floorplan-pipeline/types.js';

/**
 * Converts floor-plan geometry to a GLB binary.
 *
 * The 2D recognition geometry first passes through the reconstruction
 * pipeline (normalize → rooms → 3D model), so the GLB contains real
 * structure: room floors, wall segments extruded vertically, wall openings
 * for doors and windows (with simple leaf/glass boxes), per-material
 * primitives. The output is a valid glTF 2.0 Binary file the frontend's
 * GLB viewer can load directly.
 */

interface VertexCollector {
  vertices: number[];
  normals: number[];
  indices: number[];
  /** Start index of the material's primitive in the shared buffers. */
  primitives: Array<{ material: number; start: number }>;
}

const MATERIALS = [
  { name: 'wall', color: [0.85, 0.82, 0.75, 1.0], metallic: 0.0, roughness: 0.8, alpha: false },
  { name: 'floor', color: [0.94, 0.91, 0.86, 1.0], metallic: 0.0, roughness: 0.9, alpha: false },
  { name: 'door', color: [0.54, 0.35, 0.2, 1.0], metallic: 0.0, roughness: 0.7, alpha: false },
  { name: 'window', color: [0.68, 0.85, 0.94, 0.6], metallic: 0.1, roughness: 0.3, alpha: true },
] as const;

function materialIndex(name: string): number {
  return MATERIALS.findIndex((m) => m.name === name);
}

function collector(): VertexCollector {
  return { vertices: [], normals: [], indices: [], primitives: [] };
}

function beginPrimitive(c: VertexCollector, material: number): void {
  c.primitives.push({ material, start: c.indices.length });
}

function pushTriangle(c: VertexCollector, a: number[], b: number[], d: number[]): void {
  const base = c.vertices.length / 3;
  for (const v of [a, b, d]) {
    c.vertices.push(v[0], v[1], v[2]);
  }
  const nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
  const ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
  const nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  for (let i = 0; i < 3; i++) {
    c.normals.push(nx, ny, nz);
  }
  c.indices.push(base, base + 1, base + 2);
}

function pushQuad(c: VertexCollector, v: number[][], flip = false): void {
  const [a, b, d, e] = v;
  if (flip) {
    pushTriangle(c, a, d, b);
    pushTriangle(c, a, e, d);
  } else {
    pushTriangle(c, a, b, d);
    pushTriangle(c, a, d, e);
  }
}

/** Adds a box centered at (cx, cy, cz) with size w×h×d, rotated around Y. */
function pushBox(
  c: VertexCollector,
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  rotationY: number,
): void {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const corner = (lx: number, ly: number, lz: number): number[] => [
    cx + lx * cos - lz * sin,
    cy + ly,
    cz + lx * sin + lz * cos,
  ];
  // Local corners (x along length, z along thickness, y up).
  const p000 = corner(-hw, -hh, -hd);
  const p100 = corner(hw, -hh, -hd);
  const p110 = corner(hw, -hh, hd);
  const p010 = corner(-hw, -hh, hd);
  const p001 = corner(-hw, hh, -hd);
  const p101 = corner(hw, hh, -hd);
  const p111 = corner(hw, hh, hd);
  const p011 = corner(-hw, hh, hd);

  pushQuad(c, [p000, p100, p110, p010]); // bottom (y-)
  pushQuad(c, [p001, p011, p111, p101], true); // top (y+)
  pushQuad(c, [p000, p001, p101, p100]); // front (z-)
  pushQuad(c, [p010, p110, p111, p011], true); // back (z+)
  pushQuad(c, [p000, p010, p011, p001], true); // left (x-)
  pushQuad(c, [p100, p101, p111, p110]); // right (x+)
}

/**
 * Ear-clipping triangulation for simple polygons (no holes). Returns
 * triangle indices into the polygon point list.
 */
function triangulatePolygon(points: Array<{ x: number; y: number }>): number[][] {
  const n = points.length;
  if (n < 3) return [];
  // Signed area to determine orientation; CCW point order is required.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const index = points.map((_, i) => i);
  if (area < 0) index.reverse();
  const triangles: number[][] = [];

  const crossVal = (a: number, b: number, c: number): number => {
    const pa = points[a];
    const pb = points[b];
    const pc = points[c];
    return (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
  };
  const inTriangle = (p: number, a: number, b: number, c: number): boolean => {
    const d1 = crossVal(a, b, p);
    const d2 = crossVal(b, c, p);
    const d3 = crossVal(c, a, p);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  let guard = 0;
  while (index.length > 3 && guard < n * n) {
    guard++;
    let earFound = false;
    for (let i = 0; i < index.length; i++) {
      const prev = index[(i + index.length - 1) % index.length];
      const cur = index[i];
      const next = index[(i + 1) % index.length];
      if (crossVal(prev, cur, next) <= 0) continue; // reflex corner
      let isEar = true;
      for (let j = 0; j < index.length; j++) {
        const test = index[j];
        if (test === prev || test === cur || test === next) continue;
        if (inTriangle(test, prev, cur, next)) {
          isEar = false;
          break;
        }
      }
      if (isEar) {
        triangles.push([prev, cur, next]);
        index.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) break; // degenerate polygon; give up on the remainder
  }
  if (index.length === 3) triangles.push([index[0], index[1], index[2]]);
  return triangles;
}

function addRoomFloors(c: VertexCollector, model: FloorPlan3DModel): void {
  beginPrimitive(c, materialIndex('floor'));
  for (const room of model.rooms) {
    const triangles = triangulatePolygon(room.points);
    for (const tri of triangles) {
      const a = room.points[tri[0]];
      const b = room.points[tri[1]];
      const d = room.points[tri[2]];
      pushTriangle(c, [a.x, 0, a.y], [b.x, 0, b.y], [d.x, 0, d.y]);
    }
  }
}

function addWalls(c: VertexCollector, model: FloorPlan3DModel): void {
  beginPrimitive(c, materialIndex('wall'));
  for (const wall of model.walls) {
    addWallSegment(c, wall);
  }
}

function addWallSegment(c: VertexCollector, wall: ModelWall): void {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) return;
  const rotationY = Math.atan2(dy, dx);
  const cx = (wall.from.x + wall.to.x) / 2;
  const cz = (wall.from.y + wall.to.y) / 2;
  pushBox(c, cx, wall.height / 2, cz, length, wall.height, wall.thickness, rotationY);
}

function addOpeningLeafs(
  c: VertexCollector,
  model: FloorPlan3DModel,
  openings: ModelOpening[],
  material: string,
  yPosition: (opening: ModelOpening) => number,
): void {
  beginPrimitive(c, materialIndex(material));
  const thickness = 0.06;
  for (const opening of openings) {
    const y = yPosition(opening);
    pushBox(c, opening.x, y, opening.y, opening.width, opening.height, thickness, opening.rotation);
  }
}

/**
 * Builds a GLB from the normalized 3D model: room floors, extruded wall
 * segments (already cut at door/window openings), door leaves and window
 * glass. The frontend GLB viewer renders the result directly.
 */
export function buildGlbFromModel(model: FloorPlan3DModel): Buffer {
  const c = collector();

  addRoomFloors(c, model);
  addWalls(c, model);
  addOpeningLeafs(c, model, model.doors, 'door', (o) => o.height / 2 + 0.02);
  addOpeningLeafs(c, model, model.windows, 'window', (o) => o.height / 2 + 0.95);

  if (c.vertices.length === 0) {
    // Degenerate case: return a minimal placeholder box.
    beginPrimitive(c, materialIndex('floor'));
    pushBox(c, 0, 0.5, 0, 1, 1, 1, 0);
  }

  return assembleGlb(c);
}

/**
 * Converts raw recognition geometry to GLB via the reconstruction pipeline.
 * Kept as the compatibility entry point; prefer `buildGlbFromModel` when the
 * pipeline result is already available.
 */
export function buildGlbFromGeometry(geometry: RecognitionGeometry): Buffer {
  return buildGlbFromModel(runFloorplanPipeline(geometry).model3d);
}

// --- GLB Assembly ---

function padTo4Bytes(data: string | Uint8Array): Buffer {
  const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  const paddedLength = Math.ceil(buf.length / 4) * 4;
  if (paddedLength === buf.length) return buf;
  const padded = Buffer.alloc(paddedLength);
  buf.copy(padded);
  for (let i = buf.length; i < paddedLength; i++) {
    padded[i] = typeof data === 'string' ? 0x20 : 0x00;
  }
  return padded;
}

function assembleGlb(c: VertexCollector): Buffer {
  const vertices = c.vertices;
  const normals = c.normals;
  const indices = c.indices;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    const [x, y, z] = [vertices[i], vertices[i + 1], vertices[i + 2]];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const posBuffer = new Float32Array(vertices);
  const normBuffer = new Float32Array(normals);
  const idxBuffer = new Uint32Array(indices);
  const idxPaddedLength = Math.ceil(idxBuffer.byteLength / 4) * 4;
  const idxPadded = new Uint8Array(idxPaddedLength);
  idxPadded.set(new Uint8Array(idxBuffer.buffer, idxBuffer.byteOffset, idxBuffer.byteLength));

  const totalBufferLength = posBuffer.byteLength + normBuffer.byteLength + idxPaddedLength;
  const combinedBuffer = new Uint8Array(totalBufferLength);
  let offset = 0;
  combinedBuffer.set(new Uint8Array(posBuffer.buffer), offset);
  const posOffset = offset;
  offset += posBuffer.byteLength;
  combinedBuffer.set(new Uint8Array(normBuffer.buffer), offset);
  const normOffset = offset;
  offset += normBuffer.byteLength;
  combinedBuffer.set(idxPadded, offset);
  const idxOffset = offset;

  const bufferViews: Array<Record<string, unknown>> = [
    { buffer: 0, byteOffset: posOffset, byteLength: posBuffer.byteLength, target: 34962 },
    { buffer: 0, byteOffset: normOffset, byteLength: normBuffer.byteLength, target: 34962 },
    { buffer: 0, byteOffset: idxOffset, byteLength: idxBuffer.byteLength, target: 34963 },
  ];
  const accessors: Array<Record<string, unknown>> = [
    {
      bufferView: 0,
      componentType: 5126,
      count: vertices.length / 3,
      type: 'VEC3',
      max: [maxX, maxY, maxZ],
      min: [minX, minY, minZ],
    },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5125, count: indices.length, type: 'SCALAR' },
  ];

  const materials = MATERIALS.map((m) => ({
    name: m.name,
    pbrMetallicRoughness: {
      baseColorFactor: m.color,
      metallicFactor: m.metallic,
      roughnessFactor: m.roughness,
    },
    ...(m.alpha ? { alphaMode: 'BLEND' } : {}),
  }));

  const primitives = c.primitives.map((p) => ({
    attributes: { POSITION: 0, NORMAL: 1 },
    indices: 2,
    material: p.material,
  }));

  const gltfJson = {
    asset: { version: '2.0', generator: 'Vista FloorPlan Builder' },
    scene: 0,
    scenes: [{ name: 'FloorPlan', nodes: [0] }],
    nodes: [{ mesh: 0, name: 'FloorPlan' }],
    meshes: [{ primitives }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: totalBufferLength }],
    materials,
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonPadded = padTo4Bytes(jsonStr);
  const binPadded = padTo4Bytes(combinedBuffer);

  const totalLength = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const glb = Buffer.alloc(totalLength);
  let pos = 0;
  glb.writeUInt32LE(0x46546c67, pos); pos += 4; // glTF magic
  glb.writeUInt32LE(2, pos); pos += 4; // version 2
  glb.writeUInt32LE(totalLength, pos); pos += 4; // total length
  glb.writeUInt32LE(jsonPadded.length, pos); pos += 4;
  glb.writeUInt32LE(0x4e4f534a, pos); pos += 4; // JSON type
  jsonPadded.copy(glb, pos); pos += jsonPadded.length;
  glb.writeUInt32LE(binPadded.length, pos); pos += 4;
  glb.writeUInt32LE(0x004e4942, pos); pos += 4; // BIN type
  binPadded.copy(glb, pos);
  return glb;
}