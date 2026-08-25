import type { DocumentRecord } from '../types.js';
import type { DocumentUnderstandingResult } from './types.js';

/**
 * Aggregates wizard-default candidates from a property's documents. This is the
 * reference implementation of the wizard-prefill rules:
 *
 *   - AI-extracted values are only ever DEFAULTS.
 *   - A value the user has already entered is never overwritten.
 *   - Values from multiple documents coexist: every source is preserved, and a
 *     single default is chosen per field without silently dropping conflicts.
 */

export interface WizardCandidate {
  field: string;
  value: string | number | boolean | null;
  sourceDocumentId: string;
  sourceFilename?: string;
  evidence?: string | null;
}

/**
 * Collects candidate wizard fields from a document. The AI understanding result
 * is the single source of truth: there is no rule-based fallback, so when the
 * AI produced no (or no reliable) fields, no candidates are returned.
 */
export function documentWizardCandidates(
  record: Pick<DocumentRecord, 'id'> & {
    filename?: string;
    understandingResult?: DocumentUnderstandingResult | null;
  },
): WizardCandidate[] {
  const understanding = record.understandingResult;
  if (!understanding?.wizardFields?.length) return [];
  return understanding.wizardFields.map((field) => ({
    field: field.field,
    value: field.value,
    sourceDocumentId: record.id,
    sourceFilename: record.filename,
    evidence: field.evidence,
  }));
}

export interface WizardFieldSources {
  value: string | number | boolean | null;
  sourceDocumentId: string;
  sourceFilename?: string;
  evidence?: string | null;
}

export interface PrefillComputation {
  /** Every candidate value per field, preserving all sources (conflicts kept). */
  valuesByField: Record<string, WizardFieldSources[]>;
  /** The deterministic default chosen for each field. */
  defaults: Record<string, string | number | boolean>;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Picks the default for a field. Deterministic and stable:
 *
 *   1. prefer a non-null AI value,
 *   2. prefer a value that carries evidence,
 *   3. otherwise the first candidate in document order.
 *
 * Never random. Conflicts are never silently deleted.
 */
function pickDefault(sources: WizardFieldSources[]): WizardFieldSources | undefined {
  return (
    sources.find((source) => !isEmpty(source.value) && !!source.evidence) ??
    sources.find((source) => !isEmpty(source.value))
  );
}

/**
 * Computes wizard defaults from documents, only filling fields that are
 * currently empty in the given user values. Never overwrites user input.
 */
export function computePrefillDefaults(
  documents: Parameters<typeof documentWizardCandidates>[0][],
  currentValues: Record<string, unknown>,
): PrefillComputation {
  const valuesByField: Record<string, WizardFieldSources[]> = {};
  for (const document of documents) {
    for (const candidate of documentWizardCandidates(document)) {
      if (candidate.value === null || candidate.value === undefined) continue;
      (valuesByField[candidate.field] ??= []).push({
        value: candidate.value,
        sourceDocumentId: candidate.sourceDocumentId,
        sourceFilename: candidate.sourceFilename,
        evidence: candidate.evidence,
      });
    }
  }

  const defaults: Record<string, string | number | boolean> = {};
  for (const [field, sources] of Object.entries(valuesByField)) {
    if (!isEmpty(currentValues[field])) continue;
    const chosen = pickDefault(sources);
    if (chosen) defaults[field] = chosen.value as string | number | boolean;
  }

  return { valuesByField, defaults };
}