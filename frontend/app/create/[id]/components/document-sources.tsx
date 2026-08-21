'use client';
import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#607b68]">
        <Sparkles size={12} className="shrink-0 text-[#78917d]" />
        <span>
          Found in your documents:{' '}
          <span className="font-bold text-[#45614d]">
            {multiple ? `${sources.length} documents` : primary.sourceFilename}
          </span>
        </span>
        {conflicting && (
          <span className="rounded-full bg-[#fdf3e3] px-2 py-0.5 font-bold text-[#9a7a2f]">
            Different values found
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center gap-1 font-bold text-[#45614d] underline underline-offset-2"
        >
          {open ? 'Hide sources' : 'Show sources'}
          <ChevronDown size={12} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>
      </div>
      {open && (
        <ul className="mt-1.5 space-y-1.5 rounded-lg border border-[#e0e5e0] bg-[#fafcfb] px-3 py-2">
          {sources.map((source, index) => (
            <li key={`${source.sourceDocumentId}-${index}`} className="text-[11px] leading-4">
              <span className="font-bold text-[#45614d]">{source.sourceFilename}</span>
              <span className="text-[#718078]"> → {formatValue(source.value)}</span>
              {source.evidence && (
                <p className="mt-0.5 pl-0 text-[#7a877e]">Evidence: “{source.evidence}”</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}