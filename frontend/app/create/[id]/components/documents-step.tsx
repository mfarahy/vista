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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
        toast.success('Document removed');
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
      description="Upload any documents, plans or photos you have. Vista analyzes them and prefills the property details for you."
    >
      <div className="space-y-6">
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
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragOver
              ? 'border-primary bg-primary/[0.05]'
              : 'border-border bg-muted/30 hover:border-primary/40',
          )}
        >
          <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <UploadCloud className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-sm font-semibold text-foreground">
            Upload everything you have about this property
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Vista organizes the documents and uses the information to prefill the rest of the wizard.
          </p>
          <Button
            type="button"
            className="mt-5"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {uploading ? 'Uploading…' : 'Upload documents'}
          </Button>
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
          <p className="mt-3 text-xs text-muted-foreground">
            Drag &amp; drop or choose files · PDF, JPG, PNG or WEBP · up to 25 MB each
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {uploading && documents.length > 0 && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Analyzing…
          </p>
        )}

        {!documents.length && !uploading ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/20 px-6 py-12 text-center">
            <FileText className="size-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-foreground">No documents yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Upload your property documents, plans or photos. Vista will organize them and use them
              to help complete the wizard.
            </p>
            <Button type="button" className="mt-5" onClick={() => fileRef.current?.click()}>
              <UploadCloud className="size-4" /> Upload documents
            </Button>
          </div>
        ) : null}

        {documents.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-5">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3.5" aria-hidden />
              </span>
              <p className="font-semibold text-foreground">Information found</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Vista understood your documents and found useful information across {analyzedCount}{' '}
              {analyzedCount === 1 ? 'document' : 'documents'}.
            </p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {foundAddress.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Address
                  </p>
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {ADDRESS_FIELDS.map(([field, label]) => {
                      const sources = sourcesByField[field];
                      if (!sources?.length) return null;
                      return (
                        <li key={field} className="inline-flex items-center gap-1.5 text-sm">
                          <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                          <span className="text-foreground">{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {foundProperty.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Property
                  </p>
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {PROPERTY_FIELDS.map(([field, label]) => {
                      const sources = sourcesByField[field];
                      if (!sources?.length) return null;
                      return (
                        <li key={field} className="inline-flex items-center gap-1.5 text-sm">
                          <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                          <span className="text-foreground">{label}</span>
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
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <p className="inline-flex items-center gap-2 font-semibold text-amber-800">
              <AlertTriangle className="size-4" /> Different values found in your documents
            </p>
            <p className="mt-1 text-sm text-amber-700">
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
                    <p className="text-sm font-semibold text-foreground">
                      {conflictLabel(field)}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {formatValue(sources[0].value)}
                      </span>
                    </p>
                    {differing.length > 1 && (
                      <p className="mt-0.5 text-xs text-amber-700">
                        Different value also found in:{' '}
                        <span className="font-semibold text-amber-800">
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
      </div>
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
    <div className="flex flex-col rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {image ? (
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
              <img
                src={apiAssetUrl(document.url)}
                alt={document.filename}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" title={document.filename}>
              {document.filename}
            </p>
            <p className="text-xs text-muted-foreground">
              {image ? 'Image' : 'Document'} · {formatSize(document.size)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${document.filename}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={onToggleConfirm}
          >
            {confirming ? <X className="size-4" /> : <Trash2 className="size-4" />}
          </Button>
          {document.understandingResult && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Inspect ${document.filename}`}
              aria-expanded={open}
              className="text-muted-foreground"
              onClick={() => setOpen((current) => !current)}
            >
              <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
            </Button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">Remove this document from the property?</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
              Remove
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onToggleConfirm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {document.documentType && document.documentType !== 'other' && (
          <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[document.documentType]}</Badge>
        )}
        {analyzed && (
          <Badge variant="outline" className="border-transparent bg-primary/10 font-medium text-primary">
            <Check className="size-3" /> Analyzed
          </Badge>
        )}
        {document.status === 'completed' && !document.understandingResult && (
          <Badge variant="outline" className="text-muted-foreground">
            <Check className="size-3" /> Analyzed
          </Badge>
        )}
        {failed && (
          <Badge variant="outline" className="border-transparent bg-destructive/10 font-medium text-destructive">
            Analysis failed
          </Badge>
        )}
        {analyzing && (
          <Badge variant="outline" className="text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" /> Analyzing…
          </Badge>
        )}
      </div>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {document.understandingResult?.summary && !open ? (
        <p className="mt-2 line-clamp-2 text-xs leading-4 text-muted-foreground">
          {document.understandingResult.summary}
        </p>
      ) : null}

      {open && document.understandingResult && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {document.understandingResult.summary ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </p>
              <p className="mt-1 text-xs leading-4 text-foreground">
                {document.understandingResult.summary}
              </p>
            </div>
          ) : null}
          {document.understandingResult.wizardFields?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Extracted information
              </p>
              <ul className="mt-1 space-y-1">
                {document.understandingResult.wizardFields.map((field, index) => (
                  <li key={`${field.field}-${index}`} className="text-xs leading-5">
                    <span className="font-medium text-foreground">{field.field}</span>
                    <span className="text-muted-foreground"> → {formatValue(field.value)}</span>
                    {field.evidence && (
                      <span className="block text-muted-foreground">Evidence: “{field.evidence}”</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {document.understandingResult.additionalInformation?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Additional information
              </p>
              <ul className="mt-1 space-y-1">
                {document.understandingResult.additionalInformation.map((info, index) => (
                  <li key={`${info.key}-${index}`} className="text-xs leading-5">
                    <span className="font-medium text-foreground">{info.key}</span>
                    <span className="text-muted-foreground"> → {formatValue(info.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {failed && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-2 h-auto justify-start p-0 text-primary"
          onClick={onRetry}
        >
          <RefreshCw className="size-3.5" /> Try analysis again
        </Button>
      )}
    </div>
  );
}
