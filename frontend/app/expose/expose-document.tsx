'use client';
import { useEffect } from 'react';
import type { DocumentRecord, Property } from '../create/[id]/types';
import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
} from '../builder/[id]/expose-model';
import {
  ModernExposeTemplate,
  type ExposeMedia,
} from '../builder/[id]/components/modern-expose-template';
import { PRINT_CSS } from './print/print-css';

/**
 * The rendered Exposé document shared by the print route (PDF export) and the
 * review preview page: the exact same `ModernExposeTemplate` the Builder
 * previews, plus the print pagination CSS. No Builder UI is ever rendered
 * here.
 *
 * Sets `window.__EXPOSE_READY__ = true` once fonts and all rendered images
 * are loaded, so the Playwright PDF renderer knows the page is fully
 * printable. Deterministic readiness — no arbitrary sleeps.
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
  }
}

export default function ExposeDocument({
  property,
  marketingContent,
  expose,
  documents,
}: {
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  documents: DocumentRecord[];
}) {
  const media: ExposeMedia = { images: property.images, documents };
  return (
    <main className="expose-print">
      <style>{PRINT_CSS}</style>
      <ModernExposeTemplate
        property={property}
        marketingContent={marketingContent}
        expose={expose}
        media={media}
      />
      <PrintReadyMarker />
    </main>
  );
}