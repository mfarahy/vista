'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { apiAssetUrl, apiFetch } from '@/lib/api';
import type { DocumentRecord } from '../types';
import { DOCUMENT_TYPE_LABELS } from '../types';
import { Section } from './ui';
import {
  collectWizardFieldCandidates,
  groupCandidatesByField,
  type WizardFieldCandidate,
} from '../document-prefill';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

const ADDRESS_FIELDS: Array<[string, string]> = [
  ['street', 'Street'],
  ['houseNumber', 'House number'],
  ['postalCode', 'Postal code'],
  ['city', 'City'],
  ['district', 'District'],
  ['state', 'State'],
  ['country', 'Country'],
];

const PROPERTY_FIELDS: Array<[string, string]> = [
  ['livingArea', 'Living area'],
  ['plotArea', 'Plot area'],
  ['rooms', 'Rooms'],
  ['bedrooms', 'Bedrooms'],
  ['bathrooms', 'Bathrooms'],
  ['yearBuilt', 'Year built'],
  ['floor', 'Floor'],
  ['numberOfFloors', 'Number of floors'],
  ['propertyType', 'Property type'],
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function distinctValues(sources: WizardFieldCandidate[]): number {
  return new Set(sources.map((source) => JSON.stringify(source.value))).size;
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
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
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

  const sourcesByField = useMemo(
    () => groupCandidatesByField(collectWizardFieldCandidates(documents)),
    [documents],
  );

  const foundAddress = ADDRESS_FIELDS.filter(([field]) => sourcesByField[field]?.length);
  const foundProperty = PROPERTY_FIELDS.filter(([field]) => sourcesByField[field]?.length);
  const hasFoundInfo = foundAddress.length > 0 || foundProperty.length > 0;

  const conflicts = useMemo(() => {
    const list: Array<{ field: string; sources: WizardFieldCandidate[] }> = [];
    for (const [field, sources] of Object.entries(sourcesByField)) {
      if (distinctValues(sources) > 1) list.push({ field, sources });
    }
    return list;
  }, [sourcesByField]);

  const conflictLabel = (field: string) =>
    [...ADDRESS_FIELDS, ...PROPERTY_FIELDS].find(([key]) => key === field)?.[1] ?? field;

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
      if (response.ok) {
        setConfirmingId(null);
        notify(documents.filter((document) => document.id !== documentId));
      } else setError('The document could not be removed.');
    } catch {
      setError('The document could not be removed.');
    }
  }

  function toggleConfirm(documentId: string) {
    setConfirmingId((current) => (current === documentId ? null : documentId));
  }

  const analyzedCount = documents.filter(
    (document) => document.status === 'completed' && document.understandingResult,
  ).length;

  return (
    <Section
      title="Property documents"
      description="Upload any documents, plans or photos you have. Vista will analyze them and use the information to prefill the property details."
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
        <p className="mt-3 font-bold text-[#415743]">
          Upload everything you have about this property
        </p>
        <p className="mt-1 text-sm text-[#718078]">
          Vista will organize the documents and use the information to prefill the rest of the
          wizard.
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
            <UploadCloud size={15} />
          )}{' '}
          {uploading ? 'Uploading…' : 'Upload documents'}
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
        <p className="mt-2 text-[11px] text-[#9aab9d]">
          Drag &amp; drop or choose files · PDF, JPG, PNG or WEBP · up to 25 MB each
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      {uploading && documents.length > 0 && (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-[#718078]">
          <LoaderCircle size={15} className="animate-spin" /> Analyzing…
        </p>
      )}

      {!documents.length && !uploading ? (
        <div className="mt-8 rounded-2xl border border-[#e1e7e1] bg-[#fafcfb] p-10 text-center">
          <FileText size={26} className="mx-auto text-[#aab4ac]" />
          <p className="mt-3 font-bold text-[#415743]">No documents yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#718078]">
            Upload your property documents, plans or photos. Vista will organize them and use them
            to help complete the wizard.
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn btn-primary mt-5"
          >
            <UploadCloud size={15} /> Upload documents
          </button>
        </div>
      ) : null}

      {documents.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              confirming={confirmingId === document.id}
              onToggleConfirm={() => toggleConfirm(document.id)}
              onRemove={() => remove(document.id)}
              onRetry={() => retry(document.id)}
            />
          ))}
        </div>
      )}

      {hasFoundInfo && (
        <div className="mt-8 rounded-2xl border border-[#c8d9cb] bg-[#f6faf6] p-5">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-[#2f7d46]" />
            <p className="font-bold text-[#415743]">Information found</p>
          </div>
          <p className="mt-1 text-xs text-[#718078]">
            Vista understood your documents and found useful information across {analyzedCount}{' '}
            {analyzedCount === 1 ? 'document' : 'documents'}.
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {foundAddress.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#607b68]">
                  Address
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {ADDRESS_FIELDS.map(([field, label]) => {
                    const sources = sourcesByField[field];
                    if (!sources?.length) return null;
                    return (
                      <li key={field} className="inline-flex items-center gap-1.5 text-sm">
                        <Check size={13} className="shrink-0 text-[#2f7d46]" />
                        <span className="text-[#415743]">{label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {foundProperty.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#607b68]">
                  Property
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {PROPERTY_FIELDS.map(([field, label]) => {
                    const sources = sourcesByField[field];
                    if (!sources?.length) return null;
                    return (
                      <li key={field} className="inline-flex items-center gap-1.5 text-sm">
                        <Check size={13} className="shrink-0 text-[#2f7d46]" />
                        <span className="text-[#415743]">{label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[#ecd9b0] bg-[#fdf6e9] p-5">
          <p className="inline-flex items-center gap-2 font-bold text-[#9a7a2f]">
            <AlertTriangle size={16} /> Different values found in your documents
          </p>
          <p className="mt-1 text-xs text-[#8a7a4a]">
            Some fields were found with different values. You can review and adjust them later in
            the wizard.
          </p>
          <ul className="mt-4 space-y-3">
            {conflicts.map(({ field, sources }) => {
              const differing = sources.filter(
                (source, index) =>
                  sources.findIndex(
                    (other) => JSON.stringify(other.value) === JSON.stringify(source.value),
                  ) === index,
              );
              return (
                <li key={field}>
                  <p className="text-sm font-bold text-[#415743]">
                    {conflictLabel(field)}{' '}
                    <span className="font-normal text-[#7a877e]">
                      · {formatValue(sources[0].value)}
                    </span>
                  </p>
                  {differing.length > 1 && (
                    <p className="mt-0.5 text-xs text-[#8a7a4a]">
                      Different value also found in:{' '}
                      <span className="font-bold text-[#7a6230]">
                        {differing
                          .slice(1)
                          .map((source) => source.sourceFilename)
                          .join(', ')}
                      </span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}

function DocumentCard({
  document,
  confirming,
  onToggleConfirm,
  onRemove,
  onRetry,
}: {
  document: DocumentRecord;
  confirming: boolean;
  onToggleConfirm: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const image = isImage(document.mimeType);
  const analyzing = document.status === 'pending' || document.status === 'processing';
  const analyzed = document.status === 'completed' && document.understandingResult;
  const failed = document.status === 'failed' || document.understandingError != null;
  const tags = document.understandingResult?.tags?.length
    ? document.understandingResult.tags
    : document.tags?.length
      ? document.tags
      : [];

  return (
    <div className="rounded-2xl border border-[#e1e7e1] bg-[#fafcfb] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {image ? (
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eaf0ea]">
              <img
                src={apiAssetUrl(document.url)}
                alt={document.filename}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#eaf0ea] text-[#45614d]">
              <FileText size={20} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#33463a]" title={document.filename}>
              {document.filename}
            </p>
            <p className="text-[11px] text-[#7a877e]">
              {image ? 'Image' : 'Document'} · {formatSize(document.size)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleConfirm}
            className="rounded-lg p-1.5 text-[#aab4ac] hover:bg-[#eef3ee] hover:text-red-600"
            aria-label={`Remove ${document.filename}`}
          >
            {confirming ? <X size={16} /> : <Trash2 size={16} />}
          </button>
          {document.understandingResult && (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="rounded-lg p-1.5 text-[#aab4ac] hover:bg-[#eef3ee] hover:text-[#45614d]"
              aria-label={`Inspect ${document.filename}`}
              aria-expanded={open}
            >
              <ChevronDown size={16} className={open ? 'rotate-180 transition' : 'transition'} />
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-700">Remove this document from the property?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onRemove}
              className="btn bg-red-600 px-3 py-1.5 text-[11px] text-white"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={onToggleConfirm}
              className="btn btn-secondary px-3 py-1.5 text-[11px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {document.documentType && document.documentType !== 'other' && (
          <span className="rounded-full bg-[#eaf0ea] px-2 py-0.5 text-[11px] font-bold text-[#45614d]">
            {DOCUMENT_TYPE_LABELS[document.documentType]}
          </span>
        )}
        {analyzed && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2f7d46]">
            <Check size={13} /> Analyzed
          </span>
        )}
        {document.status === 'completed' && !document.understandingResult && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#718078]">
            <Check size={13} /> Analyzed
          </span>
        )}
        {failed && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
            Analysis failed
          </span>
        )}
        {analyzing && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#718078]">
            <LoaderCircle size={13} className="animate-spin" /> Analyzing…
          </span>
        )}
      </div>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#fdf3e3] px-2 py-0.5 text-[10px] font-semibold text-[#9a7a2f]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {document.understandingResult?.summary && !open ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[#7a877e]">
          {document.understandingResult.summary}
        </p>
      ) : null}

      {open && document.understandingResult && (
        <div className="mt-3 space-y-3 border-t border-[#e1e7e1] pt-3">
          {document.understandingResult.summary ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#607b68]">
                Summary
              </p>
              <p className="mt-1 text-[11px] leading-4 text-[#415743]">
                {document.understandingResult.summary}
              </p>
            </div>
          ) : null}
          {document.understandingResult.wizardFields?.length ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#607b68]">
                Extracted information
              </p>
              <ul className="mt-1 space-y-1">
                {document.understandingResult.wizardFields.map((field, index) => (
                  <li key={`${field.field}-${index}`} className="text-[11px] leading-4">
                    <span className="font-bold text-[#415743]">{field.field}</span>
                    <span className="text-[#718078]"> → {formatValue(field.value)}</span>
                    {field.evidence && (
                      <span className="block text-[#7a877e]">Evidence: “{field.evidence}”</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {document.understandingResult.additionalInformation?.length ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#607b68]">
                Additional information
              </p>
              <ul className="mt-1 space-y-1">
                {document.understandingResult.additionalInformation.map((info, index) => (
                  <li key={`${info.key}-${index}`} className="text-[11px] leading-4">
                    <span className="font-bold text-[#415743]">{info.key}</span>
                    <span className="text-[#718078]"> → {formatValue(info.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {failed && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#607b68] underline"
        >
          <RefreshCw size={13} /> Try analysis again
        </button>
      )}
    </div>
  );
}
