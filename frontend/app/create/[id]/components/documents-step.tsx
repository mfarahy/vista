'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileText, LoaderCircle, UploadCloud, X, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { DocumentRecord } from '../types';
import { DOCUMENT_TYPE_LABELS } from '../types';
import { Section } from './ui';
import { DocumentAnalysisDebugPanel } from './document-analysis-debug';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepDocuments({
  propertyId,
  onExtracted,
}: {
  propertyId: string;
  onExtracted: (documents: DocumentRecord[]) => void;
}) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = useCallback(
    (list: DocumentRecord[]) => {
      setDocuments(list);
      onExtracted(list);
    },
    [onExtracted],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await apiFetch(`/api/properties/${propertyId}/documents`);
        if (!response.ok) return;
        const list = (await response.json()) as DocumentRecord[];
        if (!cancelled) notify(list);
      } catch {
        setError('The uploaded documents could not be loaded.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    const added: DocumentRecord[] = [];
    for (const file of [...files]) {
      const body = new FormData();
      body.append('files', file);
      try {
        const response = await apiFetch(`/api/properties/${propertyId}/documents`, {
          method: 'POST',
          body,
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          setError(result.error || 'The document could not be uploaded.');
          continue;
        }
        const uploaded = (await response.json()) as DocumentRecord[];
        if (Array.isArray(uploaded)) added.push(...uploaded);
      } catch {
        setError('The document could not be uploaded.');
      }
    }
    setUploading(false);
    if (added.length) notify([...added, ...documents]);
  }

  async function retry(documentId: string) {
    try {
      const response = await apiFetch(
        `/api/properties/${propertyId}/documents/${documentId}/analyze`,
        { method: 'POST' },
      );
      if (!response.ok) return;
      const updated = (await response.json()) as DocumentRecord;
      notify(documents.map((document) => (document.id === updated.id ? updated : document)));
    } catch {
      setError('The document could not be analyzed again.');
    }
  }

  async function remove(documentId: string) {
    try {
      const response = await apiFetch(`/api/properties/${propertyId}/documents/${documentId}`, {
        method: 'DELETE',
      });
      if (response.ok) notify(documents.filter((document) => document.id !== documentId));
      else setError('The document could not be removed.');
    } catch {
      setError('The document could not be removed.');
    }
  }

  return (
    <Section
      title="Documents"
      description="Upload the property documents you have. Vista analyzes them automatically and uses the extracted information as default values in the following steps."
    >
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          uploadFiles(event.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragOver ? 'border-[#6e8b76] bg-[#f0f6f0]' : 'border-[#c8d9cb] bg-[#f6faf6]'
        }`}
      >
        <UploadCloud size={28} className="mx-auto text-[#78917d]" />
        <p className="mt-3 font-bold text-[#415743]">Drop your property documents here</p>
        <p className="mt-1 text-sm text-[#718078]">
          Grundbuchauszug, Exposé, Grundriss, Energieausweis, Kaufvertrag and more
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn btn-primary mt-4"
          disabled={uploading}
        >
          {uploading ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <FileText size={15} />
          )}{' '}
          Choose files
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            uploadFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <p className="mt-2 text-[11px] text-[#9aab9d]">PDF, JPG, PNG or WEBP · up to 25 MB each</p>
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      {documents.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((document) => (
            <div
              key={document.id}
              className="rounded-2xl border border-[#e1e7e1] bg-[#fafcfb] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf0ea] text-[#45614d]">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#33463a]" title={document.filename}>
                      {document.filename}
                    </p>
                    <p className="text-[11px] text-[#7a877e]">
                      {document.mimeType} · {formatSize(document.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(document.id)}
                  className="rounded-lg p-1 text-[#aab4ac] hover:bg-[#eef3ee] hover:text-red-600"
                  aria-label={`Remove ${document.filename}`}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                {document.documentType && document.documentType !== 'other' && (
                  <span className="rounded-full bg-[#eaf0ea] px-2 py-0.5 text-[11px] font-bold text-[#45614d]">
                    {DOCUMENT_TYPE_LABELS[document.documentType]}
                  </span>
                )}
                {document.status === 'completed' && document.understandingResult && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2f7d46]">
                    <Check size={13} /> Analyzed
                  </span>
                )}
                {document.status === 'completed' && !document.understandingResult && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#718078]">
                    <Check size={13} /> OCR only
                  </span>
                )}
                {document.status === 'failed' && (
                  <span className="text-[11px] font-bold text-red-600">Failed</span>
                )}
                {(document.status === 'pending' || document.status === 'processing') && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#718078]">
                    <LoaderCircle size={13} className="animate-spin" /> Processing…
                  </span>
                )}
              </div>

              {document.understandingResult?.tags?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {document.understandingResult.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[#fdf3e3] px-2 py-0.5 text-[10px] font-semibold text-[#9a7a2f]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {document.understandingResult?.summary ? (
                <p className="mt-2 text-[11px] leading-4 text-[#7a877e]">
                  {document.understandingResult.summary}
                </p>
              ) : null}

              {(document.status === 'failed' || document.understandingError) && (
                <button
                  type="button"
                  onClick={() => retry(document.id)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#607b68] underline"
                >
                  <RefreshCw size={13} /> Retry analysis
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <DocumentAnalysisDebugPanel documents={documents} loading={uploading} />
    </Section>
  );
}
