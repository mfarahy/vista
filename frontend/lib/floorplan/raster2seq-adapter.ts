/**
 * Phase 4 Raster2Seq → FloorPlan adapter.
 *
 * Converts the response of the existing local Raster2Seq service
 * (`POST /api/floorplan/analyze`, or the GPU-compatible `POST /predict`
 * alias consumed by expose-service) into the canonical Vista FloorPlan
 * model. This module is the only place that knows the Raster2Seq response
 * shape; the editor works exclusively with `FloorPlan`.
 *
 * Actual response contract (see `raster2seq-local/api/server.js` and
 * `raster2seq-local/inference/infer_single.py`):
 * - `spaces[]`: `{id, category_id, label, polygon}` where `polygon` is a
 *   list of `[x, y]` points in the **256×256 padded model-input space**
 *   (`coordinate_space: "model-input-256x256-padded"`), exactly as the
 *   model emits them. Room entries are closed polygons; door/window entries
 *   (`category_id` 9/10, labels `Window`/`Door`) are 2-point line segments.
 * - `refined_spaces[]` (only with `?refine=vlm`): `{id, room_type, area,
 *   polygon, graph}` in the same 256×256 space, with VLM-corrected room
 *   types and cleaned polygons. Preferred when present.
 *
 * Coordinate pipeline (explicit, testable stages):
 * - `spaces[]` polygons live in the 256x256 padded model-input space.
 * - When the source image size is known, the upstream `ResizeAndPad`
 *   letterbox is inverted exactly (remove padding, divide by resize scale;
 *   see `raster2seq-geometry.ts`) to recover original-image pixels. Without
 *   a source size the input is treated as square (identity, legacy behavior).
 * - Original-image pixels map to Vista world meters with a fixed uniform
 *   scale of `RASTER2SEQ_METERS_PER_PX`.
 *
 * Scale assumption (documented): Raster2Seq provides no real-world scale,
 * so relative geometry and proportions are preserved with a fixed
 * `RASTER2SEQ_METERS_PER_PX` (0.05 m/px — a full 256-unit span maps to
 * 12.8 m, a typical apartment scale). Absolute measurements are therefore
 * approximate editing dimensions, not surveyed values; the UI tells the
 * user to verify dimensions.
 *
 * Wall thickness assumption (documented): Raster2Seq predicts room/space
 * boundaries, not wall bodies, so thickness cannot be measured from the
 * response. Imports reuse the editor default (`DEFAULT_WALL_THICKNESS_M`)
 * via `RASTER2SEQ_WALL_THICKNESS_M` — a single construction system that
 * stays editable in the properties panel.
 *
 * Conversion strategy (minimum deterministic matching, no vision logic):
 * - Walls are the unique edges of all interior room polygons (outdoor
 *   spaces excluded, like `v360-geometry`). Endpoints are quantized to a
 *   0.5-unit grid so near-coincident corners connect.
 * - Raw walls then pass through the conservative `cleanupImportedWalls`
 *   stage (dedupe, orthogonal snap, endpoint clustering, collinear merge)
 *   before anything else consumes them.
 * - Openings attach to the nearest cleaned wall within `OPENING_MATCH_M`;
 *   their center/width use the existing wall-fraction (`centerT`)
 *   representation, clamped so the opening fits on the host wall. Walls
 *   stay continuous semantic boundaries; the editor renders the gaps.
 * - Rooms come from Vista's existing `detectRooms` over the cleaned walls;
 *   Raster2Seq labels survive as room names via centroid matching. When no
 *   closed room is detected (overlapping draft polygons), room polygons are
 *   kept directly with areas computed from canonical geometry, so no
 *   information is lost.
 * - The result always passes through the Phase 3 `validateFloorPlan`
 *   layer; invalid geometry never enters the editor.
 *
 * No DOM, no React.
 */
import {
  DEFAULT_WALL_THICKNESS_M,
  FLOORPLAN_SCHEMA_VERSION,
  FLOORPLAN_UNITS,
  MIN_ROOM_AREA_M2,
  MIN_WALL_LENGTH_M,
  clampOpeningWidth,
  type Door,
  type FloorPlan,
  type Room,
  type Vec2,
  type Wall,
  type Window,
} from './model';
import { detectRooms } from './rooms';
import { clampOpeningT, pointInPolygon, polygonArea, projectPointToWall } from './geometry';
import {
  cleanupImportedWalls,
  letterboxTransformFor,
  modelToSourcePoint,
  type LetterboxTransform,
} from './raster2seq-geometry';
import { validateFloorPlan } from './validation';

/** Fixed uniform scale: original-image pixels → meters. See header. */
export const RASTER2SEQ_METERS_PER_PX = 0.05;
/** Model-input space edge length reported by the service (`image_size`). */
export const RASTER2SEQ_IMAGE_SIZE = 256;
/**
 * Imported wall thickness: Raster2Seq predicts boundaries, not wall bodies,
 * so imports reuse the editor default (single construction system).
 */
export const RASTER2SEQ_WALL_THICKNESS_M = DEFAULT_WALL_THICKNESS_M;
/** Endpoint quantization grid in model-input units (merges corner jitter). */
const QUANT_PX = 0.5;
/** Opening segments shorter than this are treated as noise and skipped. */
const MIN_OPENING_M = 0.15;
/** Maximum distance between an opening segment and its host wall. */
const OPENING_MATCH_M = 0.5;

/** Draft entry: `{id, category_id, label, polygon}` (upstream `--save_pred` renamed). */
export type Raster2SeqDraftSpace = {
  id: number | string;
  category_id?: number;
  label?: string;
  polygon?: unknown;
};

/** Refined entry: `{id, room_type, area, polygon, graph}` (VLM stage). */
export type Raster2SeqRefinedSpace = {
  id: number | string;
  room_type?: string;
  polygon?: unknown;
};

/** Subset of the local service result the adapter consumes. */
export type Raster2SeqAnalysis = {
  spaces?: Raster2SeqDraftSpace[];
  refined_spaces?: Raster2SeqRefinedSpace[];
  /** Optional original image size in pixels (enables letterbox inversion). */
  source_width?: unknown;
  source_height?: unknown;
};

/** Optional conversion inputs that are not part of the service response. */
export type Raster2SeqConvertOptions = {
  /**
   * Original uploaded image size in pixels. Wins over response-embedded
   * dimensions. Omit (and omit response fields) to treat the model input
   * as square — the legacy behavior for fixtures without source sizes.
   */
  sourceSize?: { width: number; height: number };
};

export type Raster2SeqFailureReason =
  | 'malformed'
  | 'empty'
  | 'invalid-geometry'
  | 'validation-failed';

export type Raster2SeqConversion =
  | { ok: true; plan: FloorPlan }
  | { ok: false; reason: Raster2SeqFailureReason };

type NormalizedSpace =
  | { kind: 'room'; name: string; pointsPx: Vec2[] }
  | { kind: 'door' | 'window'; pointsPx: Vec2[] };

const OUTDOOR_CATEGORY_ID = 0;

function isOutdoorRoomType(roomType: string): boolean {
  return /outdoor|outside|exterior/i.test(roomType ?? '');
}

function isOpeningLabel(label: string): 'door' | 'window' | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'door') return 'door';
  if (normalized === 'window') return 'window';
  return null;
}

function isNoNameLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return normalized === '' || normalized === 'undefined';
}

function toFinitePoint(pair: unknown): Vec2 | null {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const x = Number(pair[0]);
  const y = Number(pair[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function toPointList(polygon: unknown): Vec2[] | null {
  if (!Array.isArray(polygon)) return null;
  const points: Vec2[] = [];
  for (const pair of polygon) {
    const point = toFinitePoint(pair);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

/** Drop consecutive duplicate vertices (the model emits repeated points). */
function dedupeConsecutive(points: Vec2[]): Vec2[] {
  const clean: Vec2[] = [];
  for (const point of points) {
    const prev = clean[clean.length - 1];
    if (!prev || prev.x !== point.x || prev.y !== point.y) clean.push(point);
  }
  return clean;
}

function quantize(value: number): number {
  return Math.round(value / QUANT_PX) * QUANT_PX;
}

/**
 * Resolve the letterbox inversion for a response: explicit options win,
 * then response-embedded `source_width`/`source_height`, then null (square
 * input assumption — model coordinates pass through unchanged).
 */
function resolveLetterbox(input: unknown, options?: Raster2SeqConvertOptions): LetterboxTransform | null {
  const fromOptions =
    options?.sourceSize && Number.isFinite(options.sourceSize.width) && Number.isFinite(options.sourceSize.height)
      ? letterboxTransformFor(options.sourceSize.width, options.sourceSize.height)
      : null;
  if (fromOptions) return fromOptions;
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const raw = input as Record<string, unknown>;
    const width = Number(raw.source_width);
    const height = Number(raw.source_height);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return letterboxTransformFor(width, height);
    }
  }
  return null;
}

/**
 * Build the world-coordinate converter for one response: model-input units
 * -> (letterbox inversion) -> original-image pixels -> meters.
 */
function makeToMeters(letterbox: LetterboxTransform | null): (pointPx: Vec2) => Vec2 {
  const round3 = (value: number) => Math.round(value * 1000) / 1000;
  return (pointPx: Vec2) => {
    const source = letterbox ? modelToSourcePoint(pointPx, letterbox) : pointPx;
    return {
      x: round3(source.x * RASTER2SEQ_METERS_PER_PX),
      y: round3(source.y * RASTER2SEQ_METERS_PER_PX),
    };
  };
}

/**
 * Normalize one response into classified spaces. Refined entries win when
 * present (VLM-corrected room types, cleaned polygons); otherwise the draft
 * spaces are used. Returns null for a malformed response.
 */
function normalizeSpaces(input: unknown): NormalizedSpace[] | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const raw = input as Partial<Raster2SeqAnalysis>;
  const refined = Array.isArray(raw.refined_spaces) ? raw.refined_spaces : [];
  const draft = Array.isArray(raw.spaces) ? raw.spaces : [];
  if (refined.length === 0 && draft.length === 0) return null;

  const spaces: NormalizedSpace[] = [];
  if (refined.length > 0) {
    for (const entry of refined) {
      if (typeof entry !== 'object' || entry === null) return null;
      const roomType = typeof entry.room_type === 'string' ? entry.room_type : '';
      const points = dedupeConsecutive(toPointList(entry.polygon) ?? []);
      if (points.length < 2) continue;
      const opening = isOpeningLabel(roomType);
      if (opening) {
        spaces.push({ kind: opening, pointsPx: points });
        continue;
      }
      if (isOutdoorRoomType(roomType) || points.length < 3) continue;
      spaces.push({
        kind: 'room',
        name: isNoNameLabel(roomType) ? '' : roomType.slice(0, 64),
        pointsPx: points,
      });
    }
    return spaces;
  }

  for (const entry of draft) {
    if (typeof entry !== 'object' || entry === null) return null;
    const label = typeof entry.label === 'string' ? entry.label : '';
    const points = dedupeConsecutive(toPointList(entry.polygon) ?? []);
    if (points.length < 2) continue;
    const openingByCategory =
      entry.category_id === 9 ? 'window' : entry.category_id === 10 ? 'door' : null;
    const opening = openingByCategory ?? isOpeningLabel(label);
    if (opening) {
      spaces.push({ kind: opening, pointsPx: points });
      continue;
    }
    if (entry.category_id === OUTDOOR_CATEGORY_ID || points.length < 3) continue;
    spaces.push({
      kind: 'room',
      name: isNoNameLabel(label) ? '' : label.slice(0, 64),
      pointsPx: points,
    });
  }
  return spaces;
}

function edgeKey(a: Vec2, b: Vec2): string {
  const ka = `${a.x}|${a.y}`;
  const kb = `${b.x}|${b.y}`;
  return ka < kb ? `${ka}~${kb}` : `${kb}~${ka}`;
}

/**
 * Unique wall edges from room polygons, converted to world meters and run
 * through the conservative geometry cleanup (dedupe, orthogonal snap,
 * endpoint clustering, collinear merge). Ids are dense and deterministic.
 */
function extractWalls(
  rooms: Array<{ pointsPx: Vec2[] }>,
  toMeters: (pointPx: Vec2) => Vec2,
): Wall[] {
  const seen = new Map<string, { a: Vec2; b: Vec2 }>();
  for (const room of rooms) {
    const quantized = room.pointsPx.map((p) => ({ x: quantize(p.x), y: quantize(p.y) }));
    const clean = dedupeConsecutive(quantized);
    if (clean.length > 1 && clean[0].x === clean[clean.length - 1].x && clean[0].y === clean[clean.length - 1].y) {
      clean.pop();
    }
    for (let i = 0; i < clean.length; i++) {
      const a = clean[i];
      const b = clean[(i + 1) % clean.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
      const key = edgeKey(a, b);
      if (!seen.has(key)) seen.set(key, { a, b });
    }
  }
  const edges = [...seen.values()];
  edges.sort((e1, e2) => {
    const a1 = Math.min(e1.a.x, e1.b.x);
    const a2 = Math.min(e2.a.x, e2.b.x);
    if (a1 !== a2) return a1 - a2;
    const b1 = Math.min(e1.a.y, e1.b.y);
    const b2 = Math.min(e2.a.y, e2.b.y);
    if (b1 !== b2) return b1 - b2;
    const c1 = Math.max(e1.a.x, e1.b.x);
    const c2 = Math.max(e2.a.x, e2.b.x);
    if (c1 !== c2) return c1 - c2;
    return Math.max(e1.a.y, e1.b.y) - Math.max(e2.a.y, e2.b.y);
  });
  const raw: Wall[] = [];
  edges.forEach((edge, index) => {
    const start = toMeters(edge.a);
    const end = toMeters(edge.b);
    if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_WALL_LENGTH_M) return;
    raw.push({ id: `wall-raw-${index + 1}`, start, end, thickness: RASTER2SEQ_WALL_THICKNESS_M });
  });
  const { walls: cleaned } = cleanupImportedWalls(raw);
  const walls = cleaned.filter(
    (wall) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) >= MIN_WALL_LENGTH_M,
  );
  // Ids must be dense after cleanup filtering for stable snapshots.
  walls.forEach((wall, index) => {
    wall.id = `wall-${index + 1}`;
  });
  return walls;
}

/**
 * Attach opening segments to their nearest cleaned host wall (deterministic
 * geometric matching). Walls stay continuous semantic boundaries; the
 * editor renders the gaps. The center is clamped so the opening always fits
 * on its host wall.
 */
function attachOpenings(
  openings: Array<{ kind: 'door' | 'window'; pointsPx: Vec2[] }>,
  walls: Wall[],
  toMeters: (pointPx: Vec2) => Vec2,
): { doors: Door[]; windows: Window[] } {
  const doors: Door[] = [];
  const windows: Window[] = [];
  let doorIndex = 0;
  let windowIndex = 0;
  for (const opening of openings) {
    const a = toMeters(opening.pointsPx[0]);
    const b = toMeters(opening.pointsPx[opening.pointsPx.length - 1]);
    if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_OPENING_M) continue;
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let best: { wall: Wall; t: number; distance: number } | null = null;
    for (const wall of walls) {
      const projected = projectPointToWall(center, wall);
      if (projected.distance <= OPENING_MATCH_M && (!best || projected.distance < best.distance)) {
        best = { wall, t: projected.t, distance: projected.distance };
      }
    }
    if (!best) continue;
    const width = clampOpeningWidth(Math.hypot(b.x - a.x, b.y - a.y));
    const centerT = clampOpeningT(best.wall, best.t, width);
    if (opening.kind === 'door') {
      doorIndex += 1;
      doors.push({ id: `door-${doorIndex}`, wallId: best.wall.id, centerT, width, swing: 'left' });
    } else {
      windowIndex += 1;
      windows.push({ id: `window-${windowIndex}`, wallId: best.wall.id, centerT, width });
    }
  }
  return { doors, windows };
}

function centroid(points: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * Assign Raster2Seq labels to detected rooms: a detected room takes the
 * name of the smallest source polygon containing its centroid (deterministic;
 * unnamed sources are skipped so auto names survive).
 */
function nameDetectedRooms(detected: Room[], sources: Array<{ name: string; polygon: Vec2[] }>): Room[] {
  const byArea = sources
    .map((source, index) => ({ source, index, area: polygonArea(source.polygon) }))
    .sort((a, b) => a.area - b.area || a.index - b.index);
  return detected.map((room) => {
    const center = centroid(room.polygon);
    for (const { source } of byArea) {
      if (!source.name) continue;
      if (pointInPolygon(center, source.polygon)) return { ...room, name: source.name };
    }
    return room;
  });
}

/**
 * Fallback when wall-based detection finds no closed room (overlapping
 * draft polygons): keep room polygons directly with computed areas. Wall
 * references stay empty; validation accepts that and the editor still
 * supports rename/selection.
 */
function fallbackRooms(sources: Array<{ name: string; polygon: Vec2[] }>): Room[] {
  const rooms: Room[] = [];
  sources.forEach((source, index) => {
    if (source.polygon.length < 3) return;
    const area = polygonArea(source.polygon);
    if (!(area >= MIN_ROOM_AREA_M2)) return;
    rooms.push({
      id: `room-imported-${index + 1}`,
      name: source.name,
      polygon: source.polygon.map((p) => ({ ...p })),
      areaM2: Math.round(area * 10) / 10,
      wallIds: [],
    });
  });
  return rooms;
}

/**
 * Convert a Raster2Seq analysis result into a canonical FloorPlan.
 * Never throws: every failure mode returns `{ok: false, reason}` so the
 * caller can keep the current plan and show a localized error.
 *
 * Pipeline: coordinate conversion (with letterbox inversion when the source
 * size is known) -> wall cleanup -> orthogonal/corner cleanup -> opening
 * association -> room detection -> validation.
 */
export function convertRaster2SeqToFloorPlan(
  input: unknown,
  options?: Raster2SeqConvertOptions,
): Raster2SeqConversion {
  let spaces: NormalizedSpace[] | null = null;
  try {
    spaces = normalizeSpaces(input);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!spaces) return { ok: false, reason: 'malformed' };

  const roomSources = spaces.filter((space) => space.kind === 'room');
  const openingSources = spaces.filter(
    (space): space is { kind: 'door' | 'window'; pointsPx: Vec2[] } => space.kind !== 'room',
  );
  if (roomSources.length === 0) return { ok: false, reason: 'empty' };

  const toMeters = makeToMeters(resolveLetterbox(input, options));
  const walls = extractWalls(roomSources, toMeters);
  if (walls.length === 0) return { ok: false, reason: 'invalid-geometry' };

  const { doors, windows } = attachOpenings(openingSources, walls, toMeters);

  const scaledSources = roomSources.map((room) => ({
    name: room.kind === 'room' ? room.name : '',
    polygon: room.pointsPx.map(toMeters),
  }));
  const detected = detectRooms(walls);
  const rooms = detected.length > 0 ? nameDetectedRooms(detected, scaledSources) : fallbackRooms(scaledSources);
  if (rooms.length === 0) return { ok: false, reason: 'invalid-geometry' };

  const plan: FloorPlan = {
    version: FLOORPLAN_SCHEMA_VERSION,
    units: FLOORPLAN_UNITS,
    walls,
    doors,
    windows,
    rooms,
  };
  const validation = validateFloorPlan(plan);
  if (!validation.valid) return { ok: false, reason: 'validation-failed' };
  return { ok: true, plan };
}
