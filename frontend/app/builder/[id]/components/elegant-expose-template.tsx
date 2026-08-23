import type { Property } from '../../../create/[id]/types';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type {
  EffectiveBranding,
  EffectiveMarketingContent,
  ExposeConfiguration,
} from '../expose-model';
import {
  coverFacts,
  coverImageOf,
  effectiveBranding,
  locationLine,
  priceFacts,
  visibleSections,
} from '../expose-model';
import type { ExposeMedia } from '../expose-model';
import {
  ContactSection,
  DocumentsSection,
  EnergySection,
  EquipmentSection,
  FactsSection,
  FloorplanSection,
  GallerySection,
  HighlightsSection,
  LocationSection,
  PropertySection,
} from './template-sections';

/**
 * "Elegant" template (Phase 11): a premium editorial-style Exposé. Large hero
 * image, strong typography hierarchy, generous whitespace, hairline section
 * separators and a restrained accent — appropriate for hochwertige
 * Immobilien. No decorative excess.
 *
 * Pure presentation: same normalized data and section system as Modern, its
 * own stylesheet (ELEGANT_CSS), and an editorial cover.
 */

export const ELEGANT_CSS = `
  .expose-doc {
    --elegant-ink: #191d1a;
    --elegant-ink-soft: #454c49;
    --elegant-muted: #7e8683;
    --elegant-line: #e4e6e2;
    --elegant-accent: #0f3d3e;
    --elegant-accent-soft: #1a5253;
    --elegant-gold: #b4935a;
    --elegant-surface: #f3f4f1;
    --elegant-paper: #fcfbf7;
    background: var(--elegant-paper);
    color: var(--elegant-ink);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13.5px;
    line-height: 1.7;
  }

  /* ---------- Cover ---------- */

  .expose-cover {
    min-height: 1123px;
    display: flex;
    flex-direction: column;
    background: var(--elegant-paper);
  }
  .expose-cover-hero {
    position: relative;
    height: 580px;
    flex: 0 0 auto;
    background: var(--elegant-surface);
    overflow: hidden;
  }
  .expose-cover-hero img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .expose-cover-hero::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(15, 25, 20, 0.18) 0%, rgba(15, 25, 20, 0.05) 55%, rgba(15, 25, 20, 0.34) 100%);
  }
  .expose-cover-hero-empty {
    display: grid;
    place-items: center;
  }
  .expose-cover-noimage {
    color: var(--elegant-muted);
    font-size: 13px;
    letter-spacing: 0.08em;
  }
  .expose-cover-brand {
    position: absolute;
    top: 30px;
    left: 60px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    color: rgba(255, 255, 255, 0.92);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.34em;
    text-transform: uppercase;
  }
  .expose-cover-brand img {
    height: 26px;
    width: auto;
    max-width: 130px;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }
  .expose-cover-copy {
    flex: 1;
    padding: 44px 64px 46px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .expose-cover-rule {
    width: 44px;
    height: 2px;
    background: var(--elegant-gold);
    margin-bottom: 20px;
  }
  .expose-kicker {
    margin: 0 0 12px;
    color: var(--elegant-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.32em;
    text-transform: uppercase;
  }
  .expose-cover .expose-kicker {
    color: var(--elegant-gold);
  }
  .expose-cover-title {
    margin: 0;
    max-width: 640px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 42px;
    font-weight: 400;
    line-height: 1.12;
    letter-spacing: 0.2px;
  }
  .expose-cover-subtitle {
    margin: 14px 0 0;
    max-width: 560px;
    color: var(--elegant-ink-soft);
    font-size: 15px;
    line-height: 1.55;
  }
  .expose-cover-location {
    margin: 16px 0 0;
    color: var(--elegant-accent-soft);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .expose-cover-price {
    margin-top: 30px;
    border-top: 1px solid var(--elegant-gold);
    padding-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 300px;
  }
  .expose-price-label {
    color: var(--elegant-muted);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .expose-price-value {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 32px;
    line-height: 1.12;
    color: var(--elegant-accent);
  }
  .expose-price-meta {
    color: var(--elegant-ink-soft);
    font-size: 12.5px;
  }
  .expose-cover-facts {
    margin-top: auto;
    padding-top: 26px;
    display: flex;
    flex-wrap: wrap;
    gap: 18px 0;
    border-top: 1px solid var(--elegant-line);
    width: 100%;
  }
  .expose-cover-fact {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-right: 44px;
  }
  .expose-cover-fact + .expose-cover-fact {
    border-left: 1px solid var(--elegant-line);
    padding-left: 44px;
  }
  .expose-cover-fact-label {
    color: var(--elegant-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .expose-cover-fact-value {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 19px;
    line-height: 1.2;
    color: var(--elegant-ink);
  }

  /* ---------- Sections ---------- */

  .expose-section {
    padding: 54px 64px 58px;
    break-inside: auto;
  }
  .expose-section-header {
    margin-bottom: 30px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--elegant-line);
    position: relative;
    break-after: avoid;
  }
  .expose-section-header::before {
    content: "";
    position: absolute;
    left: 0;
    bottom: -1px;
    width: 52px;
    height: 2px;
    background: var(--elegant-gold);
  }
  .expose-section-kicker {
    margin: 0 0 8px;
    color: var(--elegant-accent-soft);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
  }
  .expose-section-title {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 27px;
    font-weight: 400;
    line-height: 1.2;
    color: var(--elegant-ink);
    break-after: avoid;
  }

  /* ---------- Facts ---------- */

  .expose-fact-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid var(--elegant-line);
  }
  .expose-fact {
    padding: 15px 0 17px;
    border-top: 1px solid var(--elegant-line);
    break-inside: avoid;
  }
  .expose-fact:nth-child(even) {
    padding-left: 40px;
    border-left: 1px solid var(--elegant-line);
  }
  .expose-fact:nth-child(odd) {
    padding-right: 40px;
  }
  .expose-fact-label {
    display: block;
    color: var(--elegant-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin-bottom: 7px;
  }
  .expose-fact-value {
    display: block;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16.5px;
    line-height: 1.3;
    color: var(--elegant-ink);
  }

  /* ---------- Highlights ---------- */

  .expose-highlights {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 48px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .expose-highlight {
    display: flex;
    gap: 14px;
    align-items: baseline;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--elegant-ink-soft);
    break-inside: avoid;
  }
  .expose-highlight::before {
    content: "";
    flex: 0 0 22px;
    align-self: flex-start;
    height: 1px;
    margin-top: 10px;
    background: var(--elegant-gold);
  }

  /* ---------- Prose ---------- */

  .expose-prose {
    max-width: 660px;
    color: var(--elegant-ink-soft);
    font-size: 13.5px;
    line-height: 1.8;
  }
  .expose-prose p {
    margin: 0 0 15px;
  }
  .expose-prose p:last-child {
    margin-bottom: 0;
  }

  /* ---------- Equipment ---------- */

  .expose-equipment {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 48px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .expose-equipment-item {
    display: flex;
    gap: 12px;
    padding: 9px 0;
    border-top: 1px solid var(--elegant-line);
    font-size: 13.5px;
    color: var(--elegant-ink-soft);
    break-inside: avoid;
  }
  .expose-equipment-item::before {
    content: "—";
    color: var(--elegant-gold);
    font-weight: 400;
  }

  /* ---------- Location ---------- */

  .expose-location-address {
    margin: 0 0 20px;
    font-size: 14px;
    font-weight: 600;
    color: var(--elegant-ink);
  }

  /* ---------- Energy ---------- */

  .expose-energy-scale {
    display: flex;
    gap: 4px;
    margin-top: 26px;
  }
  .expose-energy-scale span {
    flex: 1;
    padding: 5px 0 6px;
    text-align: center;
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.4px;
  }
  .expose-energy-scale .eff-Aplus { background: #3c9b62; }
  .expose-energy-scale .eff-A { background: #65ac56; }
  .expose-energy-scale .eff-B { background: #a9c348; }
  .expose-energy-scale .eff-C { background: #d0c94f; }
  .expose-energy-scale .eff-D { background: #e2b24e; }
  .expose-energy-scale .eff-E { background: #dc8f46; }
  .expose-energy-scale .eff-F { background: #d16e47; }
  .expose-energy-scale .eff-G,
  .expose-energy-scale .eff-H { background: #b8544b; }
  .expose-energy-scale .active {
    outline: 2px solid var(--elegant-ink);
    outline-offset: 2px;
  }
  .expose-energy-caption {
    margin: 9px 0 0;
    color: var(--elegant-muted);
    font-size: 10.5px;
    letter-spacing: 0.4px;
  }

  /* ---------- Gallery ---------- */

  .expose-gallery {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 36px 24px;
  }
  .expose-gallery-figure {
    margin: 0;
    break-inside: avoid;
  }
  .expose-gallery-figure img {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: var(--elegant-surface);
  }
  .expose-figure-caption {
    margin: 9px 0 0;
    color: var(--elegant-muted);
    font-size: 10px;
    letter-spacing: 0.34em;
    text-transform: uppercase;
  }

  /* ---------- Floorplans ---------- */

  .expose-floorplans {
    display: flex;
    flex-direction: column;
    gap: 36px;
  }
  .expose-floorplan-figure {
    margin: 0;
    break-inside: avoid;
  }
  .expose-floorplan-figure img {
    display: block;
    width: 100%;
    max-height: 400px;
    object-fit: contain;
    background: var(--elegant-surface);
    border: 1px solid var(--elegant-line);
  }
  .expose-floorplan-figure .expose-figure-caption {
    text-align: center;
    margin-top: 10px;
  }

  /* ---------- Documents ---------- */

  .expose-documents {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .expose-document-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 13px 0;
    border-top: 1px solid var(--elegant-line);
    font-size: 13.5px;
    color: var(--elegant-ink-soft);
    break-inside: avoid;
  }
  .expose-document-row:last-child {
    border-bottom: 1px solid var(--elegant-line);
  }
  .expose-document-name {
    font-weight: 500;
    color: var(--elegant-ink);
  }
  .expose-document-type {
    color: var(--elegant-muted);
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  /* ---------- Contact ---------- */

  .expose-contact {
    max-width: 460px;
    border-top: 1px solid var(--elegant-gold);
    padding-top: 26px;
  }
  .expose-contact-logo {
    display: block;
    height: 30px;
    width: auto;
    max-width: 160px;
    object-fit: contain;
    margin-bottom: 16px;
  }
  .expose-contact-name {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 22px;
    font-weight: 400;
    color: var(--elegant-ink);
  }
  .expose-contact-company {
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--elegant-accent-soft);
  }
  .expose-contact-address {
    margin: 14px 0 0;
    font-size: 13px;
    color: var(--elegant-ink-soft);
  }
  .expose-contact-channels {
    margin: 14px 0 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .expose-contact-channel {
    display: flex;
    gap: 12px;
    font-size: 13px;
  }
  .expose-contact-channel-label {
    flex: 0 0 74px;
    color: var(--elegant-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding-top: 2px;
  }
  .expose-contact-channel-value {
    color: var(--elegant-ink-soft);
    word-break: break-word;
  }

  /* ---------- Footer ---------- */

  .expose-footer {
    padding: 22px 64px 30px;
    border-top: 1px solid var(--elegant-line);
    text-align: center;
    color: var(--elegant-muted);
    font-size: 10px;
    letter-spacing: 0.1em;
  }
`;

function ElegantCover({
  property,
  content,
  expose,
  media,
  branding,
}: {
  property: Property;
  content: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
  branding: EffectiveBranding;
}) {
  const hero = coverImageOf(property, expose) ?? media.images[0];
  const price = priceFacts(property);
  const facts = coverFacts(property);

  return (
    <section id="expose-cover" className="expose-cover">
      <div className={cn('expose-cover-hero', !hero && 'expose-cover-hero-empty')}>
        {hero ? (
          <img src={apiAssetUrl(hero.url)} alt={hero.caption || hero.fileName || 'Titelfoto'} />
        ) : (
          <span className="expose-cover-noimage">Kein Titelfoto vorhanden</span>
        )}
        {(branding.logoUrl || branding.companyName) && (
          <div className="expose-cover-brand">
            {branding.logoUrl && (
              <img src={apiAssetUrl(branding.logoUrl)} alt={`${branding.companyName || 'Firmenlogo'}`} />
            )}
            {branding.companyName && <span>{branding.companyName}</span>}
          </div>
        )}
      </div>
      <div className="expose-cover-copy">
        <div className="expose-cover-rule" aria-hidden />
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

export function ElegantExposeTemplate({
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
  const branding = effectiveBranding(property, expose);
  return (
    <>
      <style>{ELEGANT_CSS}</style>
      <article
        data-template="elegant"
        className="expose-doc mx-auto w-full max-w-[794px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
      >
        {sections.map((section) => {
          switch (section.type) {
            case 'cover':
              return (
                <ElegantCover
                  key={section.id}
                  property={property}
                  content={marketingContent}
                  expose={expose}
                  media={media}
                  branding={branding}
                />
              );
            case 'facts':
              return <FactsSection key={section.id} property={property} />;
            case 'highlights':
              return <HighlightsSection key={section.id} highlights={marketingContent.highlights} />;
            case 'property':
              return (
                <PropertySection
                  key={section.id}
                  property={property}
                  description={marketingContent.propertyDescription}
                />
              );
            case 'equipment':
              return (
                <EquipmentSection
                  key={section.id}
                  property={property}
                  description={marketingContent.equipmentDescription}
                />
              );
            case 'location':
              return (
                <LocationSection
                  key={section.id}
                  property={property}
                  description={marketingContent.locationDescription}
                />
              );
            case 'energy':
              return <EnergySection key={section.id} property={property} />;
            case 'gallery':
              return <GallerySection key={section.id} property={property} expose={expose} />;
            case 'floorplans':
              return <FloorplanSection key={section.id} images={media.images} />;
            case 'documents':
              return <DocumentsSection key={section.id} records={media.documents} />;
            case 'contact':
              return <ContactSection key={section.id} property={property} expose={expose} branding={branding} />;
            default:
              return null;
          }
        })}
        <footer className="expose-footer">
          {branding.companyName || 'Vista'} · Immobilien-Exposé ·{' '}
          {new Date().toLocaleDateString('de-DE')}
        </footer>
      </article>
    </>
  );
}