import type { Property } from '../../../create/[id]/types';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { translations, type Translator } from '@/lib/i18n/core';
import type { EffectiveMarketingContent, ExposeConfiguration } from '../expose-model';
import {
  coverFacts,
  coverImageOf,
  effectiveBranding,
  locationLine,
  priceFacts,
  visibleSections,
} from '../expose-model';
import type { ExposeMedia } from '../expose-model';
import { EXPOSE_CSS } from '../../../expose/expose-css';
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
 * The default "modern" Exposé template (Phase 6, extended in Phase 11). Pure
 * presentation: it receives already prepared data (property, effective
 * marketing content, expose configuration, media) and renders a professional
 * real-estate Exposé. It contains no business logic and never edits anything.
 *
 * The document stylesheet (EXPOSE_CSS) travels with the template so the
 * Builder live preview, the review preview, and the PDF print route render
 * exactly the same document. Only pagination differs via the print CSS.
 */

function ModernCover({
  property,
  content,
  expose,
  media,
  tr,
}: {
  property: Property;
  content: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
  tr: Translator;
}) {
  const hero = coverImageOf(property, expose) ?? media.images[0];
  const price = priceFacts(property, tr);
  const facts = coverFacts(property, tr);
  const branding = effectiveBranding(property, expose);

  return (
    <section id="expose-cover" className="expose-cover">
      <div className={cn('expose-cover-hero', !hero && 'expose-cover-hero-empty')}>
        {hero ? (
          <>
            <img
              src={apiAssetUrl(hero.url)}
              alt={hero.caption || hero.fileName || tr.t('expose.altFallbacks.coverPhoto')}
            />
            {(branding.logoUrl || branding.companyName) && (
              <span className="expose-cover-brand">
                {branding.logoUrl && (
                  <img
                    src={apiAssetUrl(branding.logoUrl)}
                    alt={branding.companyName || tr.t('expose.altFallbacks.logo')}
                    className="expose-cover-logo"
                  />
                )}
                {branding.companyName && <span>{branding.companyName}</span>}
              </span>
            )}
          </>
        ) : (
          <>
            {(branding.logoUrl || branding.companyName) && (
              <span className="expose-cover-brand">
                {branding.logoUrl && (
                  <img
                    src={apiAssetUrl(branding.logoUrl)}
                    alt={branding.companyName || tr.t('expose.altFallbacks.logo')}
                    className="expose-cover-logo"
                  />
                )}
                {branding.companyName && <span>{branding.companyName}</span>}
              </span>
            )}
            <span className="expose-cover-noimage">{tr.t('expose.noCoverImage')}</span>
          </>
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
    </section>
  );
}

export function ModernExposeTemplate({
  property,
  marketingContent,
  expose,
  media,
  translations: translationsProp,
}: {
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
  translations?: Translator;
}) {
  const tr = translationsProp ?? translations.en;
  const sections = visibleSections(expose);
  const branding = effectiveBranding(property, expose);
  return (
    <>
      <style>{EXPOSE_CSS}</style>
      <article
        data-template="modern"
        className="expose-doc mx-auto w-full max-w-[794px] bg-white text-[#26302a] shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
      >
        {sections.map((section) => {
          switch (section.type) {
            case 'cover':
              return (
                <ModernCover
                  key={section.id}
                  property={property}
                  content={marketingContent}
                  expose={expose}
                  media={media}
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
