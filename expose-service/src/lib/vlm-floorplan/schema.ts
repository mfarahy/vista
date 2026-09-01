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
  hostWallIds: z.array(z.string().min(1)).min(1).max(10),
  relationship: z.enum(['interrupts_wall', 'adjacent', 'uncertain']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).nullable(),
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

export const vlmFloorplanAnalysisSchema = z.object({
  wallRelationships: z.array(wallRelationshipSchema).max(50),
  openings: z.array(openingAssociationSchema).max(30),
  objectClassifications: z.array(objectClassificationSchema).max(30),
  rooms: z.array(roomHypothesisSchema).max(20),
  topologySummary: topologySummarySchema,
});

export type WallRelationship = z.infer<typeof wallRelationshipSchema>;
export type OpeningAssociation = z.infer<typeof openingAssociationSchema>;
export type ObjectClassification = z.infer<typeof objectClassificationSchema>;
export type RoomHypothesis = z.infer<typeof roomHypothesisSchema>;
export type TopologySummary = z.infer<typeof topologySummarySchema>;
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

export function validateVlmAnalysis(
  analysis: VlmFloorplanAnalysis,
  raw: Record<string, unknown>,
): { analysis: VlmFloorplanAnalysis; warnings: string[] } {
  const warnings: string[] = [];

  const filteredWallRelationships = analysis.wallRelationships.filter((r) => {
    const { valid, invalid } = filterIdGroup(r.wallIds, raw, 2);
    if (invalid.length) warnings.push(`wallRelationships invalid ids: ${invalid.join(',')}`);
    if (valid.length < 2) return false;
    r.wallIds = valid;
    return true;
  });

  const filteredOpenings = analysis.openings.filter((o) => {
    if (!isValidObjectId(o.objectId, raw)) {
      warnings.push(`openings invalid objectId: ${o.objectId}`);
      return false;
    }
    const { valid, invalid } = filterValidIds(o.hostWallIds, raw);
    if (invalid.length) warnings.push(`openings invalid hostWallIds: ${invalid.join(',')}`);
    if (valid.length === 0) return false;
    o.hostWallIds = valid;
    return true;
  });

  const filteredClassifications = analysis.objectClassifications.filter((c) => {
    if (!isValidObjectId(c.objectId, raw)) {
      warnings.push(`objectClassifications invalid objectId: ${c.objectId}`);
      return false;
    }
    return true;
  });

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

  // Topology summary — every ID must exist in RAW JSON; drop groups that no longer have enough valid IDs.
  const summary = analysis.topologySummary;
  const continuousWalls = summary.continuousWalls.filter((group) => {
    const { valid, invalid } = filterIdGroup(group, raw, 2);
    if (invalid.length) warnings.push(`topologySummary.continuousWalls invalid ids: ${invalid.join(',')}`);
    return valid.length >= 2;
  });
  const corners = summary.corners.filter((pair) => {
    const { valid, invalid } = filterIdGroup(pair, raw, 2);
    if (invalid.length) warnings.push(`topologySummary.corners invalid ids: ${invalid.join(',')}`);
    return valid.length >= 2;
  });
  const tJunctions = summary.tJunctions.filter((pair) => {
    const { valid, invalid } = filterIdGroup(pair, raw, 2);
    if (invalid.length) warnings.push(`topologySummary.tJunctions invalid ids: ${invalid.join(',')}`);
    return valid.length >= 2;
  });
  const falsePositives = summary.falsePositives.filter((id) => {
    if (!isValidObjectId(id, raw)) {
      warnings.push(`topologySummary.falsePositives invalid id: ${id}`);
      return false;
    }
    return true;
  });

  return {
    analysis: {
      wallRelationships: filteredWallRelationships,
      openings: filteredOpenings,
      objectClassifications: filteredClassifications,
      rooms: filteredRooms,
      topologySummary: { continuousWalls, corners, tJunctions, falsePositives },
    },
    warnings,
  };
}
