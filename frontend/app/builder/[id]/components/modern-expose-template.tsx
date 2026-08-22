import type { DocumentRecord, Property, PropertyImage } from '../../../create/[id]/types';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
  ExposeFact,
  ExposeSection,
} from '../expose-model';
import {
  coverFacts,
  coverImageOf,
  energyFacts,
  floorplanImages,
  fullAddressLines,
  galleryImagesOf,
  locationLine,
  priceFacts,
  propertyFacts,
  structuredEquipment,
  summaryFacts,
  visibleSections,
} from '../expose-model';
import { EXPOSE_CSS } from '../../../expose/expose-css';

/**
 * The single MVP template ("modern"). Pure presentation: it receives already
 * prepared data (property, effective marketing content, expose configuration,
 * media) and renders a professional German real-estate Exposé. It contains no
 * business logic and never edits anything.
 *
 * The document stylesheet (EXPOSE_CSS) travels with the template so the
 * Builder live preview, the review preview, and the PDF print route render
 * exactly the same document. Only pagination differs via the print CSS.
 */

export type ExposeMedia = {
  images: PropertyImage[];
  documents: DocumentRecord[];
};

export function ModernExposeTemplate({
  property,
  marketingContent,
  expose,
  media,
}: {
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
}) {
  const sections = visibleSections(expose);
  return (
    <>
      <style>{EXPOSE_CSS}</style>
      <article className="expose-doc mx-auto w-full max-w-[794px] bg-white text-[#26302a] shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
        {sections.map((section) => (
          <TemplateSection
            key={section.id}
            section={section}
            property={property}
            marketingContent={marketingContent}
            expose={expose}
            media={media}
          />
        ))}
        <footer className="expose-footer">
          VISTA · Immobilien-Exposé · {new Date().toLocaleDateString('de-DE')}
        </footer>
      </article>
    </>
  );
}

function TemplateSection({
  section,
  property,
  marketingContent,
  expose,
  media,
}: {
  section: ExposeSection;
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
}) {
  switch (section.type) {
    case 'cover':
      return (
        <CoverSection
          property={property}
          content={marketingContent}
          expose={expose}
          media={media}
        />
      );
    case 'facts':
      return (
        <FactsSection
          id="facts"
          kicker="OBJEKTDATEN"
          title="Fakten"
          facts={summaryFacts(property)}
        />
      );
    case 'highlights':
      return <HighlightsSection highlights={marketingContent.highlights} />;
    case 'property':
      return (
        <PropertySection property={property} description={marketingContent.propertyDescription} />
      );
    case 'equipment':
      return (
        <EquipmentSection property={property} description={marketingContent.equipmentDescription} />
      );
    case 'location':
      return (
        <LocationSection property={property} description={marketingContent.locationDescription} />
      );
    case 'energy':
      return <EnergySection property={property} />;
    case 'gallery':
      return <GallerySection property={property} expose={expose} />;
    case 'floorplans':
      return <FloorplanSection images={floorplanImages(media.images)} />;
    case 'documents':
      return <DocumentsSection records={media.documents} />;
    case 'contact':
      return <ContactSection property={property} />;
    default:
      return null;
  }
}

function Section({
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

function FactGrid({ facts }: { facts: ExposeFact[] }) {
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

function Prose({ text, className }: { text: string; className?: string }) {
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

function CoverSection({
  property,
  content,
  expose,
  media,
}: {
  property: Property;
  content: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
}) {
  const hero = coverImageOf(property, expose) ?? media.images[0];
  const price = priceFacts(property);
  const facts = coverFacts(property);

  return (
    <section id="expose-cover" className="expose-cover">
      <div className={cn('expose-cover-hero', !hero && 'expose-cover-hero-empty')}>
        {hero ? (
          <>
            <img
              src={apiAssetUrl(hero.url)}
              alt={hero.caption || hero.fileName || 'Titelfoto'}
            />
            <span className="expose-cover-brand">VISTA</span>
          </>
        ) : (
          'Kein Titelfoto vorhanden'
        )}
      </div>
      <div className="expose-cover-copy">
        <p className="expose-kicker">Immobilien-Exposé</p>
        {content.title && <h1 className="expose-cover-title">{content.title}</h1>}
        {content.subtitle && <p className="expose-cover-subtitle">{content.subtitle}</p>}
        {locationLine(property) && (
          <p className="expose-cover-location">{locationLine(property)}</p>
        )}
        {price && (
          <div className="expose-cover-price">
            <span className="expose-price-label">{price.primary.label}</span>
            <span className="expose-price-value">{price.primary.value}</span>
            {price.secondary.map((fact) => (
              <span key={fact.label} className="expose-price-meta">
                {fact.label}: {fact.value}
              </span>
            ))}
          </div>
        )}
        {facts.length > 0 && (
          <div className="expose-cover-facts">
            {facts.map((fact) => (
              <div key={fact.label} className="expose-cover-fact">
                <span className="expose-cover-fact-label">{fact.label}</span>
                <span className="expose-cover-fact-value">{fact.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FactsSection({
  id,
  kicker,
  title,
  facts,
}: {
  id: string;
  kicker: string;
  title: string;
  facts: ExposeFact[];
}) {
  if (!facts.length) return null;
  return (
    <Section id={id} kicker={kicker} title={title}>
      <FactGrid facts={facts} />
    </Section>
  );
}

function HighlightsSection({ highlights }: { highlights: string[] }) {
  const items = highlights.filter((item) => item.trim());
  if (!items.length) return null;
  return (
    <Section id="highlights" kicker="AUF EINEN BLICK" title="Highlights">
      <ul className="expose-highlights">
        {items.map((item) => (
          <li key={item} className="expose-highlight">
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PropertySection({ property, description }: { property: Property; description: string }) {
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

function EquipmentSection({ property, description }: { property: Property; description: string }) {
  const items = structuredEquipment(property);
  const hasDescription = description.trim().length > 0;
  if (!items.length && !hasDescription) return null;
  return (
    <Section id="equipment" kicker="AUSSTATTUNG" title="Ausstattung">
      {items.length > 0 && (
        <ul className="expose-equipment">
          {items.map((item) => (
            <li key={item} className="expose-equipment-item">
              {item}
            </li>
          ))}
        </ul>
      )}
      <Prose text={description} className={cn(items.length > 0 && 'mt-7')} />
    </Section>
  );
}

function LocationSection({ property, description }: { property: Property; description: string }) {
  const address = fullAddressLines(property);
  const meaningful =
    address.length > 0 || locationLine(property) || description.trim().length > 0;
  if (!meaningful) return null;
  return (
    <Section id="location" kicker="LAGE & UMWELT" title="Lage">
      {address.length > 0 && <p className="expose-location-address">{address.join(' · ')}</p>}
      <Prose text={description} />
    </Section>
  );
}

function EfficiencyScale({ value }: { value: string }) {
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

function EnergySection({ property }: { property: Property }) {
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

function GallerySection({ property, expose }: { property: Property; expose: ExposeConfiguration }) {
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

function FloorplanSection({ images }: { images: PropertyImage[] }) {
  if (!images.length) return null;
  return (
    <Section id="floorplans" kicker="GRUNDRISSE" title="Grundrisse">
      <div className="expose-floorplans">
        {images.map((image) => (
          <figure key={image.id} className="expose-floorplan-figure">
            <img
              src={apiAssetUrl(image.url)}
              alt={image.caption || image.fileName || 'Grundriss'}
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

const PUBLISHABLE_DOCUMENT_TYPES = ['grundriss', 'energieausweis'];

function DocumentsSection({ records }: { records: DocumentRecord[] }) {
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

function ContactSection({ property }: { property: Property }) {
  const agent = property.exposeData?.agent;
  if (!agent?.name && !agent?.company) return null;
  const address = agent.address
    ? [
        [agent.address.street, agent.address.houseNumber].filter(Boolean).join(' '),
        [agent.address.postalCode, agent.address.city].filter(Boolean).join(' '),
      ].filter(Boolean)
    : [];
  const channels = [
    agent.phone ? { label: 'Telefon', value: agent.phone } : null,
    agent.email ? { label: 'E-Mail', value: agent.email } : null,
    agent.website ? { label: 'Web', value: agent.website } : null,
  ].filter((channel): channel is { label: string; value: string } => channel !== null);
  return (
    <Section id="contact" kicker="KONTAKT" title="Ihr Ansprechpartner">
      <div className="expose-contact">
        {agent.name && <h3 className="expose-contact-name">{agent.name}</h3>}
        {agent.company && <p className="expose-contact-company">{agent.company}</p>}
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