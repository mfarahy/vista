import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  exposePdfSettings,
  frontendBaseUrl,
  pdfFileName,
  printRouteUrl,
  sanitizePdfBaseName,
} from './pdf.js';
import type { Property } from '../lib/types.js';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: '26ea5ad9-2e43-4cd8-9c77-57395183804b',
    propertyType: 'apartment',
    transactionType: 'sale',
    address: 'Weserstraße 42',
    zipCode: '12045',
    city: 'Berlin',
    district: 'Neukölln',
    selectedFeatures: [],
    surroundings: {},
    tone: 'professional',
    language: 'de',
    images: [],
    roomsData: [],
    exposeData: {
      basicInformation: {
        propertyType: 'apartment',
        address: {
          street: 'Weserstraße',
          houseNumber: '42',
          postalCode: '12045',
          city: 'Berlin',
          district: 'Neukölln',
          country: 'Deutschland',
        },
      },
      location: {
        address: {
          street: 'Weserstraße',
          houseNumber: '42',
          postalCode: '12045',
          city: 'Berlin',
          district: 'Neukölln',
          country: 'Deutschland',
        },
        district: 'Neukölln',
      },
    } as Property['exposeData'],
    ...overrides,
  };
}

describe('pdf filename', () => {
  it('builds an address-based Exposé filename with German characters preserved', () => {
    assert.equal(pdfFileName(makeProperty()), 'Expose_Weserstraße_42.pdf');
  });

  it('falls back to the property id when no address exists', () => {
    const property = makeProperty({ exposeData: undefined, address: null, city: null });
    assert.equal(pdfFileName(property), `Expose_${property.id}.pdf`);
  });

  it('sanitizes user-controlled address data away from path separators and control characters', () => {
    const property = makeProperty({
      exposeData: undefined,
      address: '..\\..\\etc\\passwd; rm -rf /',
    } as Partial<Property>);
    const name = pdfFileName(property);
    assert.ok(!name.includes('\\'));
    assert.ok(!name.includes('/'));
    assert.ok(!name.includes(';'));
    assert.ok(!name.includes(' '));
    assert.ok(name.endsWith('.pdf'));
    assert.match(name, /^Expose_[a-zA-Z0-9_-]+\.pdf$/);
  });

  it('collapses separators and trims the base name', () => {
    assert.equal(sanitizePdfBaseName('  Expose___Furkastraße--88A  '), 'Expose_Furkastraße-88A');
    assert.equal(sanitizePdfBaseName('a<b>c"d\'e'), 'a_b_c_d_e');
  });

  it('caps the base name length and never returns an empty name', () => {
    const long = 'x'.repeat(500);
    assert.equal(sanitizePdfBaseName(long).length, 120);
    assert.equal(sanitizePdfBaseName('///'), 'Expose');
    assert.equal(sanitizePdfBaseName(''), 'Expose');
  });
});

describe('expose pdf settings', () => {
  it('draws the per-page footer when the print route provides a template', () => {
    const settings = exposePdfSettings('<div>Frau Müller</div>');
    assert.equal(settings.format, 'A4');
    assert.equal(settings.printBackground, true);
    assert.equal(settings.preferCSSPageSize, true);
    assert.equal(settings.displayHeaderFooter, true);
    assert.equal(settings.footerTemplate, '<div>Frau Müller</div>');
    assert.equal(settings.headerTemplate, '<span></span>');
  });

  it('disables the footer when the print route provides no template', () => {
    const settings = exposePdfSettings('   ');
    assert.equal(settings.displayHeaderFooter, false);
    assert.equal(settings.footerTemplate, undefined);
  });
});

describe('pdf print route', () => {
  it('always navigates to the internal print route for the given property id', () => {
    assert.equal(printRouteUrl('abc-123'), `${frontendBaseUrl()}/expose/print/abc-123`);
  });

  it('never accepts external URLs as a rendering target', () => {
    const malicious = 'https://evil.example/x?y=1';
    const route = printRouteUrl(malicious);
    assert.ok(route.startsWith(`${frontendBaseUrl()}/expose/print/`));
    const suffix = route.slice(`${frontendBaseUrl()}/expose/print/`.length);
    assert.ok(!suffix.includes('/'), 'the property id must stay a single path segment');
    assert.ok(!suffix.includes('?'), 'no query string may reach the print route');
    assert.equal(suffix, encodeURIComponent(malicious));
  });

  it('uses the configured frontend URL without trailing slashes', () => {
    const previous = process.env.FRONTEND_URL;
    try {
      process.env.FRONTEND_URL = 'https://vista.example.com/';
      assert.equal(frontendBaseUrl(), 'https://vista.example.com');
      assert.equal(printRouteUrl('p-1'), 'https://vista.example.com/expose/print/p-1');
    } finally {
      if (previous === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previous;
    }
  });
});
