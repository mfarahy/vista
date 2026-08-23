'use client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      <Pencil className="size-3" aria-hidden /> Bearbeitbar
    </span>
  );
}

function ReadonlyTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Nur-Lese · Objektdaten
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
  if (!facts.length) {
    return <p className="text-sm text-muted-foreground">Keine Daten vorhanden.</p>;
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
          <span className="text-muted-foreground">{fact.label}</span>
          <span className="font-medium text-foreground">{fact.value}</span>
        </div>
      ))}
      <p className="border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
        {sourceNote}
      </p>
    </div>
  );
}

const READONLY_SOURCE_NOTE = 'Aus Ihren Objektdaten. Änderungen bitte im Assistenten vornehmen.';

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
  return (
    <div className="space-y-6">
      <EditorShell title="Titel & Untertitel" tag={<EditableTag />}>
        <div className="space-y-4">
          <Field label="Titel" hint="Bearbeitet nur dieses Exposé — der KI-Inhalt bleibt erhalten.">
            <Input
              value={effective.title}
              onChange={(event) => setOverride('title', event.target.value)}
              placeholder="z. B. Gepflegtes Einfamilienhaus mit Garten"
            />
          </Field>
          <Field label="Untertitel">
            <Input
              value={effective.subtitle}
              onChange={(event) => setOverride('subtitle', event.target.value)}
              placeholder="z. B. Reihenhaus in Berlin-Buckow"
            />
          </Field>
          <Field label="Ort">
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
      <EditorShell title="Objektbeschreibung" tag={<EditableTag />}>
        <Field
          label="Beschreibung"
          hint="Marketing-Text für dieses Exposé. Der KI-Text bleibt im Assistenten erhalten."
        >
          <Textarea
            value={effective.propertyDescription}
            onChange={(event) => setOverride('propertyDescription', event.target.value)}
            rows={7}
            placeholder="z. B. Helle Räume, offener Grundriss und ein gepflegter Garten…"
          />
        </Field>
      </EditorShell>
      <EditorShell title="Ausstattungsbeschreibung" tag={<EditableTag />}>
        <Field label="Beschreibung" hint="Marketing-Text für dieses Exposé.">
          <Textarea
            value={effective.equipmentDescription}
            onChange={(event) => setOverride('equipmentDescription', event.target.value)}
            rows={5}
            placeholder="z. B. Moderne Einbauküche, Terrasse mit Gartenzugang…"
          />
        </Field>
      </EditorShell>
      <EditorShell title="Lagebeschreibung" tag={<EditableTag />}>
        <Field
          label="Beschreibung"
          hint="Marketing-Text für dieses Exposé. Falls kein KI-Text existiert, können Sie hier einen eigenen formulieren."
        >
          <Textarea
            value={effective.locationDescription}
            onChange={(event) => setOverride('locationDescription', event.target.value)}
            rows={5}
            placeholder="z. B. Ruhige Wohngegend mit kurzen Wegen zu Geschäften…"
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
  const update = (next: string[]) => setOverride('highlights', next);
  return (
    <EditorShell title="Highlights" tag={<EditableTag />}>
      <p className="text-xs text-muted-foreground">
        {marketingFallback
          ? 'Die KI-Vorschläge werden hier bearbeitet. Ihre Änderungen überschreiben nur dieses Exposé.'
          : 'Noch keine Highlights vorhanden — fügen Sie eigene Stichpunkte hinzu.'}
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
              placeholder={`Highlight ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Highlight ${index + 1} entfernen`}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => update(highlights.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => update([...highlights, ''])}>
        <Plus className="size-4" /> Highlight hinzufügen
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
  const photos = photoImages(property.images);
  const selected = new Set(galleryImagesOf(property, configuration).map((image) => image.id));
  return (
    <div className="space-y-6">
      <EditorShell
        title="Titelfoto"
        tag={
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Auswahl für dieses Exposé
          </span>
        }
      >
        <p className="text-xs text-muted-foreground">
          Das Titelfoto erscheint auf der Titelseite. Es bleibt beim Wechsel der Vorlage
          unverändert.
        </p>
        {photos.length ? (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((image) => {
              const isCover = image.id === configuration.selectedCoverImageId;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setCoverImageId(image.id)}
                  aria-label={`${image.caption || image.fileName} als Titelfoto wählen`}
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
                    alt={image.caption || image.fileName || 'Foto'}
                    className="aspect-square w-full object-cover"
                  />
                  {isCover && (
                    <span className="absolute inset-x-0 bottom-0 bg-primary/90 py-0.5 text-center text-[10px] font-semibold text-primary-foreground">
                      Titelbild
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Keine Fotos vorhanden. Fotos bitte im Assistenten hochladen.
          </p>
        )}
      </EditorShell>
      <EditorShell
        title="Galerie"
        tag={
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Auswahl für dieses Exposé
          </span>
        }
      >
        <p className="text-xs text-muted-foreground">
          Wählen Sie, welche Fotos in der Galerie erscheinen. Das Titelfoto ist davon unabhängig
          und wird beim Vorlagenwechsel nicht verändert.
        </p>
        {photos.length ? (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((image) => {
              const included = selected.has(image.id);
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => toggleGalleryImage(image.id)}
                  aria-label={`${image.caption || image.fileName} ${included ? 'aus' : 'in'} der Galerie`}
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
                    alt={image.caption || image.fileName || 'Foto'}
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
            Keine Fotos vorhanden. Fotos bitte im Assistenten hochladen.
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
          ? 'Felder sind vorbelegt aus dem Agent-Profil (Ihre Angaben). Leere Felder verwenden weiterhin die Agent-Daten; Ihre Eingaben gelten nur für dieses Exposé.'
          : 'Keine Agent-Daten hinterlegt. Alle Angaben hier gelten nur für dieses Exposé.'}
      </p>
      <EditorShell title="Firmenname" tag={<EditableTag />}>
        <Field label="Firmenname" hint="Erscheint auf der Titelseite und im Kontaktbereich.">
          <Input
            value={branding.companyName ?? ''}
            onChange={(event) => setBranding('companyName', event.target.value)}
            placeholder={agentCompany || 'z. B. Muster Immobilien GmbH'}
          />
        </Field>
      </EditorShell>
      <EditorShell title="Logo" tag={<EditableTag />}>
        <Field
          label="Logo-URL"
          hint="Bitte eine direkte Bild-URL (https://…). Das Logo erscheint nur auf der Titelseite und im Kontaktbereich."
        >
          <Input
            value={branding.logoUrl ?? ''}
            onChange={(event) => setBranding('logoUrl', event.target.value)}
            placeholder={agent?.logo || 'https://…'}
          />
        </Field>
        {branding.logoUrl?.trim() && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] text-muted-foreground">Vorschau:</p>
            <img
              src={apiAssetUrl(branding.logoUrl)}
              alt="Logo-Vorschau"
              className="max-h-14 object-contain"
              onError={(event) => {
                (event.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
      </EditorShell>
      <EditorShell title="Kontakt" tag={<EditableTag />}>
        <div className="space-y-4">
          <Field label="Telefon">
            <Input
              value={branding.phone ?? ''}
              onChange={(event) => setBranding('phone', event.target.value)}
              placeholder={agent?.phone || '+49 …'}
            />
          </Field>
          <Field label="E-Mail">
            <Input
              type="email"
              value={branding.email ?? ''}
              onChange={(event) => setBranding('email', event.target.value)}
              placeholder={agent?.email || 'kontakt@…'}
            />
          </Field>
          <Field label="Website">
            <Input
              value={branding.website ?? ''}
              onChange={(event) => setBranding('website', event.target.value)}
              placeholder={agent?.website || 'https://…'}
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

export function FactsEditor({
  property,
  media,
}: {
  property: Property;
  media: ExposeMedia;
}) {
  const plans = floorplanImages(media.images);
  const features = equipmentFeatures(property);
  return (
    <div className="space-y-6">
      <EditorShell title="Faktenübersicht" tag={<ReadonlyTag />}>
        <FactList facts={summaryFacts(property)} sourceNote={READONLY_SOURCE_NOTE} />
      </EditorShell>
      <EditorShell title="Objektdaten" tag={<ReadonlyTag />}>
        <FactList facts={propertyFacts(property)} sourceNote={READONLY_SOURCE_NOTE} />
      </EditorShell>
      <EditorShell title="Energieangaben" tag={<ReadonlyTag />}>
        <FactList facts={energyFacts(property)} sourceNote={READONLY_SOURCE_NOTE} />
      </EditorShell>
      <EditorShell title="Ausstattungsmerkmale" tag={<ReadonlyTag />}>
        {features.length ? (
          <ul className="flex flex-wrap gap-2">
            {features.map((feature) => (
              <li
                key={feature}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
              >
                {feature}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Keine Ausstattungsmerkmale hinterlegt.</p>
        )}
      </EditorShell>
      <EditorShell title="Grundrisse" tag={<ReadonlyTag />}>
        {plans.length ? (
          <ul className="space-y-2">
            {plans.map((image) => (
              <li
                key={image.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <img
                  src={apiAssetUrl(image.url)}
                  alt={image.caption || image.fileName || 'Grundriss'}
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
            Keine Grundrisse vorhanden. Grundrisse bitte im Assistenten hochladen.
          </p>
        )}
      </EditorShell>
      <DocumentsEditor records={media.documents} />
    </div>
  );
}

const PUBLISHABLE_DOCUMENT_TYPES = ['grundriss', 'energieausweis'];

function DocumentsEditor({ records }: { records: ExposeMedia['documents'] }) {
  const documents = records.filter(
    (record) =>
      record.documentType && PUBLISHABLE_DOCUMENT_TYPES.includes(record.documentType),
  );
  return (
    <EditorShell
      title="Unterlagen"
      tag={
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Nur Präsentationsunterlagen
        </span>
      }
    >
      <p className="text-xs text-muted-foreground">
        Nur Grundrisse und Energieausweise erscheinen im Exposé. Vertrauliche Dokumente (z. B.
        Grundbuchauszug, Kaufvertrag) werden nicht angezeigt.
      </p>
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
                {document.documentType === 'grundriss' ? 'Grundriss' : 'Energieausweis'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Keine präsentationsfähigen Unterlagen vorhanden.
        </p>
      )}
    </EditorShell>
  );
}

/* ------------------------------------------------------------------ */
/* Kontakt                                                             */
/* ------------------------------------------------------------------ */

export function ContactEditor({ property }: { property: Property }) {
  const agent = property.exposeData?.agent;
  const address = agent?.address
    ? [
        [agent.address.street, agent.address.houseNumber].filter(Boolean).join(' '),
        [agent.address.postalCode, agent.address.city].filter(Boolean).join(' '),
      ].filter(Boolean)
    : [];
  return (
    <EditorShell title="Ansprechpartner" tag={<ReadonlyTag />}>
      <p className="text-xs text-muted-foreground">
        Kontaktdaten aus dem Agent-Profil. Änderungen bitte im Assistenten vornehmen — das
        Exposé-Branding können Sie unter „Markenauftritt“ anpassen.
      </p>
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
          Kein Ansprechpartner hinterlegt. Kontaktdaten bitte im Assistenten eingeben.
        </p>
      )}
    </EditorShell>
  );
}