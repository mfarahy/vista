import type { WizardFieldCandidate } from './document-prefill';

/**
 * Field provenance resolution (Phase 10).
 *
 * Answers the two questions the wizard must always be able to answer:
 *
 *   - "Woher stammt dieser Wert?"  → document sources (filename, value, evidence)
 *   - "Habe ich das eingegeben, oder hat Vista es gefunden?" → origin
 *
 * Everything is derived from the existing candidate/source system
 * (WizardFieldCandidate from document-prefill) — there is exactly ONE
 * provenance implementation, shared by every wizard step.
 *
 * The user-value-wins rule stays in the prefill layer: an explicit user value
 * is never overwritten. Here we only classify what the CURRENT value is, so
 * the UI can label it correctly without a second source of truth.
 */

export type FieldOrigin = 'document' | 'user' | 'empty';

export interface FieldProvenance {
  /** Where the current field value came from. */
  origin: FieldOrigin;
  /**
   * True when the value differs from every document candidate, i.e. the user
   * changed a document-prefilled value. The document values stay available.
   */
  userEdited: boolean;
  /** Documents whose value matches the current field value. */
  matchingSources: WizardFieldCandidate[];
  /** Every preserved document candidate, including conflicting values. */
  allSources: WizardFieldCandidate[];
  /** Distinct values found in the documents (>1 means a conflict). */
  distinctValues: unknown[];
  /** True when the documents disagree about this field. */
  conflicting: boolean;
}

/** Compares a current field value against a document candidate value. */
function valuesMatch(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const normalized = (value: unknown) =>
    typeof value === 'string' ? value.trim().toLowerCase() : String(value).trim().toLowerCase();
  return normalized(a) === normalized(b);
}

/** Distinct candidate values, preserving document order. */
export function distinctSourceValues(sources: WizardFieldCandidate[]): unknown[] {
  const values: unknown[] = [];
  for (const source of sources) {
    if (!values.some((value) => valuesMatch(value, source.value))) values.push(source.value);
  }
  return values;
}

/**
 * Classifies the current value of a wizard field against its document
 * candidates. When no sources exist, a present value is user-entered; an
 * absent value is simply empty. When sources exist, the origin is "document"
 * only while the value still matches a document — the moment the user edits,
 * the origin becomes "user" and the conflict history remains available.
 */
export function resolveFieldProvenance(
  currentValue: string | number | boolean | null | undefined,
  sources?: WizardFieldCandidate[] | null,
): FieldProvenance {
  const allSources = sources ?? [];
  const distinctValues = distinctSourceValues(allSources);
  const empty = currentValue === null || currentValue === undefined || currentValue === '';
  if (empty) {
    return {
      origin: allSources.length ? 'document' : 'empty',
      userEdited: false,
      matchingSources: [],
      allSources,
      distinctValues,
      conflicting: distinctValues.length > 1,
    };
  }
  const matchingSources = allSources.filter((source) =>
    valuesMatch(source.value, currentValue),
  );
  if (matchingSources.length) {
    return {
      origin: 'document',
      userEdited: false,
      matchingSources,
      allSources,
      distinctValues,
      conflicting: distinctValues.length > 1,
    };
  }
  return {
    origin: 'user',
    userEdited: allSources.length > 0,
    matchingSources: [],
    allSources,
    distinctValues,
    conflicting: distinctValues.length > 1,
  };
}

/**
 * German provenance label for a marketing-content field (source "ai" | "user").
 * User-edited fields are never overwritten by regeneration; the label makes
 * that visible without exposing the internal source record.
 */
export function marketingProvenanceLabel(source: 'ai' | 'user'): string {
  return source === 'user' ? 'Von Ihnen bearbeitet' : 'Von KI erstellt · bearbeitbar';
}