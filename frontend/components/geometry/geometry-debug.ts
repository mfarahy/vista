import type { OpeningCandidateStatus, RoomCandidateStatus } from '@/lib/geometry/ai/types';

/**
 * One inspectable entity in the geometry debug view. The overlay produces a
 * fully descriptive view-model; the inspector only renders it. Label texts are
 * i18n keys (never literals) so the whole surface stays localized.
 */
export type InspectedEntity = {
  key: string;
  /** i18n key for the entity type label. */
  typeKey: string;
  id: string;
  /** i18n key for the source (AI raw / normalized / derived / candidate). */
  sourceKey: string;
  confidence?: number;
  rows: InspectedRow[];
  status?: { statusKey: string; tone: 'valid' | 'uncertain' | 'invalid' } | null;
};

export type InspectedRow = {
  /** i18n key for the field label. */
  labelKey: string;
  /** Raw string value (numbers, ids, coordinates). */
  value?: string;
  /** i18n key resolved when the value is presentational text. */
  valueKey?: string;
};

/** Layers the developer debug view can toggle independently. */
export type GeometryDebugLayers = {
  original: boolean;
  raw: boolean;
  normalized: boolean;
  roomCandidates: boolean;
  openingCandidates: boolean;
};

export const DEFAULT_DEBUG_LAYERS: GeometryDebugLayers = {
  original: true,
  raw: false,
  normalized: true,
  roomCandidates: false,
  openingCandidates: false,
};

export const DEBUG_LAYER_ORDER: (keyof GeometryDebugLayers)[] = [
  'original',
  'raw',
  'normalized',
  'roomCandidates',
  'openingCandidates',
];

export const ROOM_CANDIDATE_TONE: Record<RoomCandidateStatus, string> = {
  accepted: 'var(--primary)',
  rejected: 'var(--destructive)',
};

export const OPENING_CANDIDATE_TONE: Record<OpeningCandidateStatus, string> = {
  valid: 'var(--sky-600)',
  uncertain: 'var(--amber-600)',
  invalid: 'var(--destructive)',
};

export function openingCandidateTone(status: OpeningCandidateStatus): string {
  return OPENING_CANDIDATE_TONE[status];
}