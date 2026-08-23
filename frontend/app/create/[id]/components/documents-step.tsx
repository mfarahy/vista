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
import {
  BUILDING_STATUSES,
  DOCUMENT_TYPE_LABELS,
  ENERGY_CERTIFICATE_TYPES,
  ENERGY_SOURCES,
  PHOTO_TAG_LABELS,
  PROPERTY_SUBTYPES,
  PROPERTY_TYPES,
  conditionLabel,
  photoTypeLabel,
  subtypeLabel,
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

/** Categories of the "Gefundene Informationen" overview (spec §16). */
const FOUND_CATEGORIES: Array<{ label: string; fields: Array<[string, string]> }> = [
  {
    label: 'Adresse',
    fields: [
      ['street', 'Straße'],
      ['houseNumber', 'Hausnummer'],
      ['postalCode', 'PLZ'],
      ['city', 'Ort'],
      ['district', 'Stadtteil'],
      ['state', 'Bundesland'],
      ['country', 'Land'],
    ],
  },
  {
    label: 'Objekt',
    fields: [
      ['propertyType', 'Objektart'],
      ['propertySubtype', 'Objektunterart'],
      ['usageType', 'Verwendungszweck'],
      ['livingArea', 'Wohnfläche'],
      ['usableArea', 'Nutzfläche'],
      ['plotArea', 'Grundstücksfläche'],
      ['rooms', 'Zimmer'],
      ['bedrooms', 'Schlafzimmer'],
      ['bathrooms', 'Badezimmer'],
      ['guestToilets', 'Gäste-WCs'],
      ['floor', 'Etage'],
    ],
  },
  {
    label: 'Gebäude',
    fields: [
      ['yearBuilt', 'Baujahr'],
      ['buildingStatus', 'Objektstatus'],
      ['condition', 'Zustand'],
      ['renovationStatus', 'Sanierungsstatus'],
      ['lastModernizationYear', 'Letzte Modernisierung'],
      ['numberOfFloors', 'Etagen'],
      ['basement', 'Keller'],
      ['attic', 'Dachgeschoss'],
    ],
  },
  {
    label: 'Finanzen',
    fields: [
      ['askingPrice', 'Kaufpreis'],
      ['pricePerM2', 'Kaufpreis / m²'],
      ['monthlyRent', 'Kaltmiete'],
      ['annualRent', 'Jahresmiete'],
      ['additionalCosts', 'Nebenkosten'],
      ['deposit', 'Kaution'],
      ['commissionRate', 'Provisionssatz'],
      ['commissionPayer', 'Provisionszahler'],
      ['hausgeld', 'Hausgeld'],
      ['maintenanceReserve', 'Instandhaltungsrücklage'],
      ['coOwnershipShare', 'Miteigentumsanteil'],
      ['grossYieldTarget', 'Bruttorendite (Soll)'],
      ['grossYieldActual', 'Bruttorendite (Ist)'],
      ['availableFrom', 'Verfügbar ab'],
    ],
  },
  {
    label: 'Energie',
    fields: [
      ['energyClass', 'Effizienzklasse'],
      ['energyDemand', 'Endenergiebedarf'],
      ['energyConsumption', 'Endenergieverbrauch'],
      ['heatingType', 'Heizungsart'],
      ['primaryEnergySource', 'Energieträger'],
      ['yearOfConstruction', 'Baujahr laut Ausweis'],
      ['certificateType', 'Ausweistyp'],
      ['certificateDate', 'Ausgestellt am'],
      ['certificateValidUntil', 'Gültig bis'],
      ['hotWaterIncluded', 'Warmwasser enthalten'],
    ],
  },
];

function formatFoundValue(field: string, value: string | number | boolean | null): string {
  if (typeof value === 'boolean') return formatExtractedValue(value);
  const text = String(value);
  const enumLabel = (
    options: ReadonlyArray<readonly [string, string]>,
    key: string,
  ) => options.find(([option]) => option === key)?.[1];
  const labeled: Record<string, string | undefined> = {
    propertyType: enumLabel(PROPERTY_TYPES as ReadonlyArray<readonly [string, string]>, text),
    buildingStatus: enumLabel(BUILDING_STATUSES as ReadonlyArray<readonly [string, string]>, text),
    certificateType: enumLabel(
      ENERGY_CERTIFICATE_TYPES as ReadonlyArray<readonly [string, string]>,
      text,
    ),
    primaryEnergySource: enumLabel(
      ENERGY_SOURCES as ReadonlyArray<readonly [string, string]>,
      text,
    ),
    commissionPayer: { buyer: 'Käufer', seller: 'Verkäufer', both: 'Beide' }[text],
  };
  const knownLabel = labeled[field];
  if (knownLabel) return knownLabel;
  if (field === 'propertySubtype') {
    for (const type of Object.keys(PROPERTY_SUBTYPES)) {
      const label = subtypeLabel(type, text);
      if (label && label !== text) return label;
    }
    return text;
  }
  if (field === 'condition') return conditionLabel(text) || text;
  const number = typeof value === 'number' ? value : Number(text.replace(/\./g, '').replace(',', '.'));
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
    const percentFields = new Set([
      'commissionRate',
      'grossYieldTarget',
      'grossYieldActual',
    ]);
    if (moneyFields.has(field)) {
      return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(number)} €`;
    }
    if (percentFields.has(field)) {
      return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(number)} %`;
    }
    const areaFields = new Set(['livingArea', 'usableArea', 'plotArea', 'gardenArea']);
    if (areaFields.has(field)) return `${formatExtractedValue(value)} m²`;
    if (field === 'energyDemand' || field === 'energyConsumption')
      return `${formatExtractedValue(value)} kWh/(m²·a)`;
  }
  return formatExtractedValue(value);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        setError('Die Dokumente konnten nicht geladen werden.');
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

  const foundCategories = FOUND_CATEGORIES.map((category) => ({
    ...category,
    found: category.fields.filter(([field]) => sourcesByField[field]?.length),
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
        setError(result.error || 'Die Dokumente konnten nicht hochgeladen werden.');
      } else {
        const uploaded = (await response.json()) as DocumentRecord[];
        if (Array.isArray(uploaded) && uploaded.length) {
          notify([...uploaded, ...documents]);
        }
      }
    } catch {
      setError('Die Dokumente konnten nicht hochgeladen werden.');
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
      const updated = (await response.json()) as DocumentRecord;
      notify(documents.map((document) => (document.id === updated.id ? updated : document)));
    } catch {
      setError('Das Dokument konnte nicht erneut analysiert werden.');
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
        toast.success('Dokument entfernt');
      } else setError('Das Dokument konnte nicht entfernt werden.');
    } catch {
      setError('Das Dokument konnte nicht entfernt werden.');
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
      title="Dokumente"
      description="Laden Sie alle Unterlagen, Pläne oder Fotos hoch, die Sie zur Immobilie haben. Vista analysiert sie und übernimmt die gefundenen Angaben in den Assistenten."
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
            Laden Sie alles hoch, was Sie zu dieser Immobilie haben
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Vista ordnet die Dokumente und füllt die restlichen Schritte im Assistenten damit vor.
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
            {uploading ? 'Wird hochgeladen…' : 'Dokumente hochladen'}
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
            Per Drag &amp; Drop oder Auswahl hinzufügen · PDF, JPG, PNG oder WEBP · max. 25 MB pro
            Datei
          </p>
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
              ? `${uploadingCount} ${uploadingCount === 1 ? 'Dokument' : 'Dokumente'} werden analysiert…`
              : 'Wird analysiert…'}
          </p>
        )}

        {!documents.length && !uploading ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/20 px-6 py-12 text-center">
            <FileText className="size-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-foreground">Noch keine Dokumente</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Laden Sie Ihre Unterlagen, Pläne oder Fotos zur Immobilie hoch. Vista ordnet sie und
              nutzt die Informationen zum Ausfüllen des Assistenten.
            </p>
            <Button type="button" className="mt-5" onClick={() => fileRef.current?.click()}>
              <UploadCloud className="size-4" /> Dokumente hochladen
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
              <p className="font-semibold text-foreground">Informationen gefunden</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Vista hat Ihre Dokumente verstanden und in {analyzedCount}{' '}
              {analyzedCount === 1 ? 'Dokument' : 'Dokumenten'} verwertbare Informationen gefunden.
            </p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {foundCategories.map((category) => (
                <div key={category.label}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {category.label}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {category.found.map(([field, label]) => {
                      const sources = sourcesByField[field];
                      const value = pickDefault(sources)?.value;
                      if (value == null) return null;
                      return (
                        <li
                          key={field}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="text-foreground">{label}</span>
                          <span className="text-right font-medium text-foreground">
                            {formatFoundValue(field, value)}
                            {sources.length > 1 && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                · {sources.length} Quellen
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
              <AlertTriangle className="size-4" /> Unterschiedliche Werte in Ihren Dokumenten
              gefunden
            </p>
            <p className="mt-1 text-sm text-amber-700">
              Zu einigen Angaben finden sich unterschiedliche Werte. Sie können sie später im
              Assistenten prüfen und anpassen.
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
                        · {formatExtractedValue(sources[0].value)}
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
                              {formatExtractedValue(source.value)}
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
  // AI photo metadata (Phase 9): photo type and visible features are shown
  // only for property photos and only when the analysis produced them.
  const photo = document.understandingResult?.photo;
  const photoType = document.documentType === 'property_photo' ? photo?.photoType : null;
  const photoTags = photo?.photoTags?.length ? photo.photoTags.map((entry) => entry.tag) : [];

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
              {image ? 'Bild' : 'Dokument'} · {formatSize(document.size)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${document.filename} entfernen`}
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
              aria-label={`${document.filename} ansehen`}
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
          <p className="text-sm text-destructive">Dieses Dokument von der Immobilie entfernen?</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
              Entfernen
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onToggleConfirm}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {document.documentType && document.documentType !== 'other' && (
          <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[document.documentType]}</Badge>
        )}
        {analyzed && (
          <Badge
            variant="outline"
            className="border-transparent bg-primary/10 font-medium text-primary"
          >
            <Check className="size-3" /> Analysiert
          </Badge>
        )}
        {document.status === 'completed' && !document.understandingResult && (
          <Badge variant="outline" className="text-muted-foreground">
            <Check className="size-3" /> Analysiert
          </Badge>
        )}
        {failed && (
          <Badge
            variant="outline"
            className="border-transparent bg-destructive/10 font-medium text-destructive"
          >
            Analyse fehlgeschlagen
          </Badge>
        )}
        {analyzing && (
          <Badge variant="outline" className="text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" /> Wird analysiert…
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

      {photoType && (
        <p className="mt-2 text-sm font-medium text-foreground">{photoTypeLabel(photoType)}</p>
      )}
      {photoTags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {photoTags.map((tag) => (
            <Badge key={tag} variant="outline" className="font-normal text-muted-foreground">
              {PHOTO_TAG_LABELS[tag] ?? tag}
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
                Zusammenfassung
              </p>
              <p className="mt-1 text-xs leading-4 text-foreground">
                {document.understandingResult.summary}
              </p>
            </div>
          ) : null}
          {document.understandingResult.wizardFields?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Gefundene Informationen
              </p>
              <ul className="mt-1 space-y-1">
                {document.understandingResult.wizardFields.map((field, index) => (
                  <li key={`${field.field}-${index}`} className="text-xs leading-5">
                    <span className="font-medium text-foreground">
                      {wizardFieldLabel(field.field)}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      → {formatExtractedValue(field.value)}
                    </span>
                    {field.evidence && (
                      <span className="block text-muted-foreground">
                        Quelle: “{field.evidence}”
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
                Zusätzliche Informationen
              </p>
              <ul className="mt-1 space-y-1">
                {document.understandingResult.additionalInformation.map((info, index) => (
                  <li key={`${info.key}-${index}`} className="text-xs leading-5">
                    <span className="font-medium text-foreground">{info.key}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      → {formatExtractedValue(info.value)}
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
          <RefreshCw className="size-3.5" /> Erneut analysieren
        </Button>
      )}
    </div>
  );
}
