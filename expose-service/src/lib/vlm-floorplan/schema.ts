import { z } from 'zod';

/**
 * VLM → topology contract.
 *
 * The VLM's ONLY responsibility is to describe relationships between RAW
 * recognition objects and to flag incorrect detections. It never produces
 * coordinates or geometry — the RAW recognition remains the only source of
 * pixel coordinates. A deterministic geometry solver can later consume this
 * contract.
 */

// ---- Wall relationships ----

export const wallRelationshipSchema = z.object({
  wallIds: z.array(z.string().min(1)).min(2).max(10),
  relationship: z.enum([
    'same_continuous_wall',
    'separate_walls',
    'collinear',
    'perpendicular',
    'corner',
    'T_junction',
    'extension_of',
    'uncertain',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).nullable(),
});

// ---- Opening relationships ----

export const openingAssociationSchema = z.object({
  objectId: z.string().min(1),
  type: z.enum(['door', 'entry_door', 'window']),
  hostWallIds: z.array(z.string().min(1)).max(10),
  relationship: z.enum(['interrupts_wall', 'adjacent', 'uncertain']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).nullable(),
}).superRefine((val, ctx) => {
  if (val.hostWallIds.length === 0 && val.relationship !== 'uncertain') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'hostWallIds may only be empty when relationship is "uncertain"',
    });
  }
  if (val.relationship === 'uncertain' && val.hostWallIds.length > 0) {
    // allowed but we keep it permissive; validation layer will handle
  }
});

// ---- Object classification ----

export const objectClassificationSchema = z.object({
  objectId: z.string().min(1),
  classification: z.enum(['valid', 'suspicious', 'likely_false_positive', 'uncertain']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).nullable(),
});

// ---- Room semantics (references to RAW objects only, never coordinates) ----

export const roomHypothesisSchema = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(['living', 'kitchen', 'hallway', 'bathroom', 'entrance', 'utility', 'bedroom', 'terrace', 'outside', 'unknown']),
  boundaryWalls: z.array(z.string().min(1)).min(1).max(30),
  openings: z.array(z.string().min(1)).max(30),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).nullable(),
});

// ---- Compact topology summary (only RAW object IDs) ----

export const topologySummarySchema = z.object({
  continuousWalls: z.array(z.array(z.string().min(1)).min(2).max(10)).max(30),
  corners: z.array(z.array(z.string().min(1)).length(2)).max(30),
  tJunctions: z.array(z.array(z.string().min(1)).length(2)).max(30),
  falsePositives: z.array(z.string().min(1)).max(30),
});

export const emptyTopologySummary = (): TopologySummary => ({
  continuousWalls: [],
  corners: [],
  tJunctions: [],
  falsePositives: [],
});

// ---- Geometry constraints (VLM proposes constraints, never geometry) ----
//
// The VLM's ONLY job here is to propose deterministic, actionable geometric
// relationships between existing RAW recognition objects. It NEVER produces
// coordinates, lengths or replacement geometry. For directional constraint
// types the ORDER of `objectIds` is significant: the first ID is the source,
// subsequent IDs are the targets (see `geometryConstraintSchema` docs below).

export const geometryConstraintTypeSchema = z.enum([
  'merge_walls',
  'continue_wall',
  'extend_wall',
  'remove_object',
  'parallel_walls',
  'perpendicular_walls',
  'same_axis',
  'wall_corner',
  'wall_t_junction',
  'opening_interrupts_wall',
]);

/**
 * A single geometry constraint.
 *
 * Directional semantics (order of objectIds matters — encoded explicitly in the
 * data, never buried in `reason`):
 * - continue_wall: [source, target] — the wall continues from source toward target.
 * - extend_wall: [source, target] — source is truncated and extended to reach target.
 * - opening_interrupts_wall: [opening, hostWall] — the opening interrupts the host wall.
 * - all other types are symmetric (ID order is not semantically significant).
 */
export const geometryConstraintSchema = z
  .object({
    type: geometryConstraintTypeSchema,
    objectIds: z.array(z.string().min(1)).min(1).max(10),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(500).nullable(),
  })
  .superRefine((val, ctx) => {
    // remove_object may target a single RAW object; every other constraint type
    // describes a relationship and therefore needs at least two objects.
    if (val.type !== 'remove_object' && val.objectIds.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `geometryConstraints of type "${val.type}" require at least 2 objectIds`,
      });
    }
  });

export const vlmFloorplanAnalysisSchema = z.object({
  wallRelationships: z.array(wallRelationshipSchema).max(50),
  openings: z.array(openingAssociationSchema).max(30),
  objectClassifications: z.array(objectClassificationSchema).max(30),
  rooms: z.array(roomHypothesisSchema).max(20),
  topologySummary: topologySummarySchema,
  geometryConstraints: z.array(geometryConstraintSchema).max(100).default([]),
});

export type WallRelationship = z.infer<typeof wallRelationshipSchema>;
export type OpeningAssociation = z.infer<typeof openingAssociationSchema>;
export type ObjectClassification = z.infer<typeof objectClassificationSchema>;
export type RoomHypothesis = z.infer<typeof roomHypothesisSchema>;
export type TopologySummary = z.infer<typeof topologySummarySchema>;
export type GeometryConstraintType = z.infer<typeof geometryConstraintTypeSchema>;
export type GeometryConstraint = z.infer<typeof geometryConstraintSchema>;
export type VlmFloorplanAnalysis = z.infer<typeof vlmFloorplanAnalysisSchema>;

// Validation helpers for mapping VLM object IDs to raw recognition objects

const RAW_CATEGORIES = [
  'entry_door_center_line',
  'window_center_line',
  'door_center_line',
  'entry_door',
  'window',
  'kitchen',
  'wall',
  'door',
] as const;

export function parseObjectId(objectId: string): { category: string; index: number } | null {
  for (const cat of RAW_CATEGORIES) {
    const prefix = `${cat}-`;
    if (objectId.startsWith(prefix)) {
      const idxStr = objectId.slice(prefix.length);
      if (!idxStr || !/^\d+$/.test(idxStr)) continue;
      const idx = Number(idxStr);
      if (Number.isInteger(idx) && idx >= 0) return { category: cat, index: idx };
    }
  }
  return null;
}

export function isValidObjectId(
  objectId: string,
  raw: Record<string, unknown>,
): boolean {
  const parsed = parseObjectId(objectId);
  if (!parsed) return false;
  const arr = raw[parsed.category];
  if (!Array.isArray(arr)) return false;
  return parsed.index < arr.length;
}

export function filterValidIds(
  ids: string[],
  raw: Record<string, unknown>,
): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of ids) {
    if (isValidObjectId(id, raw)) valid.push(id);
    else invalid.push(id);
  }
  return { valid, invalid };
}

function filterIdGroup(
  ids: string[],
  raw: Record<string, unknown>,
  minValid: number,
): { valid: string[]; invalid: string[] } {
  const { valid, invalid } = filterValidIds(ids, raw);
  if (valid.length >= minValid) return { valid, invalid };
  return { valid: [], invalid };
}

/**
 * Deduplication: for duplicate object relationships prefer higher confidence.
 * If confidence is effectively tied (within EPS) but relationships conflict,
 * mark the result uncertain. Never silently choose contradictory facts.
 */
const DEDUP_EPS = 0.001;

function normalizeWallKey(ids: string[]): string {
  return [...ids].sort().join('|');
}

function deduplicateWallRelationships(
  relationships: WallRelationship[],
  raw: Record<string, unknown>,
  warnings: string[],
): WallRelationship[] {
  // First filter invalid IDs
  const filtered: WallRelationship[] = [];
  for (const r of relationships) {
    const { valid, invalid } = filterIdGroup(r.wallIds, raw, 2);
    if (invalid.length) warnings.push(`wallRelationships invalid ids: ${invalid.join(',')}`);
    if (valid.length < 2) continue;
    // normalize to sorted order for dedup stability, but preserve original sorted
    const sortedValid = [...valid].sort();
    filtered.push({ ...r, wallIds: sortedValid });
  }

  // Group by normalized key
  const groups = new Map<string, WallRelationship[]>();
  for (const r of filtered) {
    const key = normalizeWallKey(r.wallIds);
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const result: WallRelationship[] = [];
  for (const [key, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    // sort by confidence desc
    group.sort((a, b) => b.confidence - a.confidence);
    const top = group[0];
    const second = group[1];
    const tie = Math.abs(top.confidence - second.confidence) < DEDUP_EPS;
    const conflict = group.some((g) => g.relationship !== top.relationship);
    if (tie && conflict) {
      warnings.push(
        `wallRelationships duplicate conflict for ${key}: ${group.map((g) => `${g.relationship}(${g.confidence})`).join(', ')} → marked uncertain`,
      );
      result.push({ ...top, relationship: 'uncertain', reason: `Conflicting relationships for ${key}: ${group.map((g) => g.relationship).join(', ')}` });
    } else {
      if (group.length > 1) {
        warnings.push(`wallRelationships duplicate for ${key}: kept highest confidence ${top.relationship} (${top.confidence}), dropped ${group.length - 1} duplicate(s)`);
      }
      result.push(top);
    }
  }
  return result;
}

function deduplicateOpenings(
  openings: OpeningAssociation[],
  raw: Record<string, unknown>,
  warnings: string[],
): OpeningAssociation[] {
  const filtered: OpeningAssociation[] = [];
  for (const o of openings) {
    if (!isValidObjectId(o.objectId, raw)) {
      warnings.push(`openings invalid objectId: ${o.objectId}`);
      continue;
    }
    const { valid, invalid } = filterValidIds(o.hostWallIds, raw);
    if (invalid.length) warnings.push(`openings invalid hostWallIds: ${invalid.join(',')}`);
    // Allow empty hostWallIds only when uncertain
    if (valid.length === 0 && o.relationship !== 'uncertain') {
      warnings.push(`openings ${o.objectId} has no valid hostWallIds but relationship is ${o.relationship} → dropped`);
      continue;
    }
    filtered.push({ ...o, hostWallIds: valid });
  }

  const groups = new Map<string, OpeningAssociation[]>();
  for (const o of filtered) {
    const arr = groups.get(o.objectId) ?? [];
    arr.push(o);
    groups.set(o.objectId, arr);
  }

  const result: OpeningAssociation[] = [];
  for (const [objId, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    group.sort((a, b) => b.confidence - a.confidence);
    const top = group[0];
    const second = group[1];
    const tie = Math.abs(top.confidence - second.confidence) < DEDUP_EPS;
    const conflict = group.some((g) => g.relationship !== top.relationship || g.hostWallIds.join('|') !== top.hostWallIds.join('|'));
    if (tie && conflict) {
      warnings.push(`openings duplicate conflict for ${objId}: ${group.map((g) => `${g.relationship}(${g.confidence})`).join(', ')} → marked uncertain`);
      result.push({ ...top, relationship: 'uncertain', hostWallIds: [], reason: `Conflicting opening associations for ${objId}` });
    } else {
      warnings.push(`openings duplicate for ${objId}: kept highest confidence ${top.relationship} (${top.confidence}), dropped ${group.length - 1} duplicate(s)`);
      result.push(top);
    }
  }
  return result;
}

function deduplicateClassifications(
  classifications: ObjectClassification[],
  raw: Record<string, unknown>,
  warnings: string[],
): ObjectClassification[] {
  const filtered: ObjectClassification[] = [];
  for (const c of classifications) {
    if (!isValidObjectId(c.objectId, raw)) {
      warnings.push(`objectClassifications invalid objectId: ${c.objectId}`);
      continue;
    }
    filtered.push({ ...c });
  }

  const groups = new Map<string, ObjectClassification[]>();
  for (const c of filtered) {
    const arr = groups.get(c.objectId) ?? [];
    arr.push(c);
    groups.set(c.objectId, arr);
  }

  const result: ObjectClassification[] = [];
  for (const [objId, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    group.sort((a, b) => b.confidence - a.confidence);
    const top = group[0];
    const second = group[1];
    const tie = Math.abs(top.confidence - second.confidence) < DEDUP_EPS;
    const conflict = group.some((g) => g.classification !== top.classification);
    if (tie && conflict) {
      warnings.push(`objectClassifications duplicate conflict for ${objId}: ${group.map((g) => `${g.classification}(${g.confidence})`).join(', ')} → marked uncertain`);
      result.push({ ...top, classification: 'uncertain', reason: `Conflicting classifications for ${objId}: ${group.map((g) => g.classification).join(', ')}` });
    } else {
      warnings.push(`objectClassifications duplicate for ${objId}: kept highest confidence ${top.classification} (${top.confidence}), dropped ${group.length - 1} duplicate(s)`);
      result.push(top);
    }
  }
  return result;
}

function deduplicateTopologySummary(
  summary: TopologySummary,
  raw: Record<string, unknown>,
  warnings: string[],
): TopologySummary {
  function dedupGroups(groups: string[][], kind: string, minLen: number): string[][] {
    const seen = new Map<string, string[]>();
    const result: string[][] = [];
    for (const g of groups) {
      const { valid, invalid } = filterIdGroup(g, raw, minLen);
      if (invalid.length) warnings.push(`topologySummary.${kind} invalid ids: ${invalid.join(',')}`);
      if (valid.length < minLen) continue;
      const key = [...valid].sort().join('|');
      if (seen.has(key)) {
        warnings.push(`topologySummary.${kind} duplicate: ${valid.join(',')} dropped`);
        continue;
      }
      seen.set(key, valid);
      result.push(valid);
    }
    return result;
  }

  const continuousWalls = dedupGroups(summary.continuousWalls, 'continuousWalls', 2);
  const corners = dedupGroups(summary.corners, 'corners', 2);
  const tJunctions = dedupGroups(summary.tJunctions, 'tJunctions', 2);

  const seenFp = new Set<string>();
  const falsePositives: string[] = [];
  for (const id of summary.falsePositives) {
    if (!isValidObjectId(id, raw)) {
      warnings.push(`topologySummary.falsePositives invalid id: ${id}`);
      continue;
    }
    if (seenFp.has(id)) {
      warnings.push(`topologySummary.falsePositives duplicate: ${id} dropped`);
      continue;
    }
    seenFp.add(id);
    falsePositives.push(id);
  }

  return { continuousWalls, corners, tJunctions, falsePositives };
}

// Constraint types whose objectIds order is semantically significant (source → target).
const DIRECTIONAL_CONSTRAINT_TYPES = new Set(['continue_wall', 'extend_wall', 'opening_interrupts_wall']);

function deduplicateGeometryConstraints(
  constraints: GeometryConstraint[],
  raw: Record<string, unknown>,
  warnings: string[],
): GeometryConstraint[] {
  const filtered: GeometryConstraint[] = [];
  for (const c of constraints) {
    // remove_object may target a single RAW object; all other types need ≥2.
    const minValid = c.type === 'remove_object' ? 1 : 2;
    const { valid, invalid } = filterIdGroup(c.objectIds, raw, minValid);
    if (invalid.length) warnings.push(`geometryConstraints invalid objectIds: ${invalid.join(',')}`);
    if (valid.length < minValid) {
      if (valid.length > 0) warnings.push(`geometryConstraints ${c.type} constraint dropped — only ${valid.length} valid IDs remain`);
      else warnings.push(`geometryConstraints ${c.type} constraint dropped — no valid IDs`);
      continue;
    }
    filtered.push({ ...c, objectIds: valid });
  }

  // Deduplicate by type + objectIds key, keep highest confidence.
  // Directional types keep their original order (source → target); symmetric
  // types are normalized to sorted order so reversed duplicates collapse.
  const groups = new Map<string, GeometryConstraint[]>();
  for (const c of filtered) {
    const key = DIRECTIONAL_CONSTRAINT_TYPES.has(c.type)
      ? `${c.type}|${c.objectIds.join('|')}`
      : `${c.type}|${[...c.objectIds].sort().join('|')}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const result: GeometryConstraint[] = [];
  for (const [key, group] of groups) {
    if (group.length === 1) {
      result.push({ ...group[0], objectIds: [...group[0].objectIds] });
      continue;
    }
    group.sort((a, b) => b.confidence - a.confidence);
    const top = group[0];
    warnings.push(`geometryConstraints duplicate for ${key}: kept highest confidence (${top.confidence}), dropped ${group.length - 1} duplicate(s)`);
    result.push({ ...top, objectIds: [...top.objectIds] });
  }
  return result;
}

export function validateVlmAnalysis(
  analysis: VlmFloorplanAnalysis,
  raw: Record<string, unknown>,
): { analysis: VlmFloorplanAnalysis; warnings: string[] } {
  const warnings: string[] = [];

  const filteredWallRelationships = deduplicateWallRelationships(analysis.wallRelationships, raw, warnings);
  const filteredOpenings = deduplicateOpenings(analysis.openings, raw, warnings);
  const filteredClassifications = deduplicateClassifications(analysis.objectClassifications, raw, warnings);
  const geometryConstraints = (analysis as unknown as { geometryConstraints?: GeometryConstraint[] }).geometryConstraints ?? [];
  const filteredGeometryConstraints = deduplicateGeometryConstraints(geometryConstraints, raw, warnings);

  const filteredRooms = analysis.rooms.filter((r) => {
    // Support both new schema (boundaryWalls/openings) and legacy boundaryObjects fallback
    const rawRoom = r as unknown as Record<string, unknown>;
    const wallsRaw = (rawRoom.boundaryWalls as string[] | undefined) ?? (rawRoom.boundaryObjects as string[] | undefined) ?? [];
    const openingsRaw = (rawRoom.openings as string[] | undefined) ?? [];
    const { valid: validWalls, invalid: invalidWalls } = filterValidIds(wallsRaw, raw);
    const { valid: validOpenings, invalid: invalidOpenings } = filterValidIds(openingsRaw, raw);
    if (invalidWalls.length) warnings.push(`rooms ${r.id} invalid boundaryWalls: ${invalidWalls.join(',')}`);
    if (invalidOpenings.length) warnings.push(`rooms ${r.id} invalid openings: ${invalidOpenings.join(',')}`);
    if (rawRoom.boundaryObjects && !rawRoom.boundaryWalls) {
      warnings.push(`rooms ${r.id} uses deprecated boundaryObjects — please use boundaryWalls/openings`);
    }
    if (validWalls.length === 0) return false;
    // Normalize to new schema
    (r as unknown as Record<string, unknown>).boundaryWalls = validWalls;
    (r as unknown as Record<string, unknown>).openings = validOpenings;
    // Keep legacy field in sync for frontend that still reads boundaryObjects
    (r as unknown as Record<string, unknown>).boundaryObjects = validWalls;
    return true;
  });

  // Deduplicate rooms by id
  const roomSeen = new Set<string>();
  const dedupedRooms: typeof filteredRooms = [];
  for (const r of filteredRooms) {
    if (roomSeen.has(r.id)) {
      warnings.push(`rooms duplicate id: ${r.id} dropped`);
      continue;
    }
    roomSeen.add(r.id);
    dedupedRooms.push(r);
  }

  const topology = deduplicateTopologySummary(analysis.topologySummary, raw, warnings);

  return {
    analysis: {
      wallRelationships: filteredWallRelationships,
      openings: filteredOpenings,
      objectClassifications: filteredClassifications,
      rooms: dedupedRooms,
      topologySummary: topology,
      geometryConstraints: filteredGeometryConstraints,
    },
    warnings,
  };
}
