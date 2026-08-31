import type { FloorPlanGeometry } from './types.js';

/**
 * Converts floorplan-recognition geometry to a GLB binary.
 *
 * This is a minimal geometry-to-3D converter: walls become extruded quads,
 * doors/windows become boxes, and a floor plane anchors the scene.
 * The output is a valid glTF 2.0 Binary file that the frontend's
 * GLB viewer can load directly.
 */
export function buildGlbFromGeometry(geometry: FloorPlanGeometry): Buffer {
  const WALL_HEIGHT = 2.5;
  const WALL_THICKNESS = 0.15;
  const DOOR_HEIGHT = 2.1;
  const DOOR_THICKNESS = 0.05;
  const WINDOW_HEIGHT = 1.2;
  const WINDOW_SILL = 0.9;
  const WINDOW_THICKNESS = 0.03;

  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const materialMap = new Map<string, number>();
  const meshDefs: MeshDef[] = [];

  // Materials: 0=wall, 1=door, 2=window, 3=floor
  const materialNames = ['wall', 'door', 'window', 'floor'];
  materialNames.forEach((name, i) => materialMap.set(name, i));

  // --- Walls ---
  for (const wallPolygon of geometry.wall) {
    const box = polygonBounds(wallPolygon);
    if (!box) continue;
    const w = Math.max(box.maxX - box.minX, WALL_THICKNESS);
    const d = Math.max(box.maxY - box.minY, WALL_THICKNESS);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    addBox(vertices, normals, indices, cx, WALL_HEIGHT / 2, -cy, w, WALL_HEIGHT, d, vertices.length / 3);
    meshDefs.push({ materialIndex: materialMap.get('wall')! });
  }

  // --- Doors ---
  for (const doorPolygon of geometry.door) {
    const box = polygonBounds(doorPolygon);
    if (!box) continue;
    const w = Math.max(box.maxX - box.minX, 0.01);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    addBox(vertices, normals, indices, cx, DOOR_HEIGHT / 2, -cy, w, DOOR_HEIGHT, DOOR_THICKNESS, vertices.length / 3);
    meshDefs.push({ materialIndex: materialMap.get('door')! });
  }

  // --- Entry Doors ---
  for (const entryPolygon of geometry.entry_door) {
    const box = polygonBounds(entryPolygon);
    if (!box) continue;
    const w = Math.max(box.maxX - box.minX, 0.01);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    addBox(vertices, normals, indices, cx, DOOR_HEIGHT / 2, -cy, w, DOOR_HEIGHT, DOOR_THICKNESS, vertices.length / 3);
    meshDefs.push({ materialIndex: materialMap.get('door')! });
  }

  // --- Windows ---
  for (const windowPolygon of geometry.window) {
    const box = polygonBounds(windowPolygon);
    if (!box) continue;
    const w = Math.max(box.maxX - box.minX, 0.01);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const cy3d = WINDOW_SILL + WINDOW_HEIGHT / 2;
    addBox(vertices, normals, indices, cx, cy3d, -cy, w, WINDOW_HEIGHT, WINDOW_THICKNESS, vertices.length / 3);
    meshDefs.push({ materialIndex: materialMap.get('window')! });
  }

  // --- Floor plane ---
  if (vertices.length > 0) {
    const allX = vertices.filter((_, i) => i % 3 === 0);
    const allZ = vertices.filter((_, i) => i % 3 === 2);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minZ = Math.min(...allZ);
    const maxZ = Math.max(...allZ);
    const padding = 0.5;
    addFloorPlane(vertices, normals, indices, minX - padding, minZ - padding, maxX + padding, maxZ + padding, vertices.length / 3);
    meshDefs.push({ materialIndex: materialMap.get('floor')! });
  }

  if (vertices.length === 0) {
    // Degenerate case: return a minimal placeholder
    addBox(vertices, normals, indices, 0, 0.5, 0, 1, 1, 1, 0);
    meshDefs.push({ materialIndex: materialMap.get('floor')! });
  }

  return assembleGlb(vertices, normals, indices, meshDefs);
}

// --- Geometry helpers ---

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function polygonBounds(polygon: number[][]): Bounds | null {
  if (!polygon || polygon.length < 3) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of polygon) {
    const [x, y] = point;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

function addBox(
  vertices: number[],
  normals: number[],
  indices: number[],
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  baseIndex: number,
): void {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  // 8 vertices of the box
  const verts = [
    // Bottom face (y = cy - hh)
    [cx - hw, cy - hh, cz - hd], [cx + hw, cy - hh, cz - hd],
    [cx + hw, cy - hh, cz + hd], [cx - hw, cy - hh, cz + hd],
    // Top face (y = cy + hh)
    [cx - hw, cy + hh, cz - hd], [cx + hw, cy + hh, cz - hd],
    [cx + hw, cy + hh, cz + hd], [cx - hw, cy + hh, cz + hd],
  ];
  const norm: number[][] = [
    [0, -1, 0], [0, -1, 0], [0, -1, 0], [0, -1, 0], // bottom
    [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0],       // top
  ];

  for (let i = 0; i < 8; i++) {
    vertices.push(verts[i][0], verts[i][1], verts[i][2]);
    normals.push(norm[i][0], norm[i][1], norm[i][2]);
  }

  const faces: [number, number, number][] = [
    // Bottom
    [0, 2, 1], [0, 3, 2],
    // Top
    [4, 5, 6], [4, 6, 7],
    // Front
    [0, 1, 5], [0, 5, 4],
    // Back
    [2, 3, 7], [2, 7, 6],
    // Left
    [3, 0, 4], [3, 4, 7],
    // Right
    [1, 2, 6], [1, 6, 5],
  ];

  for (const [a, b, c] of faces) {
    indices.push(baseIndex + a, baseIndex + b, baseIndex + c);
  }
}

function addFloorPlane(
  vertices: number[],
  normals: number[],
  indices: number[],
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  baseIndex: number,
): void {
  const y = 0;
  vertices.push(x1, y, z1, x2, y, z1, x2, y, z2, x1, y, z2);
  normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
  indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
}

interface MeshDef {
  materialIndex: number;
}

// --- GLB Assembly ---

function assembleGlb(
  vertices: number[],
  normals: number[],
  indices: number[],
  meshDefs: MeshDef[],
): Buffer {
  // Quantize vertices: find bounding box and scale to uint16
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    const [x, y, z] = [vertices[i], vertices[i + 1], vertices[i + 2]];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  // Bounding box computed for accessor min/max.
  // Ranges not needed separately.

  const posBuffer = new Float32Array(vertices);
  const normBuffer = new Float32Array(normals);
  const idxBuffer = new Uint32Array(indices);

  // Pad index buffer to 4-byte alignment
  const idxPaddedLength = Math.ceil(idxBuffer.byteLength / 4) * 4;
  const idxPadded = new Uint8Array(idxPaddedLength);
  idxPadded.set(new Uint8Array(idxBuffer.buffer, idxBuffer.byteOffset, idxBuffer.byteLength));

  // Build the combined buffer: positions + normals + indices
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

  const posByteLength = posBuffer.byteLength;
  const normByteLength = normBuffer.byteLength;
  const idxByteLength = idxBuffer.byteLength;

  // Build node, mesh, accessor, bufferView, buffer JSON.
  // Single combined mesh covers all geometry; per-material primitives
  // could be added later without changing the buffer layout.
  void meshDefs;

  // Build the glTF JSON structure
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];

  // Position buffer view
  bufferViews.push({
    buffer: 0,
    byteOffset: posOffset,
    byteLength: posByteLength,
    target: 34962, // ARRAY_BUFFER
  });
  const posBufferViewIdx = bufferViews.length - 1;

  // Normal buffer view
  bufferViews.push({
    buffer: 0,
    byteOffset: normOffset,
    byteLength: normByteLength,
    target: 34962,
  });
  const normBufferViewIdx = bufferViews.length - 1;

  // Index buffer view
  bufferViews.push({
    buffer: 0,
    byteOffset: idxOffset,
    byteLength: idxByteLength,
    target: 34963, // ELEMENT_ARRAY_BUFFER
  });
  const idxBufferViewIdx = bufferViews.length - 1;

  // Accessors
  const vertexCount = vertices.length / 3;
  accessors.push({
    bufferView: posBufferViewIdx,
    componentType: 5126, // FLOAT
    count: vertexCount,
    type: 'VEC3',
    max: [maxX, maxY, maxZ],
    min: [minX, minY, minZ],
  });
  const posAccessorIdx = accessors.length - 1;

  accessors.push({
    bufferView: normBufferViewIdx,
    componentType: 5126,
    count: vertexCount,
    type: 'VEC3',
  });
  const normAccessorIdx = accessors.length - 1;

  const indexCount = indices.length;
  accessors.push({
    bufferView: idxBufferViewIdx,
    componentType: 5125, // UNSIGNED_INT
    count: indexCount,
    type: 'SCALAR',
  });
  const idxAccessorIdx = accessors.length - 1;

  // Materials
  const materials: Array<Record<string, unknown>> = [
    { name: 'wall', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.82, 0.75, 1.0], metallicFactor: 0.0, roughnessFactor: 0.8 } },
    { name: 'door', pbrMetallicRoughness: { baseColorFactor: [0.54, 0.35, 0.2, 1.0], metallicFactor: 0.0, roughnessFactor: 0.7 } },
    { name: 'window', pbrMetallicRoughness: { baseColorFactor: [0.68, 0.85, 0.94, 0.6], metallicFactor: 0.1, roughnessFactor: 0.3 }, alphaMode: 'BLEND' },
    { name: 'floor', pbrMetallicRoughness: { baseColorFactor: [0.94, 0.91, 0.86, 1.0], metallicFactor: 0.0, roughnessFactor: 0.9 } },
  ];

  // For simplicity, create a single mesh with one primitive covering all geometry
  // The material will be wall material for the combined mesh
  const mesh = {
    primitives: [{
      attributes: {
        POSITION: posAccessorIdx,
        NORMAL: normAccessorIdx,
      },
      indices: idxAccessorIdx,
      material: 0, // wall material
    }],
  };

  const node = {
    mesh: 0,
    name: 'FloorPlan',
  };

  const gltfJson = {
    asset: { version: '2.0', generator: 'Vista FloorPlan Builder' },
    scene: 0,
    scenes: [{ name: 'FloorPlan', nodes: [0] }],
    nodes: [node],
    meshes: [mesh],
    accessors,
    bufferViews,
    buffers: [{ byteLength: totalBufferLength }],
    materials,
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonPadded = padTo4Bytes(jsonStr);
  const binPadded = padTo4Bytes(combinedBuffer);

  // GLB header: magic(4) + version(4) + length(4)
  // JSON chunk: length(4) + type(4) + data
  // BIN chunk: length(4) + type(4) + data
  const totalLength = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const glb = Buffer.alloc(totalLength);

  let pos = 0;
  // Header
  glb.writeUInt32LE(0x46546C67, pos); pos += 4; // glTF magic
  glb.writeUInt32LE(2, pos); pos += 4;           // version 2
  glb.writeUInt32LE(totalLength, pos); pos += 4; // total length

  // JSON chunk
  glb.writeUInt32LE(jsonPadded.length, pos); pos += 4;
  glb.writeUInt32LE(0x4E4F534A, pos); pos += 4; // JSON type
  jsonPadded.copy(glb, pos); pos += jsonPadded.length;

  // BIN chunk
  glb.writeUInt32LE(binPadded.length, pos); pos += 4;
  glb.writeUInt32LE(0x004E4942, pos); pos += 4; // BIN type
  binPadded.copy(glb, pos);

  return glb;
}

function padTo4Bytes(data: string | Uint8Array): Buffer {
  const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  const paddedLength = Math.ceil(buf.length / 4) * 4;
  if (paddedLength === buf.length) return buf;
  const padded = Buffer.alloc(paddedLength);
  buf.copy(padded);
  // Pad with spaces (JSON) or 0x00 (binary)
  for (let i = buf.length; i < paddedLength; i++) {
    padded[i] = typeof data === 'string' ? 0x20 : 0x00;
  }
  return padded;
}
