/**
 * Print-only CSS for the Exposé PDF export (Phase 5B).
 *
 * The Exposé is the exact same `ModernExposeTemplate` the Builder previews;
 * only layout/pagination for A4 differs here. No Builder UI, editing
 * indicators, or source badges are rendered by the print route at all.
 *
 * Sections flow naturally; only blocks that would look broken when split
 * (fact tables, figures, contact card, highlight lists, headings) are kept
 * together with `break-inside: avoid` / `break-after: avoid`.
 */
export const PRINT_CSS = `
  @page {
    size: A4;
    margin: 0;
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
    break-after: page;
    page-break-after: always;
  }
  .expose-section-title {
    break-after: avoid;
    page-break-after: avoid;
  }
  .expose-fact-table,
  .expose-contact-card,
  .expose-gallery-figure,
  .expose-floorplan-figure,
  .expose-highlights-list,
  .expose-equipment-list {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .expose-documents-list li {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .expose-print footer {
    break-before: auto;
  }
`;
