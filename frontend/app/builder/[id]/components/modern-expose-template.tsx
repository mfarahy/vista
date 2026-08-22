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
  SECTION_LABELS,
  coverImageOf,
  energyFacts,
  equipmentFeatures,
  floorplanImages,
  fullAddressLines,
  galleryImagesOf,
  locationLine,
  propertyFacts,
  summaryFacts,
  visibleSections,
} from '../expose-model';

/**
 * The single MVP template ("modern"). Pure presentation: it receives already
 * prepared data (property, effective marketing content, expose configuration,
 * media) and renders a professional German real-estate Exposé. It contains no
 * business logic and never edits anything.
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
    <article className="mx-auto w-full max-w-[794px] bg-white text-[#26302a] shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
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
      <footer className="border-t border-[#e4e8e4] px-10 py-6 text-center text-[10px] tracking-wide text-[#8a948c]">
        VISTA · Immobilien-Exposé · {new Date().toLocaleDateString('de-DE')}
      </footer>
    </article>
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
    case 'facts':
      return (
        <FactsSection
          title="Fakten"
          facts={summaryFacts(property)}
          note="Fakten aus Ihren Objektdaten"
        />
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

function SectionShell({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={`expose-${id}`} className={cn('expose-section px-10 py-9', className)}>
      <header className="expose-section-title mb-6 flex items-center gap-3">
        <span className="h-px w-8 bg-[#3c5a4a]" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight text-[#26302a]">{label}</h2>
      </header>
      {children}
    </section>
  );
}

const money = (value?: number | null) =>
  value == null
    ? ''
    : new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value);

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
  const sale = property.transactionType === 'sale';
  const price = sale
    ? (property.askingPrice ?? property.exposeData?.pricing.purchasePrice)
    : (property.coldRent ?? property.exposeData?.pricing.rentPrice);
  const coverFacts = [
    price != null ? { label: sale ? 'Kaufpreis' : 'Kaltmiete', value: money(price) } : null,
    (property.livingArea ?? property.exposeData?.propertyDetails.livingArea) != null
      ? {
          label: 'Wohnfläche',
          value: `${(property.livingArea ?? property.exposeData?.propertyDetails.livingArea)!} m²`,
        }
      : null,
    (property.rooms ?? property.exposeData?.propertyDetails.rooms) != null
      ? {
          label: 'Zimmer',
          value: String(property.rooms ?? property.exposeData?.propertyDetails.rooms),
        }
      : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  return (
    <section id="expose-cover" className="expose-cover overflow-hidden">
      {hero ? (
        <div className="relative aspect-[16/9] w-full bg-[#dde3dd]">
          <img
            src={apiAssetUrl(hero.url)}
            alt={hero.caption || hero.fileName || 'Titelfoto'}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />
          <span className="absolute left-10 top-8 text-xs font-bold tracking-[0.35em] text-white">
            VISTA
          </span>
        </div>
      ) : (
        <div className="grid aspect-[16/9] w-full place-items-center bg-[#e8ece8] text-sm text-[#8a948c]">
          Kein Titelfoto vorhanden
        </div>
      )}
      <div className="bg-[#24352c] px-10 pb-10 pt-8 text-white">
        {content.title && (
          <h1 className="max-w-[620px] font-serif text-[34px] leading-[1.15] tracking-tight">
            {content.title}
          </h1>
        )}
        {content.subtitle && <p className="mt-2 text-[15px] text-[#c8d4ca]">{content.subtitle}</p>}
        {locationLine(property) && (
          <p className="mt-4 text-[13px] font-medium uppercase tracking-wide text-[#a8b8ab]">
            {locationLine(property)}
          </p>
        )}
        {coverFacts.length > 0 && (
          <div className="mt-7 flex flex-wrap gap-x-12 gap-y-4 border-t border-white/25 pt-5">
            {coverFacts.map((fact) => (
              <div key={fact.label}>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#a8b8ab]">
                  {fact.label}
                </p>
                <p className="mt-1 font-serif text-xl">{fact.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HighlightsSection({ highlights }: { highlights: string[] }) {
  const items = highlights.filter((item) => item.trim());
  if (!items.length) return null;
  return (
    <SectionShell id="highlights" label="Highlights">
      <ul className="expose-highlights-list grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[14px] leading-6 text-[#3a463e]">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#3c5a4a] text-[11px] font-bold text-white">
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

function FactTable({ facts }: { facts: ExposeFact[] }) {
  if (!facts.length) return null;
  return (
    <div className="expose-fact-table overflow-hidden rounded-lg border border-[#e4e8e4]">
      {facts.map((fact, index) => (
        <div
          key={fact.label}
          className={cn(
            'grid grid-cols-[180px_1fr] items-baseline gap-4 px-5 py-3 text-[14px]',
            index % 2 === 0 ? 'bg-[#f6f8f6]' : 'bg-white',
          )}
        >
          <span className="text-[#6b766e]">{fact.label}</span>
          <span className="font-medium text-[#26302a]">{fact.value}</span>
        </div>
      ))}
    </div>
  );
}

function FactsSection({
  title,
  facts,
  note,
}: {
  title: string;
  facts: ExposeFact[];
  note?: string;
}) {
  if (!facts.length) return null;
  return (
    <SectionShell id={title.toLowerCase()} label={title}>
      <FactTable facts={facts} />
      {note && <p className="mt-3 text-[11px] text-[#8a948c]">{note}</p>}
    </SectionShell>
  );
}

function PropertySection({ property, description }: { property: Property; description: string }) {
  const facts = propertyFacts(property);
  const hasDescription = description.trim().length > 0;
  if (!facts.length && !hasDescription) return null;
  return (
    <SectionShell id="property" label="Objekt">
      {facts.length > 0 && (
        <>
          <FactTable facts={facts} />
          <p className="mt-3 text-[11px] text-[#8a948c]">Fakten aus Ihren Objektdaten</p>
        </>
      )}
      {hasDescription && (
        <p className="mt-5 max-w-[620px] text-[14px] leading-7 text-[#3a463e]">{description}</p>
      )}
    </SectionShell>
  );
}

function EquipmentSection({ property, description }: { property: Property; description: string }) {
  const features = equipmentFeatures(property);
  const hasDescription = description.trim().length > 0;
  if (!features.length && !hasDescription) return null;
  return (
    <SectionShell id="equipment" label="Ausstattung">
      {features.length > 0 && (
        <ul className="expose-equipment-list flex flex-wrap gap-2">
          {features.map((feature) => (
            <li
              key={feature}
              className="rounded-full border border-[#dfe5df] bg-[#f4f7f4] px-4 py-1.5 text-[13px] font-medium text-[#3a463e]"
            >
              {feature}
            </li>
          ))}
        </ul>
      )}
      {hasDescription && (
        <p className="mt-5 max-w-[620px] text-[14px] leading-7 text-[#3a463e]">{description}</p>
      )}
    </SectionShell>
  );
}

function LocationSection({ property, description }: { property: Property; description: string }) {
  const address = fullAddressLines(property);
  const meaningful = description.trim().length > 0 || locationLine(property) || address.length > 0;
  if (!meaningful) return null;
  return (
    <SectionShell id="location" label="Lage">
      {address.length > 0 && (
        <p className="text-[14px] font-semibold text-[#26302a]">{address.join(' · ')}</p>
      )}
      {description.trim() && (
        <p className="mt-4 max-w-[620px] text-[14px] leading-7 text-[#3a463e]">{description}</p>
      )}
    </SectionShell>
  );
}

function EnergySection({ property }: { property: Property }) {
  const facts = energyFacts(property);
  if (!facts.length) return null;
  return (
    <SectionShell id="energy" label="Energie">
      <FactTable facts={facts} />
      <p className="mt-3 text-[11px] text-[#8a948c]">Fakten aus Ihren Objektdaten</p>
    </SectionShell>
  );
}

function GallerySection({ property, expose }: { property: Property; expose: ExposeConfiguration }) {
  const images = galleryImagesOf(property, expose).filter(
    (image) => image.id !== expose.selectedCoverImageId,
  );
  if (!images.length) return null;
  return (
    <SectionShell id="gallery" label="Galerie">
      <div className="grid grid-cols-2 gap-3">
        {images.map((image) => (
          <figure key={image.id} className="expose-gallery-figure overflow-hidden rounded-md">
            <img
              src={apiAssetUrl(image.url)}
              alt={image.caption || image.fileName || 'Objektfoto'}
              className="aspect-[4/3] w-full object-cover"
            />
            {image.caption && (
              <figcaption className="px-1 pt-2 text-[11px] text-[#6b766e]">
                {image.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}

function FloorplanSection({ images }: { images: PropertyImage[] }) {
  if (!images.length) return null;
  return (
    <SectionShell id="floorplans" label="Grundrisse">
      <div className="grid gap-4 sm:grid-cols-2">
        {images.map((image) => (
          <figure
            key={image.id}
            className="expose-floorplan-figure overflow-hidden rounded-md border border-[#e4e8e4] bg-[#fafbfa] p-3"
          >
            <img
              src={apiAssetUrl(image.url)}
              alt={image.caption || image.fileName || 'Grundriss'}
              className="w-full object-contain"
            />
            {image.caption && (
              <figcaption className="pt-2 text-center text-[12px] text-[#6b766e]">
                {image.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}

const PUBLISHABLE_DOCUMENT_TYPES = ['grundriss', 'energieausweis'];

function DocumentsSection({ records }: { records: DocumentRecord[] }) {
  const documents = records.filter(
    (record) => record.documentType && PUBLISHABLE_DOCUMENT_TYPES.includes(record.documentType),
  );
  if (!documents.length) return null;
  return (
    <SectionShell id="documents" label="Unterlagen">
      <ul className="expose-documents-list space-y-2">
        {documents.map((document) => (
          <li key={document.id}>
            <a
              href={apiAssetUrl(document.url)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-4 rounded-lg border border-[#e4e8e4] px-4 py-3 text-[13px] text-[#3a463e] transition-colors hover:border-[#3c5a4a] hover:bg-[#f4f7f4]"
            >
              <span className="truncate font-medium">{document.filename}</span>
              <span className="shrink-0 text-[11px] text-[#6b766e]">
                {document.documentType === 'grundriss' ? 'Grundriss' : 'Energieausweis'}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-[#8a948c]">
        Präsentationsunterlagen · {SECTION_LABELS.documents}
      </p>
    </SectionShell>
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
  const lines = [agent.phone, agent.email, agent.website].filter(Boolean);
  return (
    <SectionShell id="contact" label="Ihr Ansprechpartner">
      <div className="expose-contact-card max-w-[420px] rounded-lg border border-[#e4e8e4] bg-[#fafbfa] p-6">
        {agent.name && <h3 className="text-[16px] font-semibold text-[#26302a]">{agent.name}</h3>}
        {agent.company && <p className="mt-1 text-[13px] text-[#6b766e]">{agent.company}</p>}
        {address.length > 0 && (
          <p className="mt-3 text-[13px] text-[#3a463e]">{address.join(', ')}</p>
        )}
        {lines.length > 0 && <p className="mt-3 text-[13px] text-[#3a463e]">{lines.join(' · ')}</p>}
      </div>
    </SectionShell>
  );
}
