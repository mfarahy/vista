/**
 * Print-only CSS for the Exposé PDF export (Phase 5B, refined in Phase 6).
 *
 * The Exposé is the exact same `ModernExposeTemplate` the Builder previews;
 * only layout/pagination for A4 differs here. No Builder UI, editing
 * indicators, or source badges are rendered by the print route at all.
 *
 * Sections flow naturally; only the cover is a forced page. Blocks that
 * would look broken when split (fact grids, highlight lists, figures, the
 * energy scale, contact block, document rows) are kept together with
 * `break-inside: avoid`. Headings stay with their content via
 * `break-after: avoid`.
 *
 * The bottom page margin (18mm) reserves the band where Chromium draws the
 * per-page footer template (`pageFooterTemplate` in page-footer.ts) on every
 * page. The cover keeps its full 297mm height (it is the only forced page and
 * full-bleed by design); in print, its copy block gains extra bottom padding
 * (18mm band + 6mm clearance) so the bottom facts row stays fully above the
 * footer band instead of being clipped or covered.
 */
export const PRINT_CSS = `
  @page {
    size: A4;
    margin: 0 0 18mm 0;
  }
  html,
  body {
    margin: 0;
    padding: 0;
    background: #ffffff !important;
  }
  .expose-print {
    background: #ffffff;
  }
  .expose-print article {
    max-width: none !important;
    width: 210mm;
    margin: 0 auto;
    box-shadow: none !important;
    background: #ffffff;
  }
  img {
    max-width: 100%;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  .expose-cover {
    height: 297mm;
    min-height: 297mm;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
  }
  @media print {
    .expose-cover-copy {
      padding-bottom: calc(18mm + 6mm) !important;
    }
  }
  .expose-section-header {
    break-after: avoid;
    page-break-after: avoid;
    break-inside: avoid;
  }
  .expose-fact-grid,
  .expose-highlights,
  .expose-equipment,
  .expose-energy-scale,
  .expose-contact,
  .expose-gallery-figure,
  .expose-floorplan-figure,
  .expose-document-row,
  .expose-location-map,
  .expose-location-summary,
  .expose-broker {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  #expose-energy,
  #expose-floorplans,
  #expose-contact,
  #expose-documents {
    break-inside: avoid;
  }
  /* The broker page is a dedicated full page of the PDF Exposé. */
  #expose-broker {
    break-before: page;
    page-break-before: always;
  }
  .expose-print footer {
    break-before: auto;
  }
`;
