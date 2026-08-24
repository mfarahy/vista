import type {
  DocumentRecord,
  FloorPlan3DRecord,
  Property,
  PropertyImage,
} from '../../../create/[id]/types';
import type { BrokerProfile } from '../../../create/[id]/types';
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
import type { Translator } from '@/lib/i18n/core';
import type {
  EffectiveBranding,
  ExposeConfiguration,
  ExposeFact,
  NearbyIcon,
} from '../expose-model';
import {
  brokerAddressLines,
  brokerChannels,
  effectiveBrokerProfile,
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

export function FactGrid({ facts, tr }: { facts: ExposeFact[]; tr: Translator }) {
  if (!facts.length) return null;
  return (
    <div className="expose-fact-grid">
      {facts.map((fact) => (
        <div key={fact.label} className="expose-fact">
          <span className="expose-fact-label">{tr.t(fact.label)}</span>
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

export function EquipmentList({ property, tr }: { property: Property; tr: Translator }) {
  const items = structuredEquipment(property);
  if (!items.length) return null;
  return (
    <ul className="expose-equipment">
      {items.map((item) => (
        <li key={item} className="expose-equipment-item">
          {/* Structured features are translation keys; free-form user text
              passes through because unknown keys fall back to the key itself. */}
          {tr.t(item)}
        </li>
      ))}
    </ul>
  );
}

export function EfficiencyScale({ value, tr }: { value: string; tr: Translator }) {
  const classes = ['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return (
    <div
      className="expose-energy-scale"
      aria-label={tr.t('expose.efficiencyScaleLabel', { value })}
    >
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

export function FactsSection({ property, tr }: { property: Property; tr: Translator }) {
  return (
    <Section
      id="facts"
      kicker={tr.t('expose.kickers.facts')}
      title={tr.t('expose.facts.factsTitle')}
    >
      <FactGrid facts={summaryFacts(property, tr)} tr={tr} />
    </Section>
  );
}

export function HighlightsSection({ highlights, tr }: { highlights: string[]; tr: Translator }) {
  if (!highlights.some((item) => item.trim())) return null;
  return (
    <Section
      id="highlights"
      kicker={tr.t('expose.kickers.highlights')}
      title={tr.t('expose.sectionLabels.highlights')}
    >
      <HighlightList highlights={highlights} />
    </Section>
  );
}

export function PropertySection({
  property,
  description,
  tr,
}: {
  property: Property;
  description: string;
  tr: Translator;
}) {
  const facts = propertyFacts(property, tr);
  const hasDescription = description.trim().length > 0;
  if (!facts.length && !hasDescription) return null;
  return (
    <Section
      id="property"
      kicker={tr.t('expose.kickers.property')}
      title={tr.t('expose.propertyTitle')}
    >
      {facts.length > 0 && <FactGrid facts={facts} tr={tr} />}
      <Prose text={description} className={cn(facts.length > 0 && 'mt-7')} />
    </Section>
  );
}

export function EquipmentSection({
  property,
  description,
  tr,
}: {
  property: Property;
  description: string;
  tr: Translator;
}) {
  const items = structuredEquipment(property);
  const hasDescription = description.trim().length > 0;
  if (!items.length && !hasDescription) return null;
  return (
    <Section
      id="equipment"
      kicker={tr.t('expose.kickers.equipment')}
      title={tr.t('expose.equipmentTitle')}
    >
      {items.length > 0 && <EquipmentList property={property} tr={tr} />}
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
export function NearbyFacilityList({ property, tr }: { property: Property; tr: Translator }) {
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
                {tr.t(entry.label)} · {formatNearbyDistance(entry.distanceMeters, tr.locale)} ·{' '}
                {formatNearbyDuration(entry.durationSeconds, tr.locale)}{' '}
                {tr.t(travelModeLabel(entry.travelMode))}
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
  tr,
}: {
  property: Property;
  description: string;
  tr: Translator;
}) {
  const address = fullAddressLines(property);
  const intelligence = property.exposeData?.location.intelligence;
  const mapUrl = intelligence?.mapAsset?.url;
  const hasDescription = description.trim().length > 0;
  const hasMap = Boolean(mapUrl);
  const hasNearby = nearbyFacilityEntries(property).length > 0;
  const summary = intelligence?.summary?.trim();
  if (!address.length && !locationLine(property) && !hasDescription && !hasMap && !hasNearby)
    return null;
  return (
    <Section
      id="location"
      kicker={tr.t('expose.kickers.location')}
      title={tr.t('expose.locationTitle')}
    >
      {address.length > 0 && <p className="expose-location-address">{address.join(' · ')}</p>}
      {(hasMap || hasNearby) && (
        <div className="expose-location-layout">
          {hasMap && (
            <figure className="expose-location-map">
              <img
                src={apiAssetUrl(mapUrl as string)}
                alt={intelligence?.mapAsset?.caption || tr.t('expose.altFallbacks.locationMap')}
              />
            </figure>
          )}
          <div className="expose-location-side">
            {summary && <p className="expose-location-summary">{summary}</p>}
            {hasNearby && <NearbyFacilityList property={property} tr={tr} />}
          </div>
        </div>
      )}
      <Prose text={description} className={cn((hasMap || hasNearby) && 'mt-7')} />
    </Section>
  );
}

export function EnergySection({ property, tr }: { property: Property; tr: Translator }) {
  const facts = energyFacts(property, tr);
  const efficiencyClass = property.exposeData?.energy?.efficiencyClass;
  if (!facts.length) return null;
  return (
    <Section id="energy" kicker={tr.t('expose.kickers.energy')} title={tr.t('expose.energyTitle')}>
      <FactGrid facts={facts} tr={tr} />
      {efficiencyClass && (
        <div className="mt-6">
          <EfficiencyScale value={efficiencyClass} tr={tr} />
        </div>
      )}
    </Section>
  );
}

export function GallerySection({
  property,
  expose,
  tr,
}: {
  property: Property;
  expose: ExposeConfiguration;
  tr: Translator;
}) {
  const images = galleryImagesOf(property, expose).filter(
    (image) => image.id !== expose.selectedCoverImageId,
  );
  if (!images.length) return null;
  return (
    <Section
      id="gallery"
      kicker={tr.t('expose.kickers.gallery')}
      title={tr.t('expose.galleryTitle')}
    >
      <div className="expose-gallery">
        {images.map((image) => (
          <figure key={image.id} className="expose-gallery-figure">
            <img
              src={apiAssetUrl(image.url)}
              alt={image.caption || image.fileName || tr.t('expose.altFallbacks.propertyPhoto')}
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
  tr,
}: {
  property: Property;
  images: PropertyImage[];
  staticRender?: boolean;
  tr: Translator;
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
    <Section
      id="floorplans"
      kicker={tr.t('expose.kickers.floorplans')}
      title={tr.t('expose.floorplansTitle')}
    >
      <div className="expose-floorplans">
        {model && interactive ? (
          <figure className="expose-floorplan-figure">
            <FloorPlan3DViewer model={model} />
            <figcaption className="expose-figure-caption">
              {tr.t('expose.floorplan3dCaption')}
            </figcaption>
          </figure>
        ) : (
          plans.map((image) => (
            <figure key={image.id} className="expose-floorplan-figure">
              <img
                src={apiAssetUrl(image.url)}
                alt={image.caption || image.fileName || tr.t('expose.altFallbacks.floorPlan')}
              />
              {image.caption && (
                <figcaption className="expose-figure-caption">{image.caption}</figcaption>
              )}
            </figure>
          ))
        )}
      </div>
      {interactive && record?.status === 'pending' && (
        <p className="expose-floorplan-pending">{tr.t('expose.floorplan3dPending')}</p>
      )}
    </Section>
  );
}

const nonEmpty = (value?: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const PUBLISHABLE_DOCUMENT_TYPES = ['grundriss', 'energieausweis'];

export function DocumentsSection({ records, tr }: { records: DocumentRecord[]; tr: Translator }) {
  const documents = records.filter(
    (record) => record.documentType && PUBLISHABLE_DOCUMENT_TYPES.includes(record.documentType),
  );
  if (!documents.length) return null;
  return (
    <Section
      id="documents"
      kicker={tr.t('expose.kickers.documents')}
      title={tr.t('expose.documentsTitle')}
    >
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
              {tr.t(
                document.documentType === 'grundriss'
                  ? 'documentType.grundriss'
                  : 'documentType.energieausweis',
              )}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Contact section shared by all templates. The Exposé branding wins over the
 * Broker Profile for company name and contact channels; the broker name and
 * address always come from the Broker Profile (legacy per-property agent data
 * is used as the backward-compatible fallback). Nothing is rendered when no
 * broker information and no explicit Exposé branding exist — the system
 * branding fallback alone never invents a contact.
 */
export function ContactSection({
  property,
  expose,
  branding,
  brokerProfile,
  tr,
}: {
  property: Property;
  expose: ExposeConfiguration;
  branding: EffectiveBranding;
  brokerProfile?: BrokerProfile | null;
  tr: Translator;
}) {
  const broker = effectiveBrokerProfile(property, brokerProfile);
  const explicit = expose.branding;
  const hasExplicitBranding = Boolean(
    explicit &&
    (nonEmpty(explicit.companyName) ||
      nonEmpty(explicit.phone) ||
      nonEmpty(explicit.email) ||
      nonEmpty(explicit.website)),
  );
  if (!broker?.name && !broker?.company && !hasExplicitBranding) return null;
  const address = brokerAddressLines(broker);
  const channels = [
    branding.phone ? { label: tr.t('expose.contactChannels.phone'), value: branding.phone } : null,
    branding.email ? { label: tr.t('expose.contactChannels.email'), value: branding.email } : null,
    branding.website
      ? { label: tr.t('expose.contactChannels.web'), value: branding.website }
      : null,
  ].filter((channel): channel is { label: string; value: string } => channel !== null);
  return (
    <Section
      id="contact"
      kicker={tr.t('expose.kickers.contact')}
      title={tr.t('expose.contactTitle')}
    >
      <div className="expose-contact">
        {branding.logoUrl && (
          <img
            src={apiAssetUrl(branding.logoUrl)}
            alt={branding.companyName || tr.t('expose.altFallbacks.logo')}
            className="expose-contact-logo"
          />
        )}
        {broker?.name && <h3 className="expose-contact-name">{broker.name}</h3>}
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

/**
 * Dedicated broker/agency page of the Exposé (inspired by classic professional
 * real-estate broker presentations). Reads the configured Broker Profile —
 * the single source of truth — and falls back to the property's legacy agent
 * data so existing Exposés keep working. Every block is optional: photo,
 * logo, channels, address, about text, awards, recommendations, additional
 * images, and links are only rendered when the profile actually has values.
 */
export function BrokerPageSection({
  property,
  brokerProfile,
  tr,
}: {
  property: Property;
  brokerProfile?: BrokerProfile | null;
  tr: Translator;
}) {
  const broker = effectiveBrokerProfile(property, brokerProfile);
  if (!broker) return null;
  const hasIdentity = Boolean(broker.name || broker.company || broker.jobTitle || broker.tagline);
  const hasContact = Boolean(
    broker.photo ||
      broker.logo ||
      brokerAddressLines(broker).length ||
      brokerChannels(broker, tr).length,
  );
  const hasBody = Boolean(
    broker.description ||
      (broker.awards ?? []).some((award) => award.trim()) ||
      broker.recommendations ||
      broker.recommendationUrl ||
      (broker.additionalImages ?? []).length,
  );
  if (!hasIdentity && !hasContact && !hasBody) return null;

  const channels = brokerChannels(broker, tr);
  const address = brokerAddressLines(broker);
  const awards = (broker.awards ?? []).filter((award) => award.trim());
  const images = (broker.additionalImages ?? []).filter((url) => url.trim());
  const links = (broker.externalLinks ?? []).filter((link) => link.label.trim() && link.url.trim());

  return (
    <Section
      id="broker"
      kicker={tr.t('expose.kickers.broker')}
      title={tr.t('expose.broker.title')}
    >
      <div className="expose-broker">
        {(broker.photo || hasIdentity) && (
          <div className="expose-broker-head">
            {broker.photo && (
              <img
                src={apiAssetUrl(broker.photo)}
                alt={
                  broker.name
                    ? tr.t('expose.broker.photoAlt', { name: broker.name })
                    : tr.t('expose.broker.noPhotoAlt')
                }
                className="expose-broker-photo"
              />
            )}
            <div className="expose-broker-id">
              {broker.name && <h3 className="expose-broker-name">{broker.name}</h3>}
              {broker.jobTitle && <p className="expose-broker-role">{broker.jobTitle}</p>}
              {broker.company && <p className="expose-broker-company">{broker.company}</p>}
              {broker.tagline && <p className="expose-broker-tagline">{broker.tagline}</p>}
            </div>
            {broker.logo && (
              <img
                src={apiAssetUrl(broker.logo)}
                alt={
                  broker.company
                    ? tr.t('expose.broker.logoAlt', { company: broker.company })
                    : tr.t('expose.altFallbacks.logo')
                }
                className="expose-broker-logo"
              />
            )}
          </div>
        )}

        {channels.length > 0 && (
          <div className="expose-broker-channels">
            {channels.map((channel) => (
              <div key={channel.type} className="expose-broker-channel">
                <span className="expose-broker-channel-label">{channel.label}</span>
                <span className="expose-broker-channel-value">{channel.value}</span>
              </div>
            ))}
          </div>
        )}

        {address.length > 0 && (
          <p className="expose-broker-address">{address.join(' · ')}</p>
        )}

        {broker.description && (
          <div className="expose-broker-block">
            <h4 className="expose-broker-heading">{tr.t('expose.broker.aboutTitle')}</h4>
            <Prose text={broker.description} />
          </div>
        )}

        {(awards.length > 0 || broker.recommendations || broker.recommendationUrl) && (
          <div className="expose-broker-block">
            <h4 className="expose-broker-heading">
              {tr.t('expose.broker.credentialsTitle')}
            </h4>
            {awards.length > 0 && (
              <div className="expose-broker-credentials">
                <h5 className="expose-broker-subheading">
                  {tr.t('expose.broker.awardsTitle')}
                </h5>
                <ul className="expose-broker-awards">
                  {awards.map((award, index) => (
                    <li key={index} className="expose-broker-award">
                      {award}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(broker.recommendations || broker.recommendationUrl) && (
              <div className="expose-broker-credentials">
                <h5 className="expose-broker-subheading">
                  {tr.t('expose.broker.recommendationsTitle')}
                </h5>
                {broker.recommendations && (
                  <p className="expose-broker-recommendation">{broker.recommendations}</p>
                )}
                {broker.recommendationUrl && (
                  <p className="expose-broker-recommendation-link">
                    <a href={broker.recommendationUrl} target="_blank" rel="noreferrer">
                      {tr.t('expose.broker.recommendationLink')}
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {images.length > 0 && (
          <div className="expose-broker-block">
            <h4 className="expose-broker-heading">{tr.t('brokerProfile.sectionBranding')}</h4>
            <div className="expose-broker-images">
              {images.map((url, index) => (
                <img
                  key={`${url}-${index}`}
                  src={apiAssetUrl(url)}
                  alt={tr.t('expose.altFallbacks.logo')}
                  className="expose-broker-image"
                />
              ))}
            </div>
          </div>
        )}

        {links.length > 0 && (
          <div className="expose-broker-block">
            <h4 className="expose-broker-heading">{tr.t('expose.broker.linksTitle')}</h4>
            <ul className="expose-broker-links">
              {links.map((link, index) => (
                <li key={`${link.url}-${index}`}>
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
