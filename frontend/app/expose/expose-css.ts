/**
 * Exposé document stylesheet (Phase 6).
 *
 * The single source of styling for the `ModernExposeTemplate` — used by the
 * Builder live preview, the print route, and the review preview page. The
 * Exposé is a professional German real-estate brochure: restrained palette,
 * serif headings, hairline rules, and clean fact presentation. It must never
 * look like the Builder SaaS interface; all Builder UI lives outside this
 * stylesheet.
 *
 * Colors are centralized as design tokens scoped to the document, so the
 * palette is defined once and reused everywhere.
 */
export const EXPOSE_CSS = `
  .expose-doc {
    --expose-ink: #26302a;
    --expose-ink-soft: #57625a;
    --expose-muted: #8a948c;
    --expose-line: #e2e7e2;
    --expose-accent: #24352c;
    --expose-accent-soft: #3c5a4a;
    --expose-surface: #f4f6f4;
    --expose-paper: #ffffff;
    background: var(--expose-paper);
    color: var(--expose-ink);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13.5px;
    line-height: 1.65;
  }

  /* ---------- Cover ---------- */

  .expose-cover {
    min-height: 1123px;
    display: flex;
    flex-direction: column;
    background: var(--expose-accent);
    color: #f8f8f4;
  }
  .expose-cover-hero {
    position: relative;
    height: 470px;
    flex: 0 0 auto;
    background: #d9e0d9;
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
    background: linear-gradient(180deg, rgba(20, 30, 24, 0.1) 0%, rgba(20, 30, 24, 0.25) 55%, rgba(20, 30, 24, 0.65) 100%);
  }
  .expose-cover-hero-empty {
    display: grid;
    place-items: center;
    color: var(--expose-muted);
    font-size: 13px;
  }
  .expose-cover-noimage {
    color: rgba(255, 255, 255, 0.75);
    font-size: 13px;
    letter-spacing: 0.08em;
  }
  .expose-cover-brand {
    position: absolute;
    top: 26px;
    left: 56px;
    z-index: 1;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.42em;
  }
  .expose-cover-copy {
    flex: 1;
    padding: 42px 56px 44px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .expose-kicker {
    margin: 0 0 10px;
    color: var(--expose-muted);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .expose-cover .expose-kicker {
    color: #a9bbab;
  }
  .expose-cover-title {
    margin: 0;
    max-width: 600px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 36px;
    font-weight: 400;
    line-height: 1.14;
    letter-spacing: 0.1px;
  }
  .expose-cover-subtitle {
    margin: 10px 0 0;
    max-width: 560px;
    color: #c9d4ca;
    font-size: 15px;
    line-height: 1.5;
  }
  .expose-cover-location {
    margin: 14px 0 0;
    color: #a9bbab;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .expose-cover-price {
    margin-top: 30px;
    border-top: 1px solid rgba(255, 255, 255, 0.22);
    padding-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .expose-price-label {
    color: #a9bbab;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .expose-price-value {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 34px;
    font-weight: 400;
    line-height: 1.1;
  }
  .expose-price-meta {
    color: #c9d4ca;
    font-size: 12.5px;
  }
  .expose-cover-facts {
    margin-top: auto;
    padding-top: 26px;
    display: flex;
    flex-wrap: wrap;
    gap: 20px 52px;
    border-top: 1px solid rgba(255, 255, 255, 0.22);
    width: 100%;
  }
  .expose-cover-fact {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .expose-cover-fact-label {
    color: #a9bbab;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .expose-cover-fact-value {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 19px;
    line-height: 1.2;
  }

  /* ---------- Sections ---------- */

  .expose-section {
    padding: 46px 56px 50px;
    break-inside: auto;
  }
  .expose-section-header {
    margin-bottom: 30px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--expose-line);
    break-after: avoid;
  }
  .expose-section-kicker {
    margin: 0 0 5px;
    color: var(--expose-muted);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .expose-section-title {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 25px;
    font-weight: 400;
    line-height: 1.2;
    color: var(--expose-ink);
    break-after: avoid;
  }

  /* ---------- Facts ---------- */

  .expose-fact-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid var(--expose-line);
  }
  .expose-fact {
    padding: 13px 0 15px;
    border-top: 1px solid var(--expose-line);
    break-inside: avoid;
  }
  .expose-fact:nth-child(even) {
    padding-left: 38px;
    border-left: 1px solid var(--expose-line);
  }
  .expose-fact:nth-child(odd) {
    padding-right: 38px;
  }
  .expose-fact-label {
    display: block;
    color: var(--expose-muted);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .expose-fact-value {
    display: block;
    font-size: 15.5px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--expose-ink);
  }

  /* ---------- Highlights ---------- */

  .expose-highlights {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 13px 44px;
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
    color: var(--expose-ink-soft);
    break-inside: avoid;
  }
  .expose-highlight::before {
    content: "";
    flex: 0 0 22px;
    align-self: flex-start;
    height: 1.5px;
    margin-top: 9px;
    background: var(--expose-accent-soft);
  }

  /* ---------- Prose ---------- */

  .expose-prose {
    max-width: 660px;
    color: var(--expose-ink-soft);
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
    padding: 8px 0;
    border-top: 1px solid var(--expose-line);
    font-size: 13.5px;
    color: var(--expose-ink-soft);
    break-inside: avoid;
  }
  .expose-equipment-item::before {
    content: "•";
    color: var(--expose-accent-soft);
    font-weight: 700;
  }

  /* ---------- Location ---------- */

  .expose-location-address {
    margin: 0 0 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--expose-ink);
  }

  /* ---------- Energy ---------- */

  .expose-energy-scale {
    display: flex;
    gap: 5px;
    margin-top: 24px;
  }
  .expose-energy-scale span {
    flex: 1;
    padding: 6px 0 7px;
    text-align: center;
    color: #ffffff;
    font-size: 10.5px;
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
    outline: 2px solid var(--expose-ink);
    outline-offset: 2px;
  }
  .expose-energy-caption {
    margin: 9px 0 0;
    color: var(--expose-muted);
    font-size: 10.5px;
    letter-spacing: 0.4px;
  }

  /* ---------- Gallery ---------- */

  .expose-gallery {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px 22px;
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
    background: var(--expose-surface);
  }
  .expose-figure-caption {
    margin: 8px 0 0;
    color: var(--expose-muted);
    font-size: 10.5px;
    letter-spacing: 0.3px;
  }

  /* ---------- Floorplans ---------- */

  .expose-floorplans {
    display: flex;
    flex-direction: column;
    gap: 34px;
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
    background: var(--expose-surface);
    border: 1px solid var(--expose-line);
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
    border-top: 1px solid var(--expose-line);
    font-size: 13.5px;
    color: var(--expose-ink-soft);
    break-inside: avoid;
  }
  .expose-document-row:last-child {
    border-bottom: 1px solid var(--expose-line);
  }
  .expose-document-name {
    font-weight: 500;
    color: var(--expose-ink);
  }
  .expose-document-type {
    color: var(--expose-muted);
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  /* ---------- Contact ---------- */

  .expose-contact {
    max-width: 430px;
    border-top: 2px solid var(--expose-accent);
    padding-top: 22px;
  }
  .expose-contact-name {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 22px;
    font-weight: 400;
    color: var(--expose-ink);
  }
  .expose-contact-company {
    margin: 3px 0 0;
    font-size: 13.5px;
    color: var(--expose-muted);
  }
  .expose-contact-address {
    margin: 14px 0 0;
    font-size: 13px;
    color: var(--expose-ink-soft);
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
    color: var(--expose-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding-top: 2px;
  }
  .expose-contact-channel-value {
    color: var(--expose-ink-soft);
    word-break: break-word;
  }

  /* ---------- Footer ---------- */

  .expose-footer {
    padding: 20px 56px 26px;
    border-top: 1px solid var(--expose-line);
    text-align: center;
    color: var(--expose-muted);
    font-size: 10px;
    letter-spacing: 0.08em;
  }
`;