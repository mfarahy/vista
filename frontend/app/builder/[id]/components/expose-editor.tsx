'use client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import type { Property } from '../../../create/[id]/types';
import { Field } from '../../../create/[id]/components/ui';
import type {
  EffectiveMarketingContent,
  ExposeBranding,
  ExposeConfiguration,
  ExposeContentOverrides,
} from '../expose-model';
import {
  energyFacts,
  equipmentFeatures,
  floorplanImages,
  galleryImagesOf,
  locationLine,
  photoImages,
  propertyFacts,
  summaryFacts,
} from '../expose-model';
import type { ExposeMedia } from '../expose-model';

/**
 * Exposé Builder editor panes (Phase 11). The Builder is organized into
 * groups — Design, Abschnitte, Inhalt, Medien, Markenauftritt, Objektdaten,
 * Kontakt — instead of per-section panes. Facts stay read-only
 * (Nur-Lese · Objektdaten); only marketing copy, media references, template,
 * and branding are editable.
 */

function EditableTag() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      <Pencil className="size-3" aria-hidden /> {t('builder.editableTag')}
    </span>
  );
}

function ReadonlyTag() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {t('builder.readonlyTag')}
    </span>
  );
}

function EditorShell({
  title,
  tag,
  children,
}: {
  title: string;
  tag: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {tag}
      </div>
      {children}
    </div>
  );
}

function FactList({
  facts,
  sourceNote,
}: {
  facts: Array<{ label: string; value: string }>;
  sourceNote: string;
}) {
  const { t } = useI18n();
  if (!facts.length) {
    return <p className="text-sm text-muted-foreground">{t('builder.noData')}</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {facts.map((fact, index) => (
        <div
          key={fact.label}
          className={cn(
            'grid grid-cols-[160px_1fr] items-baseline gap-3 px-4 py-2.5 text-sm',
            index % 2 === 0 ? 'bg-background' : 'bg-muted/30',
          )}
        >
          <span className="text-muted-foreground">{t(fact.label)}</span>
          <span className="font-medium text-foreground">{fact.value}</span>
        </div>
      ))}
      <p className="border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
        {sourceNote}
      </p>
    </div>
  );
}

const READONLY_SOURCE_NOTE = 'builder.readonlySourceNote';

/* ------------------------------------------------------------------ */
/* Inhalt                                                              */
/* ------------------------------------------------------------------ */

export function ContentEditor({
  property,
  effective,
  setOverride,
  marketingFallback,
}: {
  property: Property;
  effective: EffectiveMarketingContent;
  setOverride: (key: keyof ExposeContentOverrides, value: string | string[]) => void;
  marketingFallback: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <EditorShell title={t('builder.editorShell.titleSubtitle')} tag={<EditableTag />}>
        <div className="space-y-4">
          <Field label={t('steps.marketing.titleLabel')} hint={t('builder.editorShell.titleHint')}>
            <Input
              value={effective.title}
              onChange={(event) => setOverride('title', event.target.value)}
              placeholder={t('builder.editorShell.titlePlaceholder')}
            />
          </Field>
          <Field label={t('builder.editorShell.subtitleLabel')}>
            <Input
              value={effective.subtitle}
              onChange={(event) => setOverride('subtitle', event.target.value)}
              placeholder={t('builder.editorShell.subtitlePlaceholder')}
            />
          </Field>
          <Field label={t('builder.editorShell.cityLabel')}>
            <Input
              value={locationLine(property)}
              readOnly
              className="bg-muted/40 text-muted-foreground"
            />
          </Field>
        </div>
      </EditorShell>
      <HighlightsEditor
        highlights={effective.highlights}
        setOverride={setOverride}
        marketingFallback={marketingFallback}
      />
      <EditorShell title={t('builder.editorShell.descriptionTitle')} tag={<EditableTag />}>
        <Field
          label={t('builder.editorShell.descriptionLabel')}
          hint={t('builder.editorShell.descriptionHint')}
        >
          <Textarea
            value={effective.propertyDescription}
            onChange={(event) => setOverride('propertyDescription', event.target.value)}
            rows={7}
            placeholder={t('builder.editorShell.descriptionPlaceholder')}
          />
        </Field>
      </EditorShell>
      <EditorShell title={t('builder.editorShell.equipmentTitle')} tag={<EditableTag />}>
        <Field
          label={t('builder.editorShell.descriptionLabel')}
          hint={t('builder.editorShell.equipmentHint')}
        >
          <Textarea
            value={effective.equipmentDescription}
            onChange={(event) => setOverride('equipmentDescription', event.target.value)}
            rows={5}
            placeholder={t('builder.editorShell.equipmentPlaceholder')}
          />
        </Field>
      </EditorShell>
      <EditorShell title={t('builder.editorShell.locationTitle')} tag={<EditableTag />}>
        <Field
          label={t('builder.editorShell.descriptionLabel')}
          hint={t('builder.editorShell.locationHint')}
        >
          <Textarea
            value={effective.locationDescription}
            onChange={(event) => setOverride('locationDescription', event.target.value)}
            rows={5}
            placeholder={t('builder.editorShell.locationPlaceholder')}
          />
        </Field>
      </EditorShell>
    </div>
  );
}

function HighlightsEditor({
  highlights,
  setOverride,
  marketingFallback,
}: {
  highlights: string[];
  setOverride: (key: keyof ExposeContentOverrides, value: string | string[]) => void;
  marketingFallback: boolean;
}) {
  const { t } = useI18n();
  const update = (next: string[]) => setOverride('highlights', next);
  return (
    <EditorShell title={t('builder.editorShell.highlightsTitle')} tag={<EditableTag />}>
      <p className="text-xs text-muted-foreground">
        {marketingFallback
          ? t('builder.editorShell.highlightsNote')
          : t('builder.editorShell.highlightsEmpty')}
      </p>
      <div className="space-y-2">
        {highlights.map((highlight, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <Input
              value={highlight}
              onChange={(event) => {
                const next = [...highlights];
                next[index] = event.target.value;
                update(next);
              }}
              placeholder={t('builder.editorShell.highlightPlaceholder', { number: index + 1 })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('builder.editorShell.removeHighlight', { number: index + 1 })}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => update(highlights.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => update([...highlights, ''])}>
        <Plus className="size-4" /> {t('builder.editorShell.addHighlight')}
      </Button>
    </EditorShell>
  );
}

/* ------------------------------------------------------------------ */
/* Medien                                                              */
/* ------------------------------------------------------------------ */

export function MediaEditor({
  property,
  configuration,
  setCoverImageId,
  toggleGalleryImage,
}: {
  property: Property;
  configuration: ExposeConfiguration;
  setCoverImageId: (id: string) => void;
  toggleGalleryImage: (id: string) => void;
}) {
  const { t } = useI18n();
  const photos = photoImages(property.images);
  const selected = new Set(galleryImagesOf(property, configuration).map((image) => image.id));
  return (
    <div className="space-y-6">
      <EditorShell
        title={t('builder.editorShell.coverTitle')}
        tag={
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t('builder.editorShell.selectionTag')}
          </span>
        }
      >
        <p className="text-xs text-muted-foreground">{t('builder.editorShell.coverNote')}</p>
        {photos.length ? (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((image) => {
              const isCover = image.id === configuration.selectedCoverImageId;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setCoverImageId(image.id)}
                  aria-label={t('builder.editorShell.chooseAsCover', {
                    name: image.caption || image.fileName,
                  })}
                  aria-pressed={isCover}
                  className={cn(
                    'relative overflow-hidden rounded-lg border-2 transition-colors',
                    isCover
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent hover:border-border',
                  )}
                >
                  <img
                    src={apiAssetUrl(image.url)}
                    alt={image.caption || image.fileName || t('builder.editorShell.photoAlt')}
                    className="aspect-square w-full object-cover"
                  />
                  {isCover && (
                    <span className="absolute inset-x-0 bottom-0 bg-primary/90 py-0.5 text-center text-[10px] font-semibold text-primary-foreground">
                      {t('builder.editorShell.coverOverlay')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t('builder.editorShell.noPhotos')}
          </p>
        )}
      </EditorShell>
      <EditorShell
        title={t('builder.editorShell.galleryTitle')}
        tag={
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t('builder.editorShell.selectionTag')}
          </span>
        }
      >
        <p className="text-xs text-muted-foreground">{t('builder.editorShell.galleryNote')}</p>
        {photos.length ? (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((image) => {
              const included = selected.has(image.id);
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => toggleGalleryImage(image.id)}
                  aria-label={t('builder.editorShell.galleryToggle', {
                    name: image.caption || image.fileName,
                    state: included
                      ? t('builder.editorShell.inGallery')
                      : t('builder.editorShell.outOfGallery'),
                  })}
                  aria-pressed={included}
                  className={cn(
                    'relative overflow-hidden rounded-lg border-2 transition-colors',
                    included
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent opacity-55 hover:opacity-90',
                  )}
                >
                  <img
                    src={apiAssetUrl(image.url)}
                    alt={image.caption || image.fileName || t('builder.editorShell.photoAlt')}
                    className="aspect-square w-full object-cover"
                  />
                  <span
                    className={cn(
                      'absolute right-1 top-1 grid size-5 place-items-center rounded-full text-[10px] font-bold text-white',
                      included ? 'bg-primary' : 'bg-black/40',
                    )}
                  >
                    {included ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t('builder.editorShell.noPhotos')}
          </p>
        )}
      </EditorShell>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Markenauftritt                                                      */
/* ------------------------------------------------------------------ */

export function BrandingEditor({
  property,
  configuration,
  setBranding,
}: {
  property: Property;
  configuration: ExposeConfiguration;
  setBranding: (key: keyof ExposeBranding, value: string) => void;
}) {
  const { t } = useI18n();
  const agent = property.exposeData?.agent;
  const system = property.exposeData?.systemBranding;
  const branding = configuration.branding ?? {};
  const agentCompany = agent?.company || system?.companyName || '';
  const hasAgentData = Boolean(
    agentCompany || agent?.phone || agent?.email || agent?.website || agent?.logo,
  );
  return (
    <div className="space-y-6">
      <p className="text-xs leading-5 text-muted-foreground">
        {hasAgentData
          ? t('builder.editorShell.contactIntroWithAgent')
          : t('builder.editorShell.contactIntroWithoutAgent')}
      </p>
      <EditorShell title={t('builder.editorShell.companyTitle')} tag={<EditableTag />}>
        <Field
          label={t('builder.editorShell.companyTitle')}
          hint={t('builder.editorShell.companyHint')}
        >
          <Input
            value={branding.companyName ?? ''}
            onChange={(event) => setBranding('companyName', event.target.value)}
            placeholder={agentCompany || t('builder.editorShell.companyPlaceholder')}
          />
        </Field>
      </EditorShell>
      <EditorShell title={t('builder.editorShell.logoTitle')} tag={<EditableTag />}>
        <Field
          label={t('builder.editorShell.logoUrlLabel')}
          hint={t('builder.editorShell.logoUrlHint')}
        >
          <Input
            value={branding.logoUrl ?? ''}
            onChange={(event) => setBranding('logoUrl', event.target.value)}
            placeholder={agent?.logo || t('builder.editorShell.logoUrlPlaceholder')}
          />
        </Field>
        {branding.logoUrl?.trim() && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] text-muted-foreground">
              {t('builder.editorShell.previewLabel')}
            </p>
            <img
              src={apiAssetUrl(branding.logoUrl)}
              alt={t('builder.editorShell.logoPreviewAlt')}
              className="max-h-14 object-contain"
              onError={(event) => {
                (event.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
      </EditorShell>
      <EditorShell title={t('builder.editorShell.contactTitle')} tag={<EditableTag />}>
        <div className="space-y-4">
          <Field label={t('fields.phone')}>
            <Input
              value={branding.phone ?? ''}
              onChange={(event) => setBranding('phone', event.target.value)}
              placeholder={agent?.phone || t('builder.editorShell.phonePlaceholder')}
            />
          </Field>
          <Field label={t('fields.email')}>
            <Input
              type="email"
              value={branding.email ?? ''}
              onChange={(event) => setBranding('email', event.target.value)}
              placeholder={agent?.email || t('builder.editorShell.emailPlaceholder')}
            />
          </Field>
          <Field label={t('fields.website')}>
            <Input
              value={branding.website ?? ''}
              onChange={(event) => setBranding('website', event.target.value)}
              placeholder={agent?.website || t('builder.editorShell.websitePlaceholder')}
            />
          </Field>
        </div>
      </EditorShell>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Objektdaten                                                         */
/* ------------------------------------------------------------------ */

export function FactsEditor({ property, media }: { property: Property; media: ExposeMedia }) {
  const { locale, t } = useI18n();
  const tr = { locale, t };
  const plans = floorplanImages(media.images);
  const features = equipmentFeatures(property);
  return (
    <div className="space-y-6">
      <EditorShell title={t('builder.editorShell.factsTitle')} tag={<ReadonlyTag />}>
        <FactList facts={summaryFacts(property, tr)} sourceNote={t(READONLY_SOURCE_NOTE)} />
      </EditorShell>
      <EditorShell title={t('builder.editorShell.objectDataTitle')} tag={<ReadonlyTag />}>
        <FactList facts={propertyFacts(property, tr)} sourceNote={t(READONLY_SOURCE_NOTE)} />
      </EditorShell>
      <EditorShell title={t('builder.editorShell.energyTitle')} tag={<ReadonlyTag />}>
        <FactList facts={energyFacts(property, tr)} sourceNote={t(READONLY_SOURCE_NOTE)} />
      </EditorShell>
      <EditorShell title={t('builder.editorShell.featuresTitle')} tag={<ReadonlyTag />}>
        {features.length ? (
          <ul className="flex flex-wrap gap-2">
            {features.map((feature) => (
              <li
                key={feature}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
              >
                {t(feature)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('builder.editorShell.noFeatures')}</p>
        )}
      </EditorShell>
      <EditorShell title={t('builder.editorShell.floorplansTitle')} tag={<ReadonlyTag />}>
        {plans.length ? (
          <ul className="space-y-2">
            {plans.map((image) => (
              <li
                key={image.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <img
                  src={apiAssetUrl(image.url)}
                  alt={image.caption || image.fileName || t('expose.altFallbacks.floorPlan')}
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 truncate font-medium text-foreground">
                  {image.caption || image.fileName}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t('builder.editorShell.noFloorplans')}
          </p>
        )}
      </EditorShell>
      <DocumentsEditor records={media.documents} />
    </div>
  );
}

const PUBLISHABLE_DOCUMENT_TYPES = ['grundriss', 'energieausweis'];

function DocumentsEditor({ records }: { records: ExposeMedia['documents'] }) {
  const { t } = useI18n();
  const documents = records.filter(
    (record) => record.documentType && PUBLISHABLE_DOCUMENT_TYPES.includes(record.documentType),
  );
  return (
    <EditorShell
      title={t('builder.editorShell.documentsTitle')}
      tag={
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {t('builder.editorShell.presentationOnlyTag')}
        </span>
      }
    >
      <p className="text-xs text-muted-foreground">{t('builder.editorShell.documentsNote')}</p>
      {documents.length ? (
        <ul className="space-y-2">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate font-medium text-foreground">
                {document.filename}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {t(
                  document.documentType === 'grundriss'
                    ? 'builder.editorShell.documentTypeFloorplan'
                    : 'builder.editorShell.documentTypeEnergy',
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t('builder.editorShell.noDocuments')}
        </p>
      )}
    </EditorShell>
  );
}

/* ------------------------------------------------------------------ */
/* Kontakt                                                             */
/* ------------------------------------------------------------------ */

export function ContactEditor({ property }: { property: Property }) {
  const { t } = useI18n();
  const agent = property.exposeData?.agent;
  const address = agent?.address
    ? [
        [agent.address.street, agent.address.houseNumber].filter(Boolean).join(' '),
        [agent.address.postalCode, agent.address.city].filter(Boolean).join(' '),
      ].filter(Boolean)
    : [];
  return (
    <EditorShell title={t('builder.editorShell.contactPersonTitle')} tag={<ReadonlyTag />}>
      <p className="text-xs text-muted-foreground">{t('builder.editorShell.contactPersonNote')}</p>
      {agent?.name || agent?.company ? (
        <div className="space-y-1 text-sm">
          {agent?.name && <p className="font-medium text-foreground">{agent.name}</p>}
          {agent?.company && <p className="text-muted-foreground">{agent.company}</p>}
          {address.length > 0 && <p className="text-muted-foreground">{address.join(', ')}</p>}
          {[agent?.phone, agent?.email, agent?.website].filter(Boolean).length > 0 && (
            <p className="text-muted-foreground">
              {[agent?.phone, agent?.email, agent?.website].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t('builder.editorShell.noContactPerson')}
        </p>
      )}
    </EditorShell>
  );
}
