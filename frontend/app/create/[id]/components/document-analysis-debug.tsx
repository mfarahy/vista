'use client';
import type { DocumentRecord } from '../types';
import { DOCUMENT_TYPE_LABELS } from '../types';

const DEBUG_ENABLED =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_ENABLE_DOCUMENT_DEBUG === 'true'
    : false;

/**
 * Development-only panel for inspecting exactly what the analysis provider
 * extracted from each document. Rendered separately from the upload UI and
 * disabled in production unless NEXT_PUBLIC_ENABLE_DOCUMENT_DEBUG is set.
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
          {document.analysisResult && (
            <div className="mt-2 space-y-2 text-[11px] leading-5 text-[#5d4c1f]">
              <div>
                <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">Extracted text</p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[#1f1f1f] p-2 text-[#d6d6d6]">
                  {document.analysisResult.text || '(empty)'}
                </pre>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">Extracted fields</p>
                <pre className="mt-1 overflow-auto rounded bg-[#1f1f1f] p-2 text-[#d6d6d6]">
                  {JSON.stringify(document.analysisResult.fields, null, 2)}
                </pre>
              </div>
              {document.analysisResult.metadata?.raw ? (
                <div>
                  <p className="font-bold uppercase tracking-wide text-[#9a7a2f]">Raw response</p>
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
