/**
 * Automatic room detection from wall geometry.
 *
 * Closed regions formed by connected walls are recognized as rooms without
 * requiring the user to draw room polygons manually. Detection is purely
 * geometric: wall endpoints snapped to a 1 mm grid form a graph, minimal
 * edge cycles of that graph become room faces.
 *
 * Simpler behavior by design (documented limitation): walls connect when an
 * endpoint coincides with another endpoint or touches another wall's interior
 * (T-junction, resolved by splitting). Walls that merely cross with no
 * endpoint involved do not enclose a room.
 */
import { MIN_ROOM_AREA_M2, type Room, type Vec2, type Wall } from './model';
import { distancePointToSegment, pointStrictlyInPolygon, polygonArea, polygonCentroid } from './geometry';

const ENDPOINT_PRECISION_M = 0.001;
const MAX_CYCLE_WALLS = 12;
const MAX_SPLIT_ROUNDS = 5;

function nodeKey(p: Vec2): string {
  return `${p.x.toFixed(3)}|${p.y.toFixed(3)}`;
}

/**
 * Split walls at T-junctions: an endpoint touching another wall's interior
 * divides that wall into two segments so the graph connects. Split segments
 * get deterministic ids (`<origId>:0`, `<origId>:1` ordered along the wall)
 * and remember their original wall id for stable room signatures.
 */
function splitAtTJunctions(walls: Wall[]): Array<Wall & { originId: string }> {
  let working: Array<Wall & { originId: string }> = walls.map((wall) => ({
    ...wall,
    start: { ...wall.start },
    end: { ...wall.end },
    originId: wall.id,
  }));
  for (let round = 0; round < MAX_SPLIT_ROUNDS; round++) {
    let splitDone = false;
    const next: Array<Wall & { originId: string }> = [];
    for (const wall of working) {
      // Collect every foreign endpoint touching this wall's interior.
      const cuts: Vec2[] = [];
      for (const other of working) {
        if (other.id === wall.id) continue;
        for (const p of [other.start, other.end]) {
          if (nodeKey(p) === nodeKey(wall.start) || nodeKey(p) === nodeKey(wall.end)) continue;
          if (cuts.some((c) => nodeKey(c) === nodeKey(p))) continue;
          if (distancePointToSegment(p, wall.start, wall.end) <= ENDPOINT_PRECISION_M) {
            cuts.push({ ...p });
          }
        }
      }
      if (cuts.length === 0) {
        next.push(wall);
        continue;
      }
      // Order cuts along the wall and split into consecutive segments.
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const lenSq = dx * dx + dy * dy;
      cuts.sort((a, b) => {
        const ta = ((a.x - wall.start.x) * dx + (a.y - wall.start.y) * dy) / lenSq;
        const tb = ((b.x - wall.start.x) * dx + (b.y - wall.start.y) * dy) / lenSq;
        return ta - tb;
      });
      const points = [wall.start, ...cuts, wall.end];
      for (let i = 0; i + 1 < points.length; i++) {
        next.push({
          ...wall,
          id: `${wall.originId}:${i}`,
          start: { ...points[i] },
          end: { ...points[i + 1] },
        });
      }
      splitDone = true;
    }
    working = next;
    if (!splitDone) break;
  }
  return working;
}

function roomIdFor(wallIds: string[]): string {
  const sorted = [...wallIds].sort();
  let hash = 0;
  const joined = sorted.join('|');
  for (let i = 0; i < joined.length; i++) {
    hash = (Math.imul(hash, 31) + joined.charCodeAt(i)) | 0;
  }
  return `room-${(hash >>> 0).toString(36)}`;
}

type Adjacency = Map<string, Array<{ neighbor: string; wallId: string }>>;

/**
 * Order an unordered set of boundary walls into a vertex loop.
 * Returns null when the walls do not form a single simple ring
 * (e.g. dangling ends or branches inside the set).
 */
function orderBoundaryLoop(
  wallSet: Set<string>,
  wallsById: Map<string, Wall>,
  nodes: Map<string, Vec2>,
): Vec2[] | null {
  const degree = new Map<string, number>();
  const incident = new Map<string, string[]>();
  for (const wallId of wallSet) {
    const wall = wallsById.get(wallId);
    if (!wall) return null;
    const a = nodeKey(wall.start);
    const b = nodeKey(wall.end);
    if (a === b) return null;
    for (const n of [a, b]) {
      degree.set(n, (degree.get(n) ?? 0) + 1);
      const list = incident.get(n) ?? [];
      list.push(wallId);
      incident.set(n, list);
    }
  }
  for (const count of degree.values()) {
    if (count !== 2) return null;
  }
  // Walk the ring starting from the lexicographically smallest node.
  const start = [...degree.keys()].sort()[0];
  const loop: Vec2[] = [];
  let current = start;
  let previousWall: string | null = null;
  for (let step = 0; step <= wallSet.size; step++) {
    const point = nodes.get(current);
    if (!point) return null;
    if (step === wallSet.size) {
      return current === start ? loop : null;
    }
    loop.push({ ...point });
    const options = incident.get(current) ?? [];
    const nextWall = options.find((id) => id !== previousWall) ?? options[0];
    if (!nextWall) return null;
    const wall = wallsById.get(nextWall);
    if (!wall) return null;
    const a = nodeKey(wall.start);
    const b = nodeKey(wall.end);
    current = current === a ? b : a;
    previousWall = nextWall;
  }
  return null;
}

/**
 * Detect rooms from walls. Previously known rooms (same boundary signature)
 * keep their user-assigned names; new faces get an empty (auto) name and are
 * sorted by descending area so numbering is stable.
 */
export function detectRooms(walls: Wall[], previousRooms: Room[] = []): Room[] {
  if (walls.length < 3) return [];
  // Resolve T-junctions first so divider walls ending mid-wall connect.
  const segments = splitAtTJunctions(walls);
  const wallsById = new Map(segments.map((wall) => [wall.id, wall]));
  const originOf = new Map(segments.map((wall) => [wall.id, wall.originId]));
  const nodes = new Map<string, Vec2>();
  const adjacency: Adjacency = new Map();
  const link = (from: Vec2, to: Vec2, wallId: string) => {
    const a = nodeKey(from);
    const b = nodeKey(to);
    if (a === b) return;
    if (!nodes.has(a)) nodes.set(a, { ...from });
    if (!nodes.has(b)) nodes.set(b, { ...to });
    const list = adjacency.get(a) ?? [];
    list.push({ neighbor: b, wallId });
    adjacency.set(a, list);
  };
  for (const wall of segments) {
    link(wall.start, wall.end, wall.id);
    link(wall.end, wall.start, wall.id);
  }

  // Depth-first enumeration of simple cycles back to each start node.
  const signatures = new Map<string, string[]>();
  const starts = [...adjacency.keys()].sort();
  for (const start of starts) {
    const stack: Array<{ node: string; usedWalls: string[]; usedNodes: Set<string> }> = [
      { node: start, usedWalls: [], usedNodes: new Set([start]) },
    ];
    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame || frame.usedWalls.length >= MAX_CYCLE_WALLS) continue;
      const edges = adjacency.get(frame.node) ?? [];
      for (const edge of edges) {
        if (frame.usedWalls.includes(edge.wallId)) continue;
        if (edge.neighbor === start) {
          if (frame.usedWalls.length >= 2) {
            const wallIds = [...frame.usedWalls, edge.wallId];
            const key = [...wallIds].sort().join('|');
            if (!signatures.has(key)) signatures.set(key, wallIds);
          }
          continue;
        }
        if (frame.usedNodes.has(edge.neighbor)) continue;
        // Canonical direction guard: only leave the start node towards
        // neighbors greater than the start, so each undirected cycle is
        // explored once and enumeration stays cheap.
        if (frame.usedWalls.length === 0 && edge.neighbor < start) continue;
        const usedNodes = new Set(frame.usedNodes);
        usedNodes.add(edge.neighbor);
        stack.push({
          node: edge.neighbor,
          usedWalls: [...frame.usedWalls, edge.wallId],
          usedNodes,
        });
      }
    }
  }

  // Order each candidate into a ring, drop invalid/sliver faces, then drop
  // non-minimal faces (an outer loop enclosing subdivided rooms).
  type Face = { wallIds: string[]; polygon: Vec2[]; area: number };
  const faces: Face[] = [];
  for (const wallIds of signatures.values()) {
    const polygon = orderBoundaryLoop(new Set(wallIds), wallsById, nodes);
    if (!polygon) continue;
    const area = polygonArea(polygon);
    if (area < MIN_ROOM_AREA_M2) continue;
    faces.push({ wallIds: [...new Set(wallIds)], polygon, area });
  }
  const minimal = faces.filter((face) => {
    const set = new Set(face.wallIds);
    return !faces.some(
      (other) =>
        other !== face &&
        other.wallIds.length < face.wallIds.length &&
        other.wallIds.every((id) => set.has(id)),
    );
  });
  // Drop composite loops: a face whose polygon strictly contains another
  // face's centroid encloses subdivided rooms and is not a room itself.
  // (Documented simplification: nested island rooms keep only the inner face.)
  const centroids = minimal.map((face) => polygonCentroid(face.polygon));
  const smallest = minimal.filter(
    (face) =>
      !minimal.some(
        (other, otherIndex) =>
          other !== face && pointStrictlyInPolygon(centroids[otherIndex], face.polygon),
      ),
  );
  if (process.env.ROOMS_DEBUG) {
    console.log('FACES:', JSON.stringify(minimal.map((f) => ({ area: f.area, ids: f.wallIds }))));
    console.log('SMALLEST:', JSON.stringify(smallest.map((f) => f.area)));
  }

  // Expose original wall ids (segments are an internal splitting detail).
  // Different segment cycles can share one origin boundary: keep the largest.
  const byOrigin = new Map<string, Face>();
  for (const face of smallest) {
    const origins = [...new Set(face.wallIds.map((id) => originOf.get(id) ?? id))].sort();
    const key = origins.join('|');
    const existing = byOrigin.get(key);
    if (!existing || face.area > existing.area) {
      byOrigin.set(key, { wallIds: origins, polygon: face.polygon, area: face.area });
    }
  }
  const rooms = [...byOrigin.values()].sort((a, b) => b.area - a.area);
  const previousById = new Map(previousRooms.map((room) => [room.id, room]));
  return rooms.map((face) => {
    const id = roomIdFor(face.wallIds);
    return {
      id,
      name: previousById.get(id)?.name ?? '',
      polygon: face.polygon,
      areaM2: face.area,
      wallIds: [...face.wallIds].sort(),
    };
  });
}
