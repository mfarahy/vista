'use client';
import type { DocumentRecord } from '../types';
import { DOCUMENT_TYPE_LABELS } from '../types';

// NEXT_PUBLIC_* vars are inlined at build time and identical on server and
// client, so the panel must be enabled on both sides or React will report a
// hydration mismatch. Never gate this on `typeof window`.
const DEBUG_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DOCUMENT_DEBUG === 'true';

/**
 * Development-only panel for inspecting exactly what Vista understood from
 * each document (both the OCR/analysis result and the AI understanding result).
 * Rendered separately from the upload UI and disabled in production unless
 * NEXT_PUBLIC_ENABLE_DOCUMENT_DEBUG is set. Never shows credentials or the raw
 * AI response in production.
 */
export function DocumentAnalysisDebugPanel({
  documents,
  loading,
}: {
  documents: DocumentRecord[];
  loading?: boolean;
}) {
  if (!DEBUG_ENABLED) return null;

  return (
    <div className="mt-8 rounded-xl border border-dashed border-[#d0a35a] bg-[#fdf9f0] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#9a7a2f]">
          Debug · Document analysis (remove later)
        </p>
      </div>
      {loading && <p className="mt-3 text-sm text-[#8a7a4a]">Processing documents…</p>}
      {!documents.length && !loading && (
        <p className="mt-3 text-sm text-[#8a7a4a]">No documents uploaded yet.</p>
      )}
      {documents.map((document) => (
        <div key={document.id} className="mt-4 rounded-lg bg-[#fbf6e9] p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#7a6230]">
            <span className="font-bold">{document.filename}</span>
            <span>{document.mimeType}</span>
            <span>{document.status}</span>
            <span>
              {document.documentType
                ? DOCUMENT_TYPE_LABELS[document.documentType]
                : 'no type detected'}
            </span>
          </div>
          {document.error && <p className="mt-1 text-xs text-red-700">{document.error}</p>}
          {document.understandingError && (
            <p className="mt-1 text-xs text-red-700">{document.understandingError}</p>
          )}
          {document.understandingResult && (
            <div className="mt-2 space-y-2 text-[11px] leading-5 text-[#5d4c1f]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold uppercase tracking-wide text-[#9a7a2f]">
                  Document type:
                </span>
                <span>{DOCUMENT_TYPE_LABELS[document.understandingResult.documentType]}</span>
              </div>
              {document.understandingResult.tags?.length ? (
                <div>
                  <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">Tags</p>
                  <p>{document.understandingResult.tags.join(', ')}</p>
                </div>
              ) : null}
              {document.mimeType.startsWith('image/') ? (
                <div>
                  <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">
                    Visual analysis
                  </p>
                  <p>
                    {document.status === 'completed'
                      ? '✓ Image provided to AI'
                      : 'Image was not provided to the AI'}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">AI summary</p>
                <p>{document.understandingResult.summary || '(none)'}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">
                  Extracted wizard fields
                </p>
                <pre className="mt-1 overflow-auto rounded bg-[#1f1f1f] p-2 text-[#d6d6d6]">
                  {JSON.stringify(document.understandingResult.wizardFields, null, 2)}
                </pre>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">
                  Additional information
                </p>
                <pre className="mt-1 overflow-auto rounded bg-[#1f1f1f] p-2 text-[#d6d6d6]">
                  {JSON.stringify(document.understandingResult.additionalInformation, null, 2)}
                </pre>
              </div>
            </div>
          )}
          {document.analysisResult && (
            <div className="mt-2 space-y-2 text-[11px] leading-5 text-[#5d4c1f]">
              <div>
                <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">OCR text</p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[#1f1f1f] p-2 text-[#d6d6d6]">
                  {document.analysisResult.text?.trim()
                    ? document.analysisResult.text
                    : 'No significant text detected'}
                </pre>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">
                  Rule-based extracted fields
                </p>
                <pre className="mt-1 overflow-auto rounded bg-[#1f1f1f] p-2 text-[#d6d6d6]">
                  {JSON.stringify(document.analysisResult.fields, null, 2)}
                </pre>
              </div>
              {document.analysisResult.metadata?.raw ? (
                <div>
                  <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">
                    Raw OCR response
                  </p>
                  <pre className="mt-1 overflow-auto rounded bg-[#1f1f1f] p-2 text-[#d6d6d6]">
                    {JSON.stringify(document.analysisResult.metadata.raw, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
