import type { CandidatesExtraction } from './ai/types';

/**
 * Debug surface for the AI geometry pipeline.
 *
 * Distinct from `VistaGeometry`: while `VistaGeometry` is the only *geometric
 * contract* the UI renders as final geometry, `GeometryDebug` carries the
 * Phase 4 candidate representation — accepted, ambiguous and rejected
 * candidates with the reasons behind their classification. It is only present
 * for the AI provider and only used by the developer debug tools.
 */
export type GeometryDebug = {
  candidates: CandidatesExtraction;
  /** Name of the ambiguity refinement provider that ran (default `noop`). */
  refinementProvider: string | null;
};