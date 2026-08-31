import { z } from 'zod';

export const wallRelationshipSchema = z.object({
  wallIds: z.array(z.string().min(1)).min(2).max(10),
  relationship: z.enum([
    'same_continuous_wall',
    'separate_walls',
    'corner',
    'T_junction',
    'uncertain',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).optional(),
});

export const openingAssociationSchema = z.object({
  objectId: z.string().min(1),
  type: z.enum(['door', 'entry_door', 'window']),
  hostWallIds: z.array(z.string().min(1)).min(1).max(10),
  relationship: z.enum(['interrupts_wall', 'adjacent', 'uncertain']).default('interrupts_wall'),
  confidence: z.number().min(0).max(1),
});

export const wallConnectionSchema = z.object({
  wallIds: z.array(z.string().min(1)).length(2),
  relationship: z.enum(['corner', 'T_junction', 'intersection', 'collinear', 'uncertain']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).optional(),
});

export const roomHypothesisSchema = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(['living', 'kitchen', 'hallway', 'bathroom', 'entrance', 'utility', 'bedroom', 'terrace', 'outside', 'unknown']),
  boundaryObjects: z.array(z.string().min(1)).min(1).max(30),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).optional(),
});

export const artifactSchema = z.object({
  objectId: z.string().min(1),
  classification: z.enum(['likely_false_positive', 'suspicious', 'likely_missing_wall']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500).optional(),
});

export const vlmFloorplanAnalysisSchema = z.object({
  wallRelationships: z.array(wallRelationshipSchema).max(50).default([]),
  openings: z.array(openingAssociationSchema).max(30).default([]),
  wallConnections: z.array(wallConnectionSchema).max(50).default([]),
  rooms: z.array(roomHypothesisSchema).max(20).default([]),
  artifacts: z.array(artifactSchema).max(30).default([]),
});

export type WallRelationship = z.infer<typeof wallRelationshipSchema>;
export type OpeningAssociation = z.infer<typeof openingAssociationSchema>;
export type WallConnection = z.infer<typeof wallConnectionSchema>;
export type RoomHypothesis = z.infer<typeof roomHypothesisSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
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

export function validateVlmAnalysis(
  analysis: VlmFloorplanAnalysis,
  raw: Record<string, unknown>,
): { analysis: VlmFloorplanAnalysis; warnings: string[] } {
  const warnings: string[] = [];

  const filteredWallRelationships = analysis.wallRelationships.filter((r) => {
    const { valid, invalid } = filterValidIds(r.wallIds, raw);
    if (invalid.length) warnings.push(`wallRelationships invalid ids: ${invalid.join(',')}`);
    // keep only if at least 2 valid remain
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

  const filteredWallConnections = analysis.wallConnections.filter((c) => {
    const { valid, invalid } = filterValidIds(c.wallIds, raw);
    if (invalid.length) warnings.push(`wallConnections invalid ids: ${invalid.join(',')}`);
    if (valid.length < 2) return false;
    c.wallIds = valid as [string, string];
    return true;
  });

  const filteredRooms = analysis.rooms.filter((r) => {
    const { valid, invalid } = filterValidIds(r.boundaryObjects, raw);
    if (invalid.length) warnings.push(`rooms ${r.id} invalid boundaryObjects: ${invalid.join(',')}`);
    if (valid.length === 0) return false;
    r.boundaryObjects = valid;
    return true;
  });

  const filteredArtifacts = analysis.artifacts.filter((a) => {
    if (!isValidObjectId(a.objectId, raw)) {
      warnings.push(`artifacts invalid objectId: ${a.objectId}`);
      return false;
    }
    return true;
  });

  return {
    analysis: {
      wallRelationships: filteredWallRelationships,
      openings: filteredOpenings,
      wallConnections: filteredWallConnections,
      rooms: filteredRooms,
      artifacts: filteredArtifacts,
    },
    warnings,
  };
}
