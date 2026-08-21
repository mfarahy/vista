'use client';
import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { WizardFieldCandidate } from '../document-prefill';

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function distinctValues(sources: WizardFieldCandidate[]): number {
  return new Set(sources.map((source) => JSON.stringify(source.value))).size;
}

/**
 * Subtle "Found in your documents" indicator for a wizard field that was
 * prefilled from AI-extracted document data. Shows the source filenames, a
 * conflict hint when documents disagree, and an expandable list that keeps the
 * AI-provided evidence available for review. Never shows raw OCR text.
 */
export function DocumentSources({ sources }: { sources?: WizardFieldCandidate[] }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;

  const multiple = sources.length > 1;
  const conflicting = distinctValues(sources) > 1;
  const primary = sources[0];

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span>
          Found in your documents:{' '}
          <span className="font-semibold text-foreground">
            {multiple ? `${sources.length} documents` : primary.sourceFilename}
          </span>
        </span>
        {conflicting && (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 font-medium text-amber-700"
          >
            Different values found
          </Badge>
        )}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
        >
          {open ? 'Hide sources' : 'Show sources'}
          <ChevronDown
            size={12}
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>
      {open && (
        <ul className="mt-2 space-y-1.5 rounded-lg border bg-card px-3 py-2">
          {sources.map((source, index) => (
            <li key={`${source.sourceDocumentId}-${index}`} className="text-xs leading-5">
              <span className="font-semibold text-foreground">{source.sourceFilename}</span>
              <span className="text-muted-foreground"> → {formatValue(source.value)}</span>
              {source.evidence && (
                <p className="text-muted-foreground">Evidence: “{source.evidence}”</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}