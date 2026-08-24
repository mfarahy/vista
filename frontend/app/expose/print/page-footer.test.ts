import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { translations } from '@/lib/i18n/core';
import { pageFooterTemplate } from './page-footer';
import { PRINT_CSS } from './print-css';

describe('page footer template', () => {
  it('contains the Makler identity, the Vista branding and page placeholders', () => {
    const html = pageFooterTemplate({
      maklerName: 'Frau Müller',
      maklerCompany: 'Immobilien Müller GmbH',
      poweredBy: translations.en.t('expose.pageFooter.poweredBy'),
    });
    assert.ok(html.includes('Frau Müller'));
    assert.ok(html.includes('Immobilien Müller GmbH'));
    assert.ok(html.includes('Powered by Vista'));
    assert.ok(html.includes('class="pageNumber"'));
    assert.ok(html.includes('class="totalPages"'));
    assert.ok(html.includes('/'));
  });

  it('uses the localized powered-by label', () => {
    const de = translations.de.t('expose.pageFooter.poweredBy');
    const html = pageFooterTemplate({ poweredBy: de });
    assert.ok(html.includes(de));
  });

  it('renders without agent data', () => {
    const html = pageFooterTemplate({ poweredBy: 'Powered by Vista' });
    assert.ok(html.includes('Powered by Vista'));
    assert.ok(html.includes('class="pageNumber"'));
    assert.ok(html.includes('class="totalPages"'));
  });

  it('escapes user-controlled Makler data', () => {
    const html = pageFooterTemplate({
      maklerName: '<script>alert(1)</script>',
      maklerCompany: 'A&B "Co"',
      poweredBy: 'Powered by Vista',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('A&amp;B &quot;Co&quot;'));
  });
});

describe('print css', () => {
  it('reserves a bottom page margin for the per-page footer', () => {
    assert.match(PRINT_CSS, /@page \{[^}]*margin: 0 0 18mm 0/);
  });

  it('keeps the cover facts above the footer band in print', () => {
    assert.match(
      PRINT_CSS,
      /@media print \{[^}]*\.expose-cover-copy[^}]*padding-bottom: calc\(18mm \+ 6mm\) !important/,
    );
  });
});

describe('page footer template', () => {
  it('renders an opaque band that hides the full-bleed cover behind it', () => {
    const html = pageFooterTemplate({ poweredBy: 'Powered by Vista' });
    assert.match(html, /background:#ffffff/);
    assert.match(html, /height:100%/);
  });
});