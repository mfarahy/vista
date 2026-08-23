'use client';
import { useId, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardFieldCandidate } from '../document-prefill';
import { resolveFieldProvenance } from '../field-provenance';

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Reusable provenance indicator for a wizard field (Phase 10). One component
 * for the three user questions about a field:
 *
 *   - "Aus Dokumenten übernommen"  — the current value matches document data,
 *     sources and evidence stay expandable ("Beleg anzeigen").
 *   - "Von Ihnen geändert"         — the user changed a document value; the
 *     document history remains available but never wins again.
 *   - "Von Ihnen eingegeben"       — a value without any document source.
 *
 * Conflicts between documents are shown as a clear but non-blocking warning;
 * the user can edit the field normally and the conflict history is preserved.
 * Raw OCR and raw AI output are never shown — only filename, value and the
 * AI-provided evidence snippet.
 */
export function DocumentSources({
  sources,
  currentValue,
}: {
  sources?: WizardFieldCandidate[];
  currentValue?: string | number | boolean | null;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const provenance = resolveFieldProvenance(currentValue, sources);

  // Value without any document source: clearly a user value, never labeled
  // "aus Dokumenten übernommen" (empty fields stay quiet).
  if (!sources?.length) {
    if (provenance.origin !== 'user') return null;
    return (
      <p className="mt-1.5 text-xs text-muted-foreground">Von Ihnen eingegeben</p>
    );
  }

  const multiple = sources.length > 1;
  const documentOrigin = provenance.origin === 'document';
  const userEdited = provenance.userEdited;
  const conflictLabel = documentOrigin
    ? 'Unterschiedliche Angaben in Ihren Dokumenten'
    : `${provenance.distinctValues.length} unterschiedliche Angaben in den Dokumenten`;

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {documentOrigin ? (
          <>
            <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span>
              Aus Dokumenten übernommen
              <span className="font-semibold text-foreground">
                {multiple ? ` · ${sources.length} Dokumente` : ` · ${sources[0].sourceFilename}`}
              </span>
            </span>
          </>
        ) : userEdited ? (
          <span className="font-medium text-foreground">Von Ihnen geändert</span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
        >
          {open ? 'Belege ausblenden' : multiple ? 'Belege anzeigen' : 'Beleg anzeigen'}
          <ChevronDown
            size={12}
            className={cn('transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </div>

      {provenance.conflicting && (
        <p className="mt-1 text-xs text-amber-700">
          <span className="font-medium">⚠ {conflictLabel}</span>
        </p>
      )}

      {open && (
        <ul id={detailsId} className="mt-2 max-w-full space-y-2 rounded-lg border bg-card px-3 py-2">
          {sources.map((source, index) => (
            <li
              key={`${source.sourceDocumentId}-${index}`}
              className="min-w-0 text-xs leading-5"
            >
              <p className="break-words font-semibold text-foreground">
                {source.sourceFilename}
              </p>
              <p className="break-words text-muted-foreground">
                {formatValue(source.value)}
              </p>
              {source.evidence && (
                <p className="break-words text-muted-foreground">“{source.evidence}”</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}