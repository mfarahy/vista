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
import { defaultLocale, translate, useI18n, type Locale, type TranslationKey } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useJobProgress, type JobProgressState } from '@/lib/use-job-progress';
import type { DocumentRecord } from '../types';
import {
  BUILDING_STATUSES,
  DOCUMENT_TYPE_LABELS,
  ENERGY_CERTIFICATE_TYPES,
  ENERGY_SOURCES,
  PHOTO_TAG_LABELS,
  PROPERTY_SUBTYPES,
  PROPERTY_TYPES,
  additionalInfoLabel,
  conditionLabel,
  photoTypeLabel,
  propertySubtypeOptions,
  subtypeKey,
} from '../types';
import { Section } from './ui';
import {
  collectWizardFieldCandidates,
  groupCandidatesByField,
  formatExtractedValue,
  pickDefault,
  wizardFieldLabel,
  type WizardFieldCandidate,
} from '../document-prefill';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/** Shorthand response of the async document-processing endpoints. */
type JobEnqueueResponse = { jobId: string; status: string; type: string };

/** Maps a job's `currentStep` to an i18n label for the progress UI. */
function currentStepLabel(step: string | undefined): TranslationKey | undefined {
  const labels: Record<string, TranslationKey> = {
    received: 'documentsStep.stepReceived',
    ocr: 'documentsStep.stepOcr',
    understanding: 'documentsStep.stepUnderstanding',
    done: 'documentsStep.stepDone',
  };
  return step ? labels[step] : undefined;
}

/**
 * Maps a backend document error message to a translation key. The backend
 * currently returns German human-readable strings (not stable error codes);
 * known ones are mapped so they never reach the UI raw in the wrong language.
 * The aggregated job failure ("All N document(s) failed to process: …")
 * produced by job-processor carries the per-document reason as a suffix, which
 * is extracted and mapped the same way. Unknown messages are left to the
 * caller's translated fallback.
 */
function documentUploadErrorKey(error: string | null | undefined): TranslationKey | undefined {
  const map: Record<string, TranslationKey> = {
    'Keine Dokumente gefunden': 'documentsStep.errorNoFiles',
    'Nur PDF, JPG, PNG und WEBP werden unterstützt': 'documentsStep.errorUnsupportedType',
    'Dokumente dürfen maximal 25 MB groß sein': 'documentsStep.errorTooLarge',
    'Die Dokumentdatei fehlt.': 'documentsStep.errorMissingFile',
    'Das Dokument konnte nicht verstanden werden (kein OCR-Ergebnis).':
      'documentsStep.errorOcrFailed',
    'Das Dokument konnte nicht analysiert werden.': 'documentsStep.errorAnalysisFailed',
    'The AI could not understand this document. The OCR result was preserved.':
      'documentsStep.errorUnderstandingFailed',
  };
  const trimmed = error?.trim();
  if (trimmed) {
    const exact = map[trimmed];
    if (exact) return exact;
    const aggregated = trimmed.match(/^All \d+ document\(s\) failed to process:?\s*(.+)$/);
    if (aggregated?.[1]) return documentUploadErrorKey(aggregated[1].trim());
  }
  return undefined;
}

/** Localized failure reason shown on a document card, falling back to the generic label. */
function documentFailureMessage(
  document: DocumentRecord,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const raw = document.error ?? document.understandingError;
  const mapped = documentUploadErrorKey(raw);
  return mapped ? t(mapped) : t('documentsStep.statusFailed');
}

/** Categories of the "Gefundene Informationen" overview (spec §16). */
const FOUND_CATEGORIES: Array<{
  category: 'address' | 'object' | 'building' | 'financials' | 'energy';
  fields: string[];
}> = [
  {
    category: 'address',
    fields: ['street', 'houseNumber', 'postalCode', 'city', 'district', 'state', 'country'],
  },
  {
    category: 'object',
    fields: [
      'propertyType',
      'propertySubtype',
      'usageType',
      'livingArea',
      'usableArea',
      'plotArea',
      'rooms',
      'bedrooms',
      'bathrooms',
      'guestToilets',
      'floor',
    ],
  },
  {
    category: 'building',
    fields: [
      'yearBuilt',
      'buildingStatus',
      'condition',
      'renovationStatus',
      'lastModernizationYear',
      'numberOfFloors',
      'basement',
      'attic',
    ],
  },
  {
    category: 'financials',
    fields: [
      'askingPrice',
      'pricePerM2',
      'monthlyRent',
      'annualRent',
      'additionalCosts',
      'deposit',
      'commissionRate',
      'commissionPayer',
      'hausgeld',
      'maintenanceReserve',
      'coOwnershipShare',
      'grossYieldTarget',
      'grossYieldActual',
      'availableFrom',
    ],
  },
  {
    category: 'energy',
    fields: [
      'energyClass',
      'energyDemand',
      'energyConsumption',
      'heatingType',
      'primaryEnergySource',
      'yearOfConstruction',
      'certificateType',
      'certificateDate',
      'certificateValidUntil',
      'hotWaterIncluded',
    ],
  },
];

function formatFoundValue(
  field: string,
  value: string | number | boolean | null,
  locale: Locale = defaultLocale,
): string {
  if (typeof value === 'boolean') return formatExtractedValue(value, locale);
  const text = String(value);
  const enumKey = (options: ReadonlyArray<readonly [string, TranslationKey]>, key: string) =>
    options.find(([option]) => option === key)?.[1];
  const labeled: Record<string, TranslationKey | string | undefined> = {
    propertyType: enumKey(PROPERTY_TYPES as ReadonlyArray<readonly [string, TranslationKey]>, text),
    buildingStatus: enumKey(
      BUILDING_STATUSES as ReadonlyArray<readonly [string, TranslationKey]>,
      text,
    ),
    certificateType: enumKey(
      ENERGY_CERTIFICATE_TYPES as ReadonlyArray<readonly [string, TranslationKey]>,
      text,
    ),
    primaryEnergySource: enumKey(
      ENERGY_SOURCES as ReadonlyArray<readonly [string, TranslationKey]>,
      text,
    ),
    commissionPayer: {
      buyer: 'finance.buyer',
      seller: 'finance.seller',
      both: 'finance.both',
    }[text],
  };
  const knownKey = labeled[field];
  if (knownKey) return translate(locale, knownKey);
  if (field === 'propertySubtype') {
    for (const type of Object.keys(PROPERTY_SUBTYPES)) {
      const key = subtypeKey(type, text);
      const entry = propertySubtypeOptions(type).find(([optionKey]) => optionKey === key);
      if (entry) {
        const label = translate(locale, entry[1]);
        if (label !== text) return label;
      }
    }
    return text;
  }
  if (field === 'condition') {
    const key = conditionLabel(text);
    return key ? translate(locale, key) : text;
  }
  const number =
    typeof value === 'number' ? value : Number(text.replace(/\./g, '').replace(',', '.'));
  if (Number.isFinite(number)) {
    const moneyFields = new Set([
      'askingPrice',
      'pricePerM2',
      'monthlyRent',
      'annualRent',
      'additionalCosts',
      'deposit',
      'hausgeld',
      'maintenanceReserve',
    ]);
    const percentFields = new Set(['commissionRate', 'grossYieldTarget', 'grossYieldActual']);
    if (moneyFields.has(field)) {
      return translate(locale, 'finance.formatEuro', {
        value: new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
          maximumFractionDigits: 0,
        }).format(number),
      });
    }
    if (percentFields.has(field)) {
      return translate(locale, 'finance.percent', {
        value: new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
          maximumFractionDigits: 0,
        }).format(number),
      });
    }
    const areaFields = new Set(['livingArea', 'usableArea', 'plotArea', 'gardenArea']);
    if (areaFields.has(field))
      return `${formatExtractedValue(value, locale)} ${translate(locale, 'expose.units.sqm')}`;
    if (field === 'energyDemand' || field === 'energyConsumption')
      return `${formatExtractedValue(value, locale)} ${translate(locale, 'expose.units.kwhWithDot')}`;
  }
  return formatExtractedValue(value, locale);
}

function formatSize(bytes: number, locale: Locale = defaultLocale): string {
  if (bytes < 1024) return `${bytes} ${translate(locale, 'documentsStep.fileSize.B')}`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(0)} ${translate(locale, 'documentsStep.fileSize.KB')}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${translate(locale, 'documentsStep.fileSize.MB')}`;
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
  const [uploadingCount, setUploadingCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { t, locale } = useI18n();
  const job = useJobProgress(activeJobId);

  const notify = useCallback(
    (list: DocumentRecord[]) => {
      setDocuments(list);
      onExtracted(list);
    },
    [onExtracted],
  );

  const refreshDocuments = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/properties/${propertyId}/documents`);
      if (!response.ok) return;
      const list = (await response.json()) as DocumentRecord[];
      notify(list);
    } catch {
      setError(t('documentsStep.loadFailed'));
    }
  }, [propertyId, notify, t]);

  // When the async processing job finishes, refresh the document list so the
  // extracted understanding results appear. The live progress card renders the
  // terminal success/error state.
  useEffect(() => {
    if (job.state?.status === 'completed') {
      setUploading(false);
      setUploadingCount(0);
      void refreshDocuments();
    } else if (job.state?.status === 'failed') {
      setUploading(false);
      setUploadingCount(0);
      void refreshDocuments();
    }
  }, [job.state?.status, refreshDocuments]);

  useEffect(() => {
    let cancelled = false;
async function load() {
    try {
      const response = await apiFetch(`/api/properties/${propertyId}/documents`);
      if (!response.ok) return;
      const list = (await response.json()) as DocumentRecord[];
      if (!cancelled) notify(list);
    } catch {
      setError(t('documentsStep.loadFailed'));
    }
  }
  void load();
    return () => {
      cancelled = true;
    };
  }, [propertyId, t]);

  const sourcesByField = useMemo(
    () => groupCandidatesByField(collectWizardFieldCandidates(documents)),
    [documents],
  );

  const foundCategories = FOUND_CATEGORIES.map((category) => ({
    ...category,
    found: category.fields.filter((field) => sourcesByField[field]?.length),
  })).filter((category) => category.found.length > 0);
  const hasFoundInfo = foundCategories.length > 0;

  const conflicts = useMemo(() => {
    const list: Array<{ field: string; sources: WizardFieldCandidate[] }> = [];
    for (const [field, sources] of Object.entries(sourcesByField)) {
      if (distinctValues(sources) > 1) list.push({ field, sources });
    }
    return list;
  }, [sourcesByField]);

  const conflictLabel = (field: string) => wizardFieldLabel(field);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadingCount(files.length);
    setError('');
    // All files go into one batch request: the backend analyzes them with
    // bounded concurrency (OCR + AI in parallel, persistence serialized) and
    // returns the results in the original upload order.
    const body = new FormData();
    for (const file of [...files]) body.append('files', file);
    try {
      const response = await apiFetch(`/api/properties/${propertyId}/documents`, {
        method: 'POST',
        body,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        const mapped = documentUploadErrorKey(result.error);
        setError(mapped ? t(mapped) : t('documentsStep.uploadFailed'));
      } else {
        const uploaded = (await response.json()) as DocumentRecord[] | JobEnqueueResponse;
        if (Array.isArray(uploaded) && uploaded.length) {
          notify([...uploaded, ...documents]);
        } else if (!Array.isArray(uploaded) && uploaded.jobId) {
          // Asynchronous flow: the request returned a jobId. Subscribe to its
          // live progress and refresh the document list when it completes.
          setActiveJobId(uploaded.jobId);
        } else {
          setError(t('documentsStep.uploadFailed'));
        }
      }
    } catch {
      setError(t('documentsStep.uploadFailed'));
    }
    setUploading(false);
    setUploadingCount(0);
  }

  async function retry(documentId: string) {
    try {
      const response = await apiFetch(
        `/api/properties/${propertyId}/documents/${documentId}/analyze`,
        { method: 'POST' },
      );
      if (!response.ok) return;
      const result = (await response.json()) as DocumentRecord | JobEnqueueResponse;
      if ('id' in result && typeof result.id === 'string') {
        notify(documents.map((document) => (document.id === result.id ? result : document)));
      } else if ('jobId' in result && typeof result.jobId === 'string') {
        setActiveJobId(result.jobId);
      }
    } catch {
      setError(t('documentsStep.reanalyzeFailed'));
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
        toast.success(t('documentsStep.removed'));
      } else setError(t('documentsStep.removeFailed'));
    } catch {
      setError(t('documentsStep.removeFailed'));
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
      title={t('documentsStep.sectionTitle')}
      description={t('documentsStep.sectionDescription')}
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
            {t('documentsStep.dropzoneHeading')}
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {t('documentsStep.dropzoneText')}
          </p>
          <Button
            type="button"
            className="mt-5"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <UploadCloud className="size-4" />
            )}
            {uploading ? t('documentsStep.uploading') : t('documentsStep.uploadDocuments')}
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
          <p className="mt-3 text-xs text-muted-foreground">{t('documentsStep.dropzoneHint')}</p>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {uploading && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {uploadingCount > 0
              ? uploadingCount === 1
                ? t('documentsStep.analyzingCountOne', { count: uploadingCount })
                : t('documentsStep.analyzingCount', { count: uploadingCount })
              : t('documentsStep.analyzing')}
          </p>
        )}

        {job.state && (
          <JobProgressCard job={job.state} reconnecting={job.reconnecting} t={t} />
        )}

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
              <p className="font-semibold text-foreground">{t('documentsStep.successHeading')}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {analyzedCount === 1
                ? t('documentsStep.successTextOne', { count: analyzedCount })
                : t('documentsStep.successText', { count: analyzedCount })}
            </p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {foundCategories.map((category) => (
                <div key={category.category}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(`documentsStep.foundCategories.${category.category}`)}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {category.found.map((field) => {
                      const sources = sourcesByField[field];
                      const value = pickDefault(sources)?.value;
                      if (value == null) return null;
                      return (
                        <li
                          key={field}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="text-foreground">{t(wizardFieldLabel(field))}</span>
                          <span className="text-right font-medium text-foreground">
                            {formatFoundValue(field, value, locale)}
                            {sources.length > 1 && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {t('documentsStep.sourcesCount', { count: sources.length })}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <p className="inline-flex items-center gap-2 font-semibold text-amber-800">
              <AlertTriangle className="size-4" /> {t('documentsStep.conflictHeading')}
            </p>
            <p className="mt-1 text-sm text-amber-700">{t('documentsStep.conflictText')}</p>
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
                      {t(conflictLabel(field))}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {formatExtractedValue(sources[0].value, locale)}
                      </span>
                    </p>
                    {differing.length > 1 && (
                      <ul className="mt-1 space-y-0.5">
                        {differing.slice(1).map((source, index) => (
                          <li
                            key={`${source.sourceDocumentId}-${index}`}
                            className="text-xs text-amber-700"
                          >
                            <span className="font-semibold text-amber-800">
                              {formatExtractedValue(source.value, locale)}
                            </span>{' '}
                            · {source.sourceFilename}
                          </li>
                        ))}
                      </ul>
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

/** Live progress / terminal-state card shown while a processing job runs. */
function JobProgressCard({
  job,
  reconnecting,
  t,
}: {
  job: JobProgressState;
  reconnecting: boolean;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const completed = job.status === 'completed';
  const failed = job.status === 'failed';
  const active = !completed && !failed;
  const stepKey = currentStepLabel(job.currentStep);
  const progress = completed ? 100 : Math.max(0, Math.min(100, job.progress ?? 0));

  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        failed
          ? 'border-destructive/30 bg-destructive/5'
          : completed
            ? 'border-primary/25 bg-primary/[0.04]'
            : 'border-border bg-card',
      )}
    >
      <div className="flex items-center gap-2">
        {active ? (
          <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
        ) : completed ? (
          <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3" aria-hidden />
          </span>
        ) : (
          <span className="grid size-5 place-items-center rounded-full bg-destructive text-destructive-foreground">
            <X className="size-3" aria-hidden />
          </span>
        )}
        <p
          className={cn(
            'font-semibold text-foreground',
            failed && 'text-destructive',
            completed && 'text-primary',
          )}
        >
          {failed
            ? t('documentsStep.processingFailed')
            : completed
              ? t('documentsStep.processingCompleted')
              : t('documentsStep.processingRunning')}
        </p>
        {active && reconnecting && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t('documentsStep.processingReconnecting')}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Progress
          value={progress}
          className={cn('h-2 flex-1', failed && '[&>div]:bg-destructive')}
        />
        <span className="text-sm font-medium tabular-nums text-foreground">{progress}%</span>
      </div>

      <div className="mt-3 space-y-1">
        {failed && job.error ? (
          // The raw backend error is mapped to a translated message; unknown
          // values fall back to the already-translated failure heading above.
          <p className="text-sm text-destructive">
            {(() => {
              const mapped = documentUploadErrorKey(job.error);
              return mapped ? t(mapped) : t('documentsStep.processingFailed');
            })()}
          </p>
        ) : (
          <>
            {stepKey && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {active && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
                {t(stepKey)}
              </p>
            )}
            {completed && (
              <p className="text-sm text-muted-foreground">
                {t('documentsStep.processingDoneHint')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
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
  const { t, locale } = useI18n();
  const image = isImage(document.mimeType);
  const analyzing = document.status === 'pending' || document.status === 'processing';
  const analyzed = document.status === 'completed' && document.understandingResult;
  const failed = document.status === 'failed' || document.understandingError != null;
  const tags = document.understandingResult?.tags?.length
    ? document.understandingResult.tags
    : document.tags?.length
      ? document.tags
      : [];
  // AI photo metadata (Phase 9): photo type and visible features are shown
  // only for property photos and only when the analysis produced them.
  const photo = document.understandingResult?.photo;
  const photoType = document.documentType === 'property_photo' ? photo?.photoType : null;
  const photoTags = photo?.photoTags?.length ? photo.photoTags.map((entry) => entry.tag) : [];

  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card p-4">
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
              {image ? t('documentsStep.imageLabel') : t('documentsStep.documentLabel')} ·{' '}
              {formatSize(document.size, locale)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('common.removeFile', { name: document.filename })}
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
              aria-label={t('common.viewFile', { name: document.filename })}
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
          <p className="text-sm text-destructive">{t('common.deleteConfirmation')}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
              {t('common.remove')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onToggleConfirm}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {document.documentType && document.documentType !== 'other' && (
          <Badge variant="secondary">{t(DOCUMENT_TYPE_LABELS[document.documentType])}</Badge>
        )}
        {analyzed && (
          <Badge
            variant="outline"
            className="border-transparent bg-primary/10 font-medium text-primary"
          >
            <Check className="size-3" /> {t('documentsStep.statusAnalyzed')}
          </Badge>
        )}
        {document.status === 'completed' && !document.understandingResult && (
          <Badge variant="outline" className="text-muted-foreground">
            <Check className="size-3" /> {t('documentsStep.statusAnalyzed')}
          </Badge>
        )}
        {failed && (
          <Badge
            variant="outline"
            className="border-transparent bg-destructive/10 font-medium text-destructive"
          >
            {t('documentsStep.statusFailed')}
          </Badge>
        )}
        {analyzing && (
          <Badge variant="outline" className="text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" /> {t('documentsStep.statusAnalyzing')}
          </Badge>
        )}
      </div>

      {failed && (
        <p className="mt-2 text-xs leading-4 text-destructive">
          {documentFailureMessage(document, t)}
        </p>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {photoType && (
        <p className="mt-2 text-sm font-medium text-foreground">{t(photoTypeLabel(photoType))}</p>
      )}
      {photoTags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {photoTags.map((tag) => (
            <Badge key={tag} variant="outline" className="font-normal text-muted-foreground">
              {t(PHOTO_TAG_LABELS[tag] ?? tag)}
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
                {t('common.summary')}
              </p>
              <p className="mt-1 text-xs leading-4 text-foreground">
                {document.understandingResult.summary}
              </p>
            </div>
          ) : null}
          {document.understandingResult.wizardFields?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('common.foundInformation')}
              </p>
              <ul className="mt-1 space-y-1">
                {document.understandingResult.wizardFields.map((field, index) => (
                  <li key={`${field.field}-${index}`} className="text-xs leading-5">
                    <span className="font-medium text-foreground">
                      {t(wizardFieldLabel(field.field))}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      → {formatExtractedValue(field.value, locale)}
                    </span>
                    {field.evidence && (
                      <span className="block text-muted-foreground">
                        {t('documentsStep.detailSource', { evidence: field.evidence })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {document.understandingResult.additionalInformation?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('common.additionalInformation')}
              </p>
              <ul className="mt-1 space-y-1">
                {document.understandingResult.additionalInformation.map((info, index) => (
                  <li key={`${info.key}-${index}`} className="text-xs leading-5">
                    <span className="font-medium text-foreground">
                      {t(additionalInfoLabel(info.key))}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      → {formatExtractedValue(info.value, locale)}
                    </span>
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
          <RefreshCw className="size-3.5" /> {t('documentsStep.retryAnalysis')}
        </Button>
      )}
    </div>
  );
}
