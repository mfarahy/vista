import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { WizardFieldCandidate } from './document-prefill';
import { marketingProvenanceLabel, resolveFieldProvenance } from './field-provenance';

function source(
  field: string,
  value: string | number | boolean,
  filename: string,
  evidence: string | null = null,
  id = `${filename}-${value}`,
): WizardFieldCandidate {
  return { field, value, sourceDocumentId: id, sourceFilename: filename, evidence };
}

describe('resolveFieldProvenance', () => {
  describe('document origin', () => {
    it('classifies a prefilled value as document origin with its source', () => {
      const sources = [source('livingArea', 145, 'Grundriss.pdf', 'Wohnfläche: 145 m²')];
      const result = resolveFieldProvenance(145, sources);
      assert.equal(result.origin, 'document');
      assert.equal(result.userEdited, false);
      assert.equal(result.matchingSources.length, 1);
      assert.equal(result.matchingSources[0].sourceFilename, 'Grundriss.pdf');
      assert.equal(result.matchingSources[0].evidence, 'Wohnfläche: 145 m²');
    });

    it('matches number values against string candidates', () => {
      const sources = [source('houseNumber', '88a', 'Lageplan.pdf')];
      assert.equal(resolveFieldProvenance('88a', sources).origin, 'document');
      assert.equal(resolveFieldProvenance('88A', sources).origin, 'document', 'case-insensitive');
    });

    it('supports multiple documents with the same value', () => {
      const sources = [
        source('livingArea', 145, 'Grundriss.pdf'),
        source('livingArea', 145, 'Wohnflaechenberechnung.pdf'),
      ];
      const result = resolveFieldProvenance(145, sources);
      assert.equal(result.origin, 'document');
      assert.equal(result.matchingSources.length, 2);
      assert.equal(result.conflicting, false);
    });
  });

  describe('user values', () => {
    it('labels a value without any document source as user-entered', () => {
      const result = resolveFieldProvenance(150, undefined);
      assert.equal(result.origin, 'user');
      assert.equal(result.userEdited, false);
      assert.equal(result.allSources.length, 0);
    });

    it('labels a changed document value as user-edited', () => {
      const sources = [source('livingArea', 145, 'Grundriss.pdf')];
      const result = resolveFieldProvenance(150, sources);
      assert.equal(result.origin, 'user');
      assert.equal(result.userEdited, true);
      assert.equal(result.matchingSources.length, 0);
      assert.equal(result.allSources.length, 1, 'document history stays available');
      assert.equal(result.allSources[0].value, 145);
    });

    it('keeps an empty field without sources empty', () => {
      assert.equal(resolveFieldProvenance(null, undefined).origin, 'empty');
      assert.equal(resolveFieldProvenance('', undefined).origin, 'empty');
    });

    it('keeps an empty field with candidates document-origin (prefill pending)', () => {
      const sources = [source('rooms', 5, 'Expose.pdf')];
      assert.equal(resolveFieldProvenance(null, sources).origin, 'document');
    });
  });

  describe('conflicts', () => {
    it('detects conflicting values while preserving every candidate', () => {
      const sources = [
        source('parcelNumber', '88 A', 'Grundbuchauszug.pdf'),
        source('parcelNumber', '88a', 'Lageplan.pdf'),
      ];
      const result = resolveFieldProvenance('88 A', sources);
      assert.equal(result.conflicting, true);
      assert.deepEqual(result.distinctValues, ['88 A', '88a']);
      assert.equal(result.allSources.length, 2);
      assert.equal(result.matchingSources.length, 1);
    });

    it('keeps a user-resolved conflict value document-supported when it matches a candidate', () => {
      const sources = [
        source('parcelNumber', '88 A', 'Grundbuchauszug.pdf'),
        source('parcelNumber', '88a', 'Lageplan.pdf'),
      ];
      // The user picked the Lageplan value: it is supported by a document and
      // the conflicting candidate stays visible.
      const result = resolveFieldProvenance('88a', sources);
      assert.equal(result.origin, 'document');
      assert.equal(result.matchingSources[0].sourceFilename, 'Lageplan.pdf');
      assert.equal(result.conflicting, true, 'conflict history is not deleted');
      assert.equal(result.allSources.length, 2);
    });

    it('marks a value outside all candidates as user-edited with history intact', () => {
      const sources = [
        source('parcelNumber', '88 A', 'Grundbuchauszug.pdf'),
        source('parcelNumber', '88a', 'Lageplan.pdf'),
      ];
      const result = resolveFieldProvenance('88b', sources);
      assert.equal(result.origin, 'user');
      assert.equal(result.userEdited, true);
      assert.equal(result.conflicting, true, 'conflict history is not deleted');
      assert.equal(result.allSources.length, 2);
    });
  });

  describe('document deletion', () => {
    it('shows a value as user-entered after its only source disappeared', () => {
      const result = resolveFieldProvenance(145, undefined);
      assert.equal(result.origin, 'user');
      assert.equal(result.userEdited, false);
    });

    it('reclassifies to user origin when the remaining sources no longer support the value', () => {
      const remaining = [source('livingArea', 145, 'Grundriss.pdf')];
      const result = resolveFieldProvenance(150, remaining);
      assert.equal(result.origin, 'user');
      assert.equal(result.userEdited, true);
      assert.equal(result.allSources[0].value, 145, 'document still exists as historical source');
    });
  });

  it('resolves the marketing provenance label without internal jargon', () => {
    assert.equal(marketingProvenanceLabel('ai'), 'Von KI erstellt · bearbeitbar');
    assert.equal(marketingProvenanceLabel('user'), 'Von Ihnen bearbeitet');
  });
});