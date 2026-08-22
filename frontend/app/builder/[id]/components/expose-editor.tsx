'use client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MarketingContent, Property } from '../../../create/[id]/types';
import { Field } from '../../../create/[id]/components/ui';
import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
  ExposeContentOverrides,
  ExposeSection,
} from '../expose-model';
import {
  energyFacts,
  equipmentFeatures,
  floorplanImages,
  fullAddressLines,
  galleryImagesOf,
  locationLine,
  photoImages,
  propertyFacts,
  summaryFacts,
} from '../expose-model';
import type { ExposeMedia } from './modern-expose-template';

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

export function ExposeEditor({
  section,
  property,
  marketingContent,
  effective,
  configuration,
  media,
  setOverride,
  setCoverImageId,
  toggleGalleryImage,
}: {
  section: ExposeSection;
  property: Property;
  marketingContent: MarketingContent | null;
  effective: EffectiveMarketingContent;
  configuration: ExposeConfiguration;
  media: ExposeMedia;
  setOverride: (key: keyof ExposeContentOverrides, value: string | string[]) => void;
  setCoverImageId: (id: string) => void;
  toggleGalleryImage: (id: string) => void;
}) {
  switch (section.type) {
    case 'cover':
      return (
        <CoverEditor
          property={property}
          configuration={configuration}
          effective={effective}
          setOverride={setOverride}
          setCoverImageId={setCoverImageId}
        />
      );
    case 'highlights':
      return (
        <HighlightsEditor
          highlights={effective.highlights}
          setOverride={setOverride}
          marketingFallback={marketingContent?.highlights.value.length ? true : false}
        />
      );
    case 'property':
      return (
        <PropertyEditor
          property={property}
          description={effective.propertyDescription}
          setOverride={setOverride}
        />
      );
    case 'equipment':
      return (
        <EquipmentEditor
          property={property}
          description={effective.equipmentDescription}
          setOverride={setOverride}
        />
      );
    case 'location':
      return (
        <LocationEditor
          property={property}
          description={effective.locationDescription}
          setOverride={setOverride}
        />
      );
    case 'facts':
      return (
        <EditorShell title="Faktenübersicht" tag={<ReadonlyTag />}>
          <FactList facts={summaryFacts(property)} sourceNote="Aus Ihren Objektdaten. Änderungen bitte im Assistenten vornehmen." />
        </EditorShell>
      );
    case 'energy':
      return (
        <EditorShell title="Energieangaben" tag={<ReadonlyTag />}>
          <FactList facts={energyFacts(property)} sourceNote="Aus Ihren Objektdaten. Änderungen bitte im Assistenten vornehmen." />
        </EditorShell>
      );
    case 'gallery':
      return (
        <GalleryEditor
          property={property}
          configuration={configuration}
          toggleGalleryImage={toggleGalleryImage}
        />
      );
    case 'floorplans':
      return <FloorplanEditor images={floorplanImages(media.images)} />;
    case 'documents':
      return <DocumentsEditor records={media.documents} />;
    case 'contact':
      return <ContactEditor property={property} />;
    default:
      return null;
  }
}

function CoverEditor({
  property,
  configuration,
  effective,
  setOverride,
  setCoverImageId,
}: {
  property: Property;
  configuration: ExposeConfiguration;
  effective: EffectiveMarketingContent;
  setOverride: (key: keyof ExposeContentOverrides, value: string | string[]) => void;
  setCoverImageId: (id: string) => void;
}) {
  const photos = photoImages(property.images);
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Titelfoto</p>
          <span className="text-[11px] text-muted-foreground">
            {photos.length} Fotos verfügbar
          </span>
        </div>
        {photos.length ? (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((image) => {
              const selected = image.id === configuration.selectedCoverImageId;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setCoverImageId(image.id)}
                  aria-label={`${image.caption || image.fileName} als Titelfoto wählen`}
                  aria-pressed={selected}
                  className={cn(
                    'relative overflow-hidden rounded-lg border-2 transition-colors',
                    selected
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent hover:border-border',
                  )}
                >
                  <img
                    src={apiAssetUrl(image.url)}
                    alt={image.caption || image.fileName || 'Foto'}
                    className="aspect-square w-full object-cover"
                  />
                  {selected && (
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
      </div>
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
            <Input value={locationLine(property)} readOnly className="bg-muted/40 text-muted-foreground" />
          </Field>
        </div>
      </EditorShell>
    </div>
  );
}

function PropertyEditor({
  property,
  description,
  setOverride,
}: {
  property: Property;
  description: string;
  setOverride: (key: keyof ExposeContentOverrides, value: string | string[]) => void;
}) {
  return (
    <div className="space-y-5">
      <EditorShell title="Objektdaten" tag={<ReadonlyTag />}>
        <FactList
          facts={propertyFacts(property)}
          sourceNote="Aus Ihren Objektdaten. Änderungen bitte im Assistenten vornehmen."
        />
      </EditorShell>
      <EditorShell title="Objektbeschreibung" tag={<EditableTag />}>
        <Field
          label="Beschreibung"
          hint="Marketing-Text für dieses Exposé. Der KI-Text bleibt im Assistenten erhalten."
        >
          <Textarea
            value={description}
            onChange={(event) => setOverride('propertyDescription', event.target.value)}
            rows={7}
            placeholder="z. B. Helle Räume, offener Grundriss und ein gepflegter Garten…"
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

function EquipmentEditor({
  property,
  description,
  setOverride,
}: {
  property: Property;
  description: string;
  setOverride: (key: keyof ExposeContentOverrides, value: string | string[]) => void;
}) {
  const features = equipmentFeatures(property);
  return (
    <div className="space-y-5">
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
      <EditorShell title="Ausstattungsbeschreibung" tag={<EditableTag />}>
        <Field label="Beschreibung" hint="Marketing-Text für dieses Exposé.">
          <Textarea
            value={description}
            onChange={(event) => setOverride('equipmentDescription', event.target.value)}
            rows={5}
            placeholder="z. B. Moderne Einbauküche, Terrasse mit Gartenzugang…"
          />
        </Field>
      </EditorShell>
    </div>
  );
}

function LocationEditor({
  property,
  description,
  setOverride,
}: {
  property: Property;
  description: string;
  setOverride: (key: keyof ExposeContentOverrides, value: string | string[]) => void;
}) {
  const address = fullAddressLines(property);
  const meaningful = address.length > 0 || locationLine(property);
  return (
    <div className="space-y-5">
      <EditorShell title="Adresse" tag={<ReadonlyTag />}>
        {meaningful ? (
          <p className="text-sm text-foreground">{address.join(' · ') || locationLine(property)}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Keine Adresse hinterlegt.</p>
        )}
      </EditorShell>
      <EditorShell title="Lagebeschreibung" tag={<EditableTag />}>
        <Field
          label="Beschreibung"
          hint="Marketing-Text für dieses Exposé. Falls kein KI-Text existiert, können Sie hier einen eigenen formulieren."
        >
          <Textarea
            value={description}
            onChange={(event) => setOverride('locationDescription', event.target.value)}
            rows={5}
            placeholder="z. B. Ruhige Wohngegend mit kurzen Wegen zu Geschäften…"
          />
        </Field>
      </EditorShell>
    </div>
  );
}

function GalleryEditor({
  property,
  configuration,
  toggleGalleryImage,
}: {
  property: Property;
  configuration: ExposeConfiguration;
  toggleGalleryImage: (id: string) => void;
}) {
  const photos = photoImages(property.images);
  const selected = new Set(galleryImagesOf(property, configuration).map((image) => image.id));
  return (
    <EditorShell
      title="Galerie"
      tag={
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Auswahl für dieses Exposé
        </span>
      }
    >
      <p className="text-xs text-muted-foreground">
        Wählen Sie, welche Fotos in der Galerie erscheinen. Das Titelfoto ist davon unabhängig.
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
  );
}

function FloorplanEditor({ images }: { images: Array<{ id: string; url: string; fileName: string; caption?: string | null }> }) {
  return (
    <EditorShell title="Grundrisse" tag={<ReadonlyTag />}>
      {images.length ? (
        <ul className="space-y-2">
          {images.map((image) => (
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

function ContactEditor({ property }: { property: Property }) {
  const agent = property.exposeData?.agent;
  const address = agent?.address
    ? [
        [agent.address.street, agent.address.houseNumber].filter(Boolean).join(' '),
        [agent.address.postalCode, agent.address.city].filter(Boolean).join(' '),
      ].filter(Boolean)
    : [];
  return (
    <EditorShell title="Ansprechpartner" tag={<ReadonlyTag />}>
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