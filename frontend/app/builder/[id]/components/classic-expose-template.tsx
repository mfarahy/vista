import type { BrokerProfile, Property } from '../../../create/[id]/types';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { translations, type Translator } from '@/lib/i18n/core';
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
  BrokerPageSection,
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
 * "Classic" template (Phase 11): a traditional professional
 * Immobilien-Exposé. Restrained typography, strong section hierarchy, a
 * framed cover image, a structured price block and a conventional contact
 * block — appropriate for klassische Immobilienvermittlung.
 *
 * Pure presentation: same normalized data and section system as Modern, its
 * own stylesheet (CLASSIC_CSS), and a classic cover.
 */

export const CLASSIC_CSS = `
  .expose-doc {
    --classic-ink: #1f2723;
    --classic-ink-soft: #4c5751;
    --classic-muted: #7f8a83;
    --classic-line: #dcded9;
    --classic-accent: #274e3a;
    --classic-accent-soft: #3a664d;
    --classic-gold: #a3872e;
    --classic-surface: #f4f5f2;
    --classic-paper: #fefefd;
    background: var(--classic-paper);
    color: var(--classic-ink);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13.5px;
    line-height: 1.65;
  }

  /* ---------- Cover ---------- */

  .expose-cover {
    min-height: 1123px;
    display: flex;
    flex-direction: column;
    background: var(--classic-paper);
  }
  .expose-cover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 22px 56px;
    border-bottom: 3px double var(--classic-line);
  }
  .expose-cover-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .expose-cover-brand img {
    height: 34px;
    width: auto;
    max-width: 150px;
    object-fit: contain;
  }
  .expose-cover-brand span {
    color: var(--classic-accent);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .expose-cover-header-contact {
    color: var(--classic-muted);
    font-size: 12px;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .expose-cover-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 34px 56px 40px;
  }
  .expose-cover-hero {
    position: relative;
    height: 330px;
    flex: 0 0 auto;
    background: var(--classic-surface);
    border: 1px solid var(--classic-line);
    overflow: hidden;
  }
  .expose-cover-hero img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .expose-cover-hero-empty {
    display: grid;
    place-items: center;
  }
  .expose-cover-noimage {
    color: var(--classic-muted);
    font-size: 13px;
    letter-spacing: 0.08em;
  }
  .expose-cover-copy {
    flex: 1;
    padding-top: 30px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .expose-kicker {
    margin: 0 0 10px;
    color: var(--classic-muted);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .expose-cover .expose-kicker {
    color: var(--classic-gold);
  }
  .expose-cover-title {
    margin: 0;
    max-width: 620px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 34px;
    font-weight: 400;
    line-height: 1.16;
    letter-spacing: 0.1px;
  }
  .expose-cover-subtitle {
    margin: 10px 0 0;
    max-width: 560px;
    color: var(--classic-ink-soft);
    font-size: 14.5px;
    line-height: 1.5;
  }
  .expose-cover-location {
    margin: 14px 0 0;
    color: var(--classic-accent);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .expose-cover-price {
    margin-top: 26px;
    border: 1px solid var(--classic-line);
    border-left: 4px solid var(--classic-gold);
    background: var(--classic-surface);
    padding: 16px 22px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 320px;
  }
  .expose-price-label {
    color: var(--classic-muted);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .expose-price-value {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 30px;
    line-height: 1.15;
    color: var(--classic-accent);
  }
  .expose-price-meta {
    color: var(--classic-ink-soft);
    font-size: 12.5px;
  }
  .expose-cover-facts {
    margin-top: auto;
    padding-top: 22px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px 48px;
    border-top: 1px solid var(--classic-line);
    width: 100%;
  }
  .expose-cover-fact {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .expose-cover-fact-label {
    color: var(--classic-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .expose-cover-fact-value {
    font-size: 17px;
    font-weight: 600;
    color: var(--classic-ink);
  }

  /* ---------- Sections ---------- */

  .expose-section {
    padding: 44px 56px 48px;
    break-inside: auto;
  }
  .expose-section-header {
    margin-bottom: 26px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--classic-line);
    position: relative;
    break-after: avoid;
  }
  .expose-section-header::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -3px;
    border-bottom: 1px solid var(--classic-line);
  }
  .expose-section-kicker {
    margin: 0 0 6px;
    color: var(--classic-gold);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .expose-section-title {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 24px;
    font-weight: 400;
    line-height: 1.2;
    color: var(--classic-ink);
    break-after: avoid;
  }

  /* ---------- Facts ---------- */

  .expose-fact-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid var(--classic-line);
  }
  .expose-fact {
    padding: 11px 0 13px;
    border-top: 1px solid var(--classic-line);
    break-inside: avoid;
  }
  .expose-fact:nth-child(even) {
    padding-left: 34px;
    border-left: 1px solid var(--classic-line);
  }
  .expose-fact:nth-child(odd) {
    padding-right: 34px;
  }
  .expose-fact-label {
    display: block;
    color: var(--classic-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  .expose-fact-value {
    display: block;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--classic-ink);
  }

  /* ---------- Highlights ---------- */

  .expose-highlights {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 11px 40px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .expose-highlight {
    display: flex;
    gap: 12px;
    align-items: baseline;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--classic-ink-soft);
    break-inside: avoid;
  }
  .expose-highlight::before {
    content: "";
    flex: 0 0 8px;
    align-self: flex-start;
    width: 8px;
    height: 8px;
    margin-top: 7px;
    background: var(--classic-accent);
  }

  /* ---------- Prose ---------- */

  .expose-prose {
    max-width: 660px;
    color: var(--classic-ink-soft);
    font-size: 13.5px;
    line-height: 1.75;
  }
  .expose-prose p {
    margin: 0 0 14px;
  }
  .expose-prose p:last-child {
    margin-bottom: 0;
  }

  /* ---------- Equipment ---------- */

  .expose-equipment {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 44px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .expose-equipment-item {
    display: flex;
    gap: 10px;
    padding: 7px 0;
    border-top: 1px solid var(--classic-line);
    font-size: 13.5px;
    color: var(--classic-ink-soft);
    break-inside: avoid;
  }
  .expose-equipment-item::before {
    content: "▪";
    color: var(--classic-accent);
    font-size: 10px;
  }

  /* ---------- Location ---------- */

  .expose-location-address {
    margin: 0 0 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--classic-ink);
  }

  /* ---------- Energy ---------- */

  .expose-energy-scale {
    display: flex;
    gap: 4px;
    margin-top: 22px;
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
    outline: 2px solid var(--classic-ink);
    outline-offset: 2px;
  }
  .expose-energy-caption {
    margin: 9px 0 0;
    color: var(--classic-muted);
    font-size: 10.5px;
    letter-spacing: 0.4px;
  }

  /* ---------- Gallery ---------- */

  .expose-gallery {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 26px 20px;
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
    background: var(--classic-surface);
    border: 1px solid var(--classic-line);
  }
  .expose-figure-caption {
    margin: 8px 0 0;
    color: var(--classic-muted);
    font-size: 10.5px;
    letter-spacing: 0.3px;
  }

  /* ---------- Floorplans ---------- */

  .expose-floorplans {
    display: flex;
    flex-direction: column;
    gap: 30px;
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
    background: var(--classic-surface);
    border: 1px solid var(--classic-line);
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
    padding: 12px 0;
    border-top: 1px solid var(--classic-line);
    font-size: 13.5px;
    color: var(--classic-ink-soft);
    break-inside: avoid;
  }
  .expose-document-row:last-child {
    border-bottom: 1px solid var(--classic-line);
  }
  .expose-document-name {
    font-weight: 500;
    color: var(--classic-ink);
  }
  .expose-document-type {
    color: var(--classic-muted);
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  /* ---------- Contact ---------- */

  .expose-contact {
    max-width: 460px;
    border: 1px solid var(--classic-line);
    border-top: 3px solid var(--classic-accent);
    background: var(--classic-surface);
    padding: 22px 26px;
  }
  .expose-contact-logo {
    display: block;
    height: 38px;
    width: auto;
    max-width: 180px;
    object-fit: contain;
    margin-bottom: 14px;
  }
  .expose-contact-name {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 20px;
    font-weight: 400;
    color: var(--classic-ink);
  }
  .expose-contact-company {
    margin: 3px 0 0;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--classic-accent);
  }
  .expose-contact-address {
    margin: 12px 0 0;
    font-size: 13px;
    color: var(--classic-ink-soft);
  }
  .expose-contact-channels {
    margin: 12px 0 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .expose-contact-channel {
    display: flex;
    gap: 12px;
    font-size: 13px;
  }
  .expose-contact-channel-label {
    flex: 0 0 74px;
    color: var(--classic-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding-top: 2px;
  }
  .expose-contact-channel-value {
    color: var(--classic-ink-soft);
    word-break: break-word;
  }

  /* ---------- Broker page ---------- */

  .expose-broker {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .expose-broker-head {
    display: flex;
    align-items: flex-start;
    gap: 28px;
    border: 1px solid var(--classic-line);
    border-top: 3px solid var(--classic-accent);
    background: var(--classic-surface);
    padding: 26px 28px;
  }
  .expose-broker-photo {
    flex: 0 0 150px;
    width: 150px;
    height: 190px;
    object-fit: cover;
    border: 1px solid var(--classic-line);
    background: var(--classic-paper);
  }
  .expose-broker-id {
    flex: 1;
    min-width: 0;
  }
  .expose-broker-name {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 26px;
    font-weight: 400;
    line-height: 1.2;
    color: var(--classic-ink);
  }
  .expose-broker-role {
    margin: 6px 0 0;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--classic-gold);
  }
  .expose-broker-company {
    margin: 6px 0 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--classic-accent);
  }
  .expose-broker-tagline {
    margin: 14px 0 0;
    font-size: 13.5px;
    font-style: italic;
    line-height: 1.6;
    color: var(--classic-ink-soft);
  }
  .expose-broker-logo {
    flex: 0 0 auto;
    max-width: 160px;
    max-height: 64px;
    object-fit: contain;
  }
  .expose-broker-channels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--classic-line);
    background: var(--classic-surface);
  }
  .expose-broker-channel {
    padding: 13px 18px;
    border-top: 1px solid var(--classic-line);
  }
  .expose-broker-channel:nth-child(odd) {
    border-right: 1px solid var(--classic-line);
  }
  .expose-broker-channel-label {
    display: block;
    color: var(--classic-muted);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .expose-broker-channel-value {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--classic-ink);
    word-break: break-word;
  }
  .expose-broker-address {
    margin: 0;
    font-size: 13.5px;
    color: var(--classic-ink-soft);
  }
  .expose-broker-block {
    border-top: 1px solid var(--classic-line);
    padding-top: 18px;
  }
  .expose-broker-heading {
    margin: 0 0 12px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 17px;
    font-weight: 400;
    color: var(--classic-ink);
  }
  .expose-broker-subheading {
    margin: 0 0 8px;
    color: var(--classic-muted);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .expose-broker-credentials + .expose-broker-credentials {
    margin-top: 16px;
  }
  .expose-broker-awards,
  .expose-broker-links {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .expose-broker-award,
  .expose-broker-links li {
    display: flex;
    gap: 10px;
    padding: 7px 0;
    border-top: 1px solid var(--classic-line);
    font-size: 13.5px;
    color: var(--classic-ink-soft);
    break-inside: avoid;
  }
  .expose-broker-award::before {
    content: "▪";
    color: var(--classic-accent);
    font-size: 10px;
  }
  .expose-broker-recommendation {
    margin: 0;
    max-width: 620px;
    font-size: 13.5px;
    font-style: italic;
    line-height: 1.7;
    color: var(--classic-ink-soft);
  }
  .expose-broker-recommendation-link {
    margin: 10px 0 0;
  }
  .expose-broker-recommendation-link a,
  .expose-broker-links a {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--classic-accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .expose-broker-images {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }
  .expose-broker-image {
    height: 56px;
    width: auto;
    max-width: 160px;
    object-fit: contain;
    border: 1px solid var(--classic-line);
    background: var(--classic-paper);
    padding: 6px;
  }

  /* ---------- Footer ---------- */

  .expose-footer {
    padding: 18px 56px 24px;
    border-top: 1px solid var(--classic-line);
    text-align: center;
    color: var(--classic-muted);
    font-size: 10px;
    letter-spacing: 0.08em;
  }
`;

function ClassicCover({
  property,
  content,
  expose,
  media,
  branding,
  tr,
}: {
  property: Property;
  content: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
  branding: EffectiveBranding;
  tr: Translator;
}) {
  const hero = coverImageOf(property, expose) ?? media.images[0];
  const price = priceFacts(property, tr);
  const facts = coverFacts(property, tr);

  return (
    <section id="expose-cover" className="expose-cover">
      <header className="expose-cover-header">
        <div className="expose-cover-brand">
          {branding.logoUrl && (
            <img
              src={apiAssetUrl(branding.logoUrl)}
              alt={branding.companyName || tr.t('expose.altFallbacks.logo')}
            />
          )}
          {branding.companyName && <span>{branding.companyName}</span>}
        </div>
        {branding.phone && <span className="expose-cover-header-contact">{branding.phone}</span>}
      </header>
      <div className="expose-cover-body">
        <div className={cn('expose-cover-hero', !hero && 'expose-cover-hero-empty')}>
          {hero ? (
            <img
              src={apiAssetUrl(hero.url)}
              alt={hero.caption || hero.fileName || tr.t('expose.altFallbacks.coverPhoto')}
            />
          ) : (
            <span className="expose-cover-noimage">{tr.t('expose.noCoverImage')}</span>
          )}
        </div>
        <div className="expose-cover-copy">
          <p className="expose-kicker">{tr.t('expose.coverKicker')}</p>
          {content.title && <h1 className="expose-cover-title">{content.title}</h1>}
          {content.subtitle && <p className="expose-cover-subtitle">{content.subtitle}</p>}
          {locationLine(property) && (
            <p className="expose-cover-location">{locationLine(property)}</p>
          )}
          {price && (
            <div className="expose-cover-price">
              <span className="expose-price-label">{tr.t(price.primary.label)}</span>
              <span className="expose-price-value">{price.primary.value}</span>
              {price.secondary.map((fact) => (
                <span key={fact.label} className="expose-price-meta">
                  {tr.t(fact.label)}: {fact.value}
                </span>
              ))}
            </div>
          )}
          {facts.length > 0 && (
            <div className="expose-cover-facts">
              {facts.map((fact) => (
                <div key={fact.label} className="expose-cover-fact">
                  <span className="expose-cover-fact-label">{tr.t(fact.label)}</span>
                  <span className="expose-cover-fact-value">{fact.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ClassicExposeTemplate({
  property,
  marketingContent,
  expose,
  media,
  brokerProfile,
  translations: translationsProp,
}: {
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
  brokerProfile?: BrokerProfile | null;
  translations?: Translator;
}) {
  const tr = translationsProp ?? translations.en;
  const sections = visibleSections(expose);
  const branding = effectiveBranding(property, expose, brokerProfile);
  return (
    <>
      <style>{CLASSIC_CSS}</style>
      <article
        data-template="classic"
        className="expose-doc mx-auto w-full max-w-[794px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
      >
        {sections.map((section) => {
          switch (section.type) {
            case 'cover':
              return (
                <ClassicCover
                  key={section.id}
                  property={property}
                  content={marketingContent}
                  expose={expose}
                  media={media}
                  branding={branding}
                  tr={tr}
                />
              );
            case 'facts':
              return <FactsSection key={section.id} property={property} tr={tr} />;
            case 'highlights':
              return (
                <HighlightsSection
                  key={section.id}
                  highlights={marketingContent.highlights}
                  tr={tr}
                />
              );
            case 'property':
              return (
                <PropertySection
                  key={section.id}
                  property={property}
                  description={marketingContent.propertyDescription}
                  tr={tr}
                />
              );
            case 'equipment':
              return (
                <EquipmentSection
                  key={section.id}
                  property={property}
                  description={marketingContent.equipmentDescription}
                  tr={tr}
                />
              );
            case 'location':
              return (
                <LocationSection
                  key={section.id}
                  property={property}
                  description={marketingContent.locationDescription}
                  tr={tr}
                />
              );
            case 'energy':
              return <EnergySection key={section.id} property={property} tr={tr} />;
            case 'gallery':
              return (
                <GallerySection key={section.id} property={property} expose={expose} tr={tr} />
              );
            case 'floorplans':
              return (
                <FloorplanSection
                  key={section.id}
                  property={property}
                  images={media.images}
                  staticRender={media.staticRender}
                  tr={tr}
                />
              );
            case 'documents':
              return <DocumentsSection key={section.id} records={media.documents} tr={tr} />;
            case 'contact':
              return (
                <ContactSection
                  key={section.id}
                  property={property}
                  expose={expose}
                  branding={branding}
                  brokerProfile={brokerProfile}
                  tr={tr}
                />
              );
            case 'broker':
              return (
                <BrokerPageSection
                  key={section.id}
                  property={property}
                  brokerProfile={brokerProfile}
                  tr={tr}
                />
              );
            default:
              return null;
          }
        })}
        <footer className="expose-footer">
          {tr.t('expose.footer', {
            company: branding.companyName || 'Vista',
            date: new Date().toLocaleDateString(tr.locale),
          })}
        </footer>
      </article>
    </>
  );
}
