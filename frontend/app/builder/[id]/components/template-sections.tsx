import type { DocumentRecord, FloorPlan3DRecord, Property, PropertyImage } from '../../../create/[id]/types';
import { apiAssetUrl, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import FloorPlan3DViewer from '@/components/floorplan-3d-viewer';
import {
  Baby,
  GraduationCap,
  Pill,
  ShoppingCart,
  Stethoscope,
  TrainFront,
  TreePine,
  UtensilsCrossed,
} from 'lucide-react';
import type {
  EffectiveBranding,
  ExposeConfiguration,
  ExposeFact,
  NearbyIcon,
} from '../expose-model';
import {
  energyFacts,
  floorplanImages,
  formatNearbyDistance,
  formatNearbyDuration,
  fullAddressLines,
  galleryImagesOf,
  locationLine,
  nearbyFacilityEntries,
  propertyFacts,
  structuredEquipment,
  summaryFacts,
  travelModeLabel,
} from '../expose-model';

/**
 * Section bodies shared by every Exposé template (Phase 11).
 *
 * The templates differ only in presentation: each template ships its own
 * stylesheet that restyles these `expose-*` classes, plus its own cover. The
 * section system (visibility, order), the facts, and the data flow stay
 * identical — a template never contains business logic and never edits
 * anything.
 *
 * Only one template renders at a time, so the shared class names are safe:
 * the active template's CSS is the only one present.
 */

export function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`expose-${id}`} className="expose-section">
      <header className="expose-section-header">
        <p className="expose-section-kicker">{kicker}</p>
        <h2 className="expose-section-title">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function FactGrid({ facts }: { facts: ExposeFact[] }) {
  if (!facts.length) return null;
  return (
    <div className="expose-fact-grid">
      {facts.map((fact) => (
        <div key={fact.label} className="expose-fact">
          <span className="expose-fact-label">{fact.label}</span>
          <span className="expose-fact-value">{fact.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Prose({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((item) => item.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;
  return (
    <div className={cn('expose-prose', className)}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

export function HighlightList({ highlights }: { highlights: string[] }) {
  const items = highlights.filter((item) => item.trim());
  if (!items.length) return null;
  return (
    <ul className="expose-highlights">
      {items.map((item) => (
        <li key={item} className="expose-highlight">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function EquipmentList({ property }: { property: Property }) {
  const items = structuredEquipment(property);
  if (!items.length) return null;
  return (
    <ul className="expose-equipment">
      {items.map((item) => (
        <li key={item} className="expose-equipment-item">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function EfficiencyScale({ value }: { value: string }) {
  const classes = ['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return (
    <div className="expose-energy-scale" aria-label={`Energieeffizienzklasse ${value}`}>
      {classes.map((item) => (
        <span
          key={item}
          className={cn(`eff-${item.replace('+', 'plus')}`, item === value && 'active')}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function FactsSection({ property }: { property: Property }) {
  return (
    <Section id="facts" kicker="OBJEKTDATEN" title="Fakten">
      <FactGrid facts={summaryFacts(property)} />
    </Section>
  );
}

export function HighlightsSection({ highlights }: { highlights: string[] }) {
  if (!highlights.some((item) => item.trim())) return null;
  return (
    <Section id="highlights" kicker="AUF EINEN BLICK" title="Highlights">
      <HighlightList highlights={highlights} />
    </Section>
  );
}

export function PropertySection({
  property,
  description,
}: {
  property: Property;
  description: string;
}) {
  const facts = propertyFacts(property);
  const hasDescription = description.trim().length > 0;
  if (!facts.length && !hasDescription) return null;
  return (
    <Section id="property" kicker="OBJEKTINFORMATIONEN" title="Objektbeschreibung">
      {facts.length > 0 && <FactGrid facts={facts} />}
      <Prose text={description} className={cn(facts.length > 0 && 'mt-7')} />
    </Section>
  );
}

export function EquipmentSection({
  property,
  description,
}: {
  property: Property;
  description: string;
}) {
  const items = structuredEquipment(property);
  const hasDescription = description.trim().length > 0;
  if (!items.length && !hasDescription) return null;
  return (
    <Section id="equipment" kicker="AUSSTATTUNG" title="Ausstattung">
      {items.length > 0 && <EquipmentList property={property} />}
      <Prose text={description} className={cn(items.length > 0 && 'mt-7')} />
    </Section>
  );
}

const NEARBY_ICONS: Record<NearbyIcon, typeof ShoppingCart> = {
  supermarket: ShoppingCart,
  kindergarten: Baby,
  school: GraduationCap,
  transport: TrainFront,
  pharmacy: Pill,
  healthcare: Stethoscope,
  park: TreePine,
  dining: UtensilsCrossed,
};

/**
 * Nearby-facility list of the Location section. Only facilities with a
 * verified route are rendered — every distance and travel time comes from
 * the routing provider. A missing category simply renders no row.
 */
export function NearbyFacilityList({ property }: { property: Property }) {
  const entries = nearbyFacilityEntries(property);
  if (!entries.length) return null;
  return (
    <ul className="expose-nearby">
      {entries.map((entry) => {
        const Icon = NEARBY_ICONS[entry.icon];
        return (
          <li key={`${entry.category}-${entry.place.id}`} className="expose-nearby-row">
            <span className="expose-nearby-icon">
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="expose-nearby-info">
              <span className="expose-nearby-name">{entry.place.name}</span>
              <span className="expose-nearby-meta">
                {entry.label} · {formatNearbyDistance(entry.distanceMeters)} ·{' '}
                {formatNearbyDuration(entry.durationSeconds)} {travelModeLabel(entry.travelMode)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function LocationSection({
  property,
  description,
}: {
  property: Property;
  description: string;
}) {
  const address = fullAddressLines(property);
  const intelligence = property.exposeData?.location.intelligence;
  const mapUrl = intelligence?.mapAsset?.url;
  const hasDescription = description.trim().length > 0;
  const hasMap = Boolean(mapUrl);
  const hasNearby = nearbyFacilityEntries(property).length > 0;
  const summary = intelligence?.summary?.trim();
  if (
    !address.length &&
    !locationLine(property) &&
    !hasDescription &&
    !hasMap &&
    !hasNearby
  )
    return null;
  return (
    <Section id="location" kicker="LAGE & UMWELT" title="Lage">
      {address.length > 0 && <p className="expose-location-address">{address.join(' · ')}</p>}
      {(hasMap || hasNearby) && (
        <div className="expose-location-layout">
          {hasMap && (
            <figure className="expose-location-map">
              <img
                src={apiAssetUrl(mapUrl as string)}
                alt={intelligence?.mapAsset?.caption || 'Lage und Umgebung'}
              />
            </figure>
          )}
          <div className="expose-location-side">
            {summary && <p className="expose-location-summary">{summary}</p>}
            {hasNearby && <NearbyFacilityList property={property} />}
          </div>
        </div>
      )}
      <Prose text={description} className={cn((hasMap || hasNearby) && 'mt-7')} />
    </Section>
  );
}

export function EnergySection({ property }: { property: Property }) {
  const facts = energyFacts(property);
  const efficiencyClass = property.exposeData?.energy?.efficiencyClass;
  if (!facts.length) return null;
  return (
    <Section id="energy" kicker="ENERGIE" title="Energie">
      <FactGrid facts={facts} />
      {efficiencyClass && (
        <div className="mt-6">
          <EfficiencyScale value={efficiencyClass} />
        </div>
      )}
    </Section>
  );
}

export function GallerySection({
  property,
  expose,
}: {
  property: Property;
  expose: ExposeConfiguration;
}) {
  const images = galleryImagesOf(property, expose).filter(
    (image) => image.id !== expose.selectedCoverImageId,
  );
  if (!images.length) return null;
  return (
    <Section id="gallery" kicker="FOTOS" title="Galerie">
      <div className="expose-gallery">
        {images.map((image) => (
          <figure key={image.id} className="expose-gallery-figure">
            <img
              src={apiAssetUrl(image.url)}
              alt={image.caption || image.fileName || 'Objektfoto'}
            />
            {image.caption && (
              <figcaption className="expose-figure-caption">{image.caption}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </Section>
  );
}

/**
 * Floor plan section of the Exposé. Prefers the generated interactive 3D
 * floor plan when one is completed; otherwise renders the original 2D floor
 * plan images. While generation is pending (and not in static/print mode) a
 * small hint is shown above the 2D plan and the status is polled so the 3D
 * model appears as soon as it is ready. The static PDF render never shows the
 * WebGL viewer and always keeps the 2D plan.
 */
export function FloorplanSection({
  property,
  images,
  staticRender,
}: {
  property: Property;
  images: PropertyImage[];
  staticRender?: boolean;
}) {
  const plans = floorplanImages(images);
  const [record, setRecord] = useState<FloorPlan3DRecord | null>(property.floorPlan3D ?? null);

  useEffect(() => {
    setRecord(property.floorPlan3D ?? null);
  }, [property.floorPlan3D]);

  useEffect(() => {
    if (staticRender || record?.status !== 'pending') return;
    const timer = setInterval(async () => {
      try {
        const response = await apiFetch(`/api/properties/${property.id}/floorplan3d`);
        if (!response.ok) return;
        const next = (await response.json()) as FloorPlan3DRecord | null;
        setRecord(next);
      } catch {
        // Polling is best-effort; the 2D plan stays the fallback.
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [staticRender, record?.status, property.id]);

  if (!plans.length) return null;

  const model = record?.status === 'completed' && record.model ? record.model : null;
  const interactive = !staticRender;

  return (
    <Section id="floorplans" kicker="GRUNDRISSE" title="Grundrisse">
      <div className="expose-floorplans">
        {model && interactive ? (
          <figure className="expose-floorplan-figure">
            <FloorPlan3DViewer model={model} />
            <figcaption className="expose-figure-caption">3D-Grundriss</figcaption>
          </figure>
        ) : (
          plans.map((image) => (
            <figure key={image.id} className="expose-floorplan-figure">
              <img
                src={apiAssetUrl(image.url)}
                alt={image.caption || image.fileName || 'Grundriss'}
              />
              {image.caption && (
                <figcaption className="expose-figure-caption">{image.caption}</figcaption>
              )}
            </figure>
          ))
        )}
      </div>
      {interactive && record?.status === 'pending' && (
        <p className="expose-floorplan-pending">3D-Grundriss wird erstellt…</p>
      )}
    </Section>
  );
}

const nonEmpty = (value?: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const PUBLISHABLE_DOCUMENT_TYPES = ['grundriss', 'energieausweis'];

export function DocumentsSection({ records }: { records: DocumentRecord[] }) {
  const documents = records.filter(
    (record) => record.documentType && PUBLISHABLE_DOCUMENT_TYPES.includes(record.documentType),
  );
  if (!documents.length) return null;
  return (
    <Section id="documents" kicker="UNTERLAGEN" title="Unterlagen">
      <ul className="expose-documents">
        {documents.map((document) => (
          <li key={document.id} className="expose-document-row">
            <a
              href={apiAssetUrl(document.url)}
              target="_blank"
              rel="noreferrer"
              className="expose-document-name"
            >
              {document.filename}
            </a>
            <span className="expose-document-type">
              {document.documentType === 'grundriss' ? 'Grundriss' : 'Energieausweis'}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Contact section shared by all templates. The Exposé branding wins over the
 * Agent profile for company name and contact channels; the agent name and
 * address always come from the Agent profile. Nothing is rendered when no
 * agent information and no explicit Exposé branding exist — the system
 * branding fallback alone never invents a contact.
 */
export function ContactSection({
  property,
  expose,
  branding,
}: {
  property: Property;
  expose: ExposeConfiguration;
  branding: EffectiveBranding;
}) {
  const agent = property.exposeData?.agent;
  const explicit = expose.branding;
  const hasExplicitBranding = Boolean(
    explicit &&
      (nonEmpty(explicit.companyName) ||
        nonEmpty(explicit.phone) ||
        nonEmpty(explicit.email) ||
        nonEmpty(explicit.website)),
  );
  if (!agent?.name && !agent?.company && !hasExplicitBranding) return null;
  const address = agent?.address
    ? [
        [agent.address.street, agent.address.houseNumber].filter(Boolean).join(' '),
        [agent.address.postalCode, agent.address.city].filter(Boolean).join(' '),
      ].filter(Boolean)
    : [];
  const channels = [
    branding.phone ? { label: 'Telefon', value: branding.phone } : null,
    branding.email ? { label: 'E-Mail', value: branding.email } : null,
    branding.website ? { label: 'Web', value: branding.website } : null,
  ].filter((channel): channel is { label: string; value: string } => channel !== null);
  return (
    <Section id="contact" kicker="KONTAKT" title="Ihr Ansprechpartner">
      <div className="expose-contact">
        {branding.logoUrl && (
          <img
            src={apiAssetUrl(branding.logoUrl)}
            alt={`${branding.companyName || 'Firmenlogo'}`}
            className="expose-contact-logo"
          />
        )}
        {agent?.name && <h3 className="expose-contact-name">{agent.name}</h3>}
        {branding.companyName && <p className="expose-contact-company">{branding.companyName}</p>}
        {address.length > 0 && <p className="expose-contact-address">{address.join(', ')}</p>}
        {channels.length > 0 && (
          <div className="expose-contact-channels">
            {channels.map((channel) => (
              <div key={channel.label} className="expose-contact-channel">
                <span className="expose-contact-channel-label">{channel.label}</span>
                <span className="expose-contact-channel-value">{channel.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}