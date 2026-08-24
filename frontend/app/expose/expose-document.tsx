'use client';
import { useEffect, useMemo } from 'react';
import type { BrokerProfile, DocumentRecord, Property } from '../create/[id]/types';
import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
  ExposeMedia,
} from '../builder/[id]/expose-model';
import { effectiveBranding, effectiveBrokerProfile } from '../builder/[id]/expose-model';
import { getExposeTemplate } from '../builder/[id]/expose-templates';
import { PRINT_CSS } from './print/print-css';
import { pageFooterTemplate } from './print/page-footer';
import { useI18n } from '@/lib/i18n';

/**
 * The rendered ExposÃ© document shared by the print route (PDF export) and the
 * review preview page: the exact same template the Builder previews (resolved
 * through the template registry), plus the print pagination CSS. No Builder
 * UI is ever rendered here.
 *
 * Sets `window.__EXPOSE_READY__ = true` once fonts and all rendered images
 * are loaded, so the Playwright PDF renderer knows the page is fully
 * printable. Deterministic readiness â€” no arbitrary sleeps.
 */
function PrintReadyMarker() {
  useEffect(() => {
    let disposed = false;
    async function waitForAssets(): Promise<void> {
      try {
        await document.fonts.ready;
      } catch {
        // Font readiness is best-effort; rendering may still proceed.
      }
      if (disposed) return;
      const images = Array.from(document.images);
      await Promise.all(
        images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener('load', () => resolve(), { once: true });
                image.addEventListener('error', () => resolve(), { once: true });
              }),
        ),
      );
      if (disposed) return;
      window.__EXPOSE_READY__ = true;
    }
    void waitForAssets();
    return () => {
      disposed = true;
    };
  }, []);
  return null;
}

declare global {
  interface Window {
    __EXPOSE_READY__?: boolean;
    __EXPOSE_FOOTER_HTML__?: string;
  }
}

/**
 * Supplies the per-page PDF footer to the Playwright renderer. Chromium draws
 * footer templates into the bottom page margin of every printed page, so the
 * Makler identity, the Vista branding, and the page indicator are generated
 * once here (with the same i18n and branding precedence as the rest of the
 * document) and handed over through `window.__EXPOSE_FOOTER_HTML__` â€” the
 * same handshake pattern as `window.__EXPOSE_READY__`.
 */
function PageFooterMarker({
  property,
  expose,
  brokerProfile,
}: {
  property: Property;
  expose: ExposeConfiguration;
  brokerProfile?: BrokerProfile | null;
}) {
  const { locale, t } = useI18n();
  const agent = property.exposeData?.agent;
  const broker = effectiveBrokerProfile(property, brokerProfile);
  const branding = effectiveBranding(property, expose, brokerProfile);
  const footerHtml = useMemo(
    () =>
      pageFooterTemplate({
        maklerName: broker?.name ?? agent?.name,
        maklerCompany: branding.companyName,
        poweredBy: t('expose.pageFooter.poweredBy'),
      }),
    [broker?.name, agent?.name, branding.companyName, locale, t],
  );
  useEffect(() => {
    window.__EXPOSE_FOOTER_HTML__ = footerHtml;
  }, [footerHtml]);
  return null;
}

export default function ExposeDocument({
  property,
  marketingContent,
  expose,
  documents,
  brokerProfile,
  staticRender,
}: {
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  documents: DocumentRecord[];
  /** Configured Broker Profile; templates fall back to the property's legacy agent data. */
  brokerProfile?: BrokerProfile | null;
  /** Static rendering (PDF print): skips interactive components like the 3D viewer. */
  staticRender?: boolean;
}) {
  const { locale, t } = useI18n();
  const media: ExposeMedia = { images: property.images, documents, staticRender };
  const Template = getExposeTemplate(expose.template).component;
  return (
    <main className="expose-print">
      <style>{PRINT_CSS}</style>
      <Template
        property={property}
        marketingContent={marketingContent}
        expose={expose}
        media={media}
        brokerProfile={brokerProfile}
        translations={{ locale, t }}
      />
      <PageFooterMarker property={property} expose={expose} brokerProfile={brokerProfile} />
      <PrintReadyMarker />
    </main>
  );
}
