/**
 * Phase 3 FloorPlan validation layer.
 *
 * Validates the canonical serialized format (version, units, walls,
 * doors, windows, rooms) and returns structured issues instead of a
 * bare boolean so the UI can show concise localized errors.
 *
 * Notes:
 * - `message` strings are developer-oriented (English) and must NOT be
 *   rendered directly in the UI. The UI maps `code` to i18n keys.
 * - Missing `version`/`units` are accepted as legacy v1 metric plans;
 *   present-but-wrong values are rejected.
 *
 * No DOM, no React.
 */
import {
  FLOORPLAN_SCHEMA_VERSION,
  MAX_OPENING_WIDTH_M,
  MAX_WALL_THICKNESS_M,
  MIN_OPENING_WIDTH_M,
  MIN_ROOM_AREA_M2,
  MIN_WALL_LENGTH_M,
  MIN_WALL_THICKNESS_M,
  wallLength,
  type FloorPlan,
} from './model';
import { polygonArea } from './geometry';

export type FloorPlanIssue = {
  /** Stable machine-readable code, mapped to i18n keys by the UI. */
  code: string;
  /** JSON-path-ish location, e.g. `walls[2].thickness`. */
  path: string;
  /** Developer-oriented detail (English, never shown raw in UI). */
  message: string;
  /** Id of the offending entity, when applicable. */
  entityId?: string;
};

export type FloorPlanValidation = {
  valid: boolean;
  errors: FloorPlanIssue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateFloorPlan(input: unknown): FloorPlanValidation {
  const errors: FloorPlanIssue[] = [];
  const issue = (code: string, path: string, message: string, entityId?: string) => {
    errors.push(entityId === undefined ? { code, path, message } : { code, path, message, entityId });
  };

  if (!isRecord(input)) {
    issue('invalid-plan', '$', 'FloorPlan must be a JSON object.');
    return { valid: false, errors };
  }

  // --- Version & units ------------------------------------------------------
  const version = input.version;
  if (version !== undefined && version !== FLOORPLAN_SCHEMA_VERSION) {
    issue('unsupported-version', '$.version', `Unsupported schema version: ${String(version)}.`);
  }
  const units = input.units;
  if (units !== undefined && units !== 'm') {
    issue('invalid-units', '$.units', `Unsupported units: ${String(units)}.`);
  }

  // --- Shape ----------------------------------------------------------------
  const walls = Array.isArray(input.walls) ? input.walls : null;
  const doors = Array.isArray(input.doors) ? input.doors : null;
  const windows = Array.isArray(input.windows) ? input.windows : null;
  const rooms = Array.isArray(input.rooms) ? input.rooms : null;
  if (!walls) issue('missing-field', '$.walls', 'Missing walls array.');
  if (!doors) issue('missing-field', '$.doors', 'Missing doors array.');
  if (!windows) issue('missing-field', '$.windows', 'Missing windows array.');
  if (!rooms) issue('missing-field', '$.rooms', 'Missing rooms array.');
  if (!walls || !doors || !windows || !rooms) {
    return { valid: errors.length === 0, errors };
  }

  // --- Unique IDs (global across all entities) -------------------------------
  const seenIds = new Map<string, string>();
  const claimId = (id: unknown, path: string) => {
    if (typeof id !== 'string' || id.length === 0) {
      issue('invalid-id', path, 'Entity id must be a non-empty string.');
      return;
    }
    const first = seenIds.get(id);
    if (first !== undefined) {
      issue('duplicate-id', path, `Duplicate id "${id}" (also at ${first}).`, id);
    } else {
      seenIds.set(id, path);
    }
  };

  const wallIds = new Set<string>();
  walls.forEach((wall: unknown, index: number) => {
    const path = `$.walls[${index}]`;
    if (!isRecord(wall)) {
      issue('invalid-wall', path, 'Wall must be an object.');
      return;
    }
    claimId(wall.id, `${path}.id`);
    if (typeof wall.id === 'string' && wall.id.length > 0) wallIds.add(wall.id);

    const start = isRecord(wall.start) ? wall.start : null;
    const end = isRecord(wall.end) ? wall.end : null;
    const coords: Array<[string, unknown]> = [
      [`${path}.start.x`, start?.x],
      [`${path}.start.y`, start?.y],
      [`${path}.end.x`, end?.x],
      [`${path}.end.y`, end?.y],
    ];
    let coordsOk = true;
    for (const [p, v] of coords) {
      if (!isFiniteNumber(v)) {
        issue('invalid-number', p, 'Coordinate must be a finite number.', typeof wall.id === 'string' ? wall.id : undefined);
        coordsOk = false;
      }
    }
    if (coordsOk && start && end) {
      const length = wallLength({
        start: { x: start.x as number, y: start.y as number },
        end: { x: end.x as number, y: end.y as number },
      });
      if (!(length >= MIN_WALL_LENGTH_M)) {
        issue(
          'zero-length-wall',
          path,
          `Wall length ${length} m is below the minimum of ${MIN_WALL_LENGTH_M} m.`,
          typeof wall.id === 'string' ? wall.id : undefined,
        );
      }
    }
    if (!isFiniteNumber(wall.thickness)) {
      issue('invalid-number', `${path}.thickness`, 'Wall thickness must be a finite number.', typeof wall.id === 'string' ? wall.id : undefined);
    } else if (wall.thickness < MIN_WALL_THICKNESS_M || wall.thickness > MAX_WALL_THICKNESS_M) {
      issue(
        'invalid-thickness',
        `${path}.thickness`,
        `Wall thickness ${wall.thickness} m is outside [${MIN_WALL_THICKNESS_M}, ${MAX_WALL_THICKNESS_M}] m.`,
        typeof wall.id === 'string' ? wall.id : undefined,
      );
    }
  });

  const checkOpening = (opening: unknown, path: string, kind: 'door' | 'window') => {
    if (!isRecord(opening)) {
      issue(kind === 'door' ? 'invalid-door' : 'invalid-window', path, `${kind} must be an object.`);
      return;
    }
    const id = typeof opening.id === 'string' ? opening.id : undefined;
    claimId(opening.id, `${path}.id`);
    if (typeof opening.wallId !== 'string' || opening.wallId.length === 0) {
      issue('invalid-wall-ref', `${path}.wallId`, `${kind} wallId must be a non-empty string.`, id);
    } else if (!wallIds.has(opening.wallId)) {
      issue('invalid-wall-ref', `${path}.wallId`, `${kind} references missing wall "${opening.wallId}".`, id);
    }
    if (!isFiniteNumber(opening.centerT)) {
      issue('invalid-number', `${path}.centerT`, `${kind} centerT must be a finite number.`, id);
    } else if (opening.centerT < 0 || opening.centerT > 1) {
      issue('invalid-centerT', `${path}.centerT`, `${kind} centerT ${opening.centerT} is outside 0..1.`, id);
    }
    if (!isFiniteNumber(opening.width)) {
      issue('invalid-number', `${path}.width`, `${kind} width must be a finite number.`, id);
    } else if (opening.width < MIN_OPENING_WIDTH_M || opening.width > MAX_OPENING_WIDTH_M) {
      issue(
        'invalid-width',
        `${path}.width`,
        `${kind} width ${opening.width} m is outside [${MIN_OPENING_WIDTH_M}, ${MAX_OPENING_WIDTH_M}] m.`,
        id,
      );
    }
    if (kind === 'door') {
      if (opening.swing !== 'left' && opening.swing !== 'right') {
        issue('invalid-swing', `${path}.swing`, 'Door swing must be "left" or "right".', id);
      }
    }
  };

  doors.forEach((door: unknown, index: number) => checkOpening(door, `$.doors[${index}]`, 'door'));
  windows.forEach((window: unknown, index: number) => checkOpening(window, `$.windows[${index}]`, 'window'));

  rooms.forEach((room: unknown, index: number) => {
    const path = `$.rooms[${index}]`;
    if (!isRecord(room)) {
      issue('invalid-room', path, 'Room must be an object.');
      return;
    }
    const id = typeof room.id === 'string' ? room.id : undefined;
    claimId(room.id, `${path}.id`);
    if (typeof room.name !== 'string') {
      issue('invalid-room', `${path}.name`, 'Room name must be a string.', id);
    }
    if (!Array.isArray(room.polygon) || room.polygon.length < 3) {
      issue('invalid-boundary', `${path}.polygon`, 'Room boundary must have at least 3 points.', id);
    } else {
      room.polygon.forEach((p: unknown, i: number) => {
        if (!isRecord(p) || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
          issue('invalid-number', `${path}.polygon[${i}]`, 'Room polygon points must have finite x/y numbers.', id);
        }
      });
      const allFinite = room.polygon.every(
        (p: unknown) => isRecord(p) && isFiniteNumber(p.x) && isFiniteNumber(p.y),
      );
      if (allFinite) {
        const area = polygonArea(room.polygon as Array<{ x: number; y: number }>);
        if (!(area >= MIN_ROOM_AREA_M2)) {
          issue('invalid-area', `${path}.polygon`, `Room area ${area} m² is below the minimum of ${MIN_ROOM_AREA_M2} m².`, id);
        }
        if (!isFiniteNumber(room.areaM2)) {
          issue('invalid-number', `${path}.areaM2`, 'Room areaM2 must be a finite number.', id);
        } else if (Math.abs(room.areaM2 - area) > Math.max(0.05, area * 0.02)) {
          issue('invalid-area', `${path}.areaM2`, `Room areaM2 ${room.areaM2} does not match boundary area ${area}.`, id);
        }
      } else if (!isFiniteNumber(room.areaM2)) {
        issue('invalid-number', `${path}.areaM2`, 'Room areaM2 must be a finite number.', id);
      }
    }
    if (!Array.isArray(room.wallIds)) {
      issue('invalid-boundary', `${path}.wallIds`, 'Room wallIds must be an array.', id);
    } else {
      room.wallIds.forEach((wallId: unknown, i: number) => {
        if (typeof wallId !== 'string' || !wallIds.has(wallId)) {
          issue('invalid-wall-ref', `${path}.wallIds[${i}]`, `Room references missing wall "${String(wallId)}".`, id);
        }
      });
    }
  });

  // Metadata is optional; when present it must be a plain object with
  // string-only known fields.
  const metadata = (input as FloorPlan).metadata;
  if (metadata !== undefined) {
    if (!isRecord(metadata)) {
      issue('invalid-metadata', '$.metadata', 'Metadata must be an object.');
    } else {
      for (const key of ['name', 'createdAt', 'updatedAt'] as const) {
        const value = metadata[key];
        if (value !== undefined && typeof value !== 'string') {
          issue('invalid-metadata', `$.metadata.${key}`, 'Metadata field must be a string.');
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
