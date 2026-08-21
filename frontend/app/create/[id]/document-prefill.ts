import type { DocumentRecord } from './types';

/**
 * Wizard-prefill helpers. Faithful port of the backend prefill rules
 * (see expose-service/src/lib/document-understanding/prefill.ts):
 *
 *   - The AI understanding result is the single source of truth.
 *   - All candidates from all persisted documents are collected, keeping the
 *     source document (id + filename) and the AI-provided evidence attached.
 *   - Values from multiple documents coexist; conflicts are never deleted.
 *   - Only fields that are currently empty in the wizard are prefilled and a
 *     user-entered value is never overwritten.
 */

export type WizardFieldCandidate = {
  field: string;
  value: string | number | boolean | null;
  sourceDocumentId: string;
  sourceFilename: string;
  evidence: string | null;
};

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Collects every non-empty wizard field across all persisted documents. A
 * document without a completed understanding result contributes nothing.
 */
export function collectWizardFieldCandidates(records: DocumentRecord[]): WizardFieldCandidate[] {
  const candidates: WizardFieldCandidate[] = [];
  for (const record of records) {
    if (record.status !== 'completed') continue;
    const fields = record.understandingResult?.wizardFields;
    if (!fields?.length) continue;
    for (const field of fields) {
      if (isEmpty(field.value)) continue;
      candidates.push({
        field: field.field,
        value: field.value,
        sourceDocumentId: record.id,
        sourceFilename: record.filename,
        evidence: field.evidence,
      });
    }
  }
  return candidates;
}

/**
 * Groups candidates by wizard field. Every source is preserved, so conflicting
 * values remain available to the UI instead of being silently discarded.
 */
export function groupCandidatesByField(
  candidates: WizardFieldCandidate[],
): Record<string, WizardFieldCandidate[]> {
  const byField: Record<string, WizardFieldCandidate[]> = {};
  for (const candidate of candidates) {
    (byField[candidate.field] ??= []).push(candidate);
  }
  return byField;
}

/**
 * Deterministic default selection for a field:
 *   1. prefer a value that carries evidence,
 *   2. otherwise the first candidate in document order.
 * Never random.
 */
export function pickDefault(
  sources: WizardFieldCandidate[],
): WizardFieldCandidate | undefined {
  return sources.find((source) => source.evidence) ?? sources[0];
}

export type WizardPrefill = {
  /** Every candidate per field, including conflicts. */
  sourcesByField: Record<string, WizardFieldCandidate[]>;
  /** Defaults for fields that are currently empty in the wizard. */
  defaults: Record<string, string | number | boolean>;
};

/**
 * Computes wizard defaults from persisted documents. A field is only prefilled
 * when it is currently empty in `currentValues`; existing user values win.
 */
export function computeWizardPrefills(
  records: DocumentRecord[],
  currentValues: Record<string, unknown>,
): WizardPrefill {
  const sourcesByField = groupCandidatesByField(collectWizardFieldCandidates(records));
  const defaults: Record<string, string | number | boolean> = {};
  for (const [field, sources] of Object.entries(sourcesByField)) {
    if (!isEmpty(currentValues[field])) continue;
    const chosen = pickDefault(sources);
    if (chosen) defaults[field] = chosen.value as string | number | boolean;
  }
  return { sourcesByField, defaults };
}