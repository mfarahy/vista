import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EXPOSE_SECTION_TYPES,
  EXPOSE_TEMPLATE_IDS,
  defaultExposeConfiguration,
  defaultExposeSections,
  exposeBrandingSchema,
  exposeConfigurationSchema,
  exposeContentOverridesSchema,
  exposeSectionSchema,
} from './expose-configuration.js';

describe('expose configuration model', () => {
  it('defaults to the modern template with every section visible', () => {
    const configuration = defaultExposeConfiguration();
    assert.equal(configuration.template, 'modern');
    assert.deepEqual(
      configuration.sections.map((section) => section.type),
      EXPOSE_SECTION_TYPES,
    );
    assert.ok(configuration.sections.every((section) => section.visible));
    assert.equal(configuration.selectedCoverImageId, undefined);
    assert.equal(configuration.galleryImageIds, undefined);
    assert.equal(configuration.contentOverrides, undefined);
    assert.equal(configuration.branding, undefined);
  });

  it('registers all three templates with modern as the default', () => {
    assert.deepEqual(EXPOSE_TEMPLATE_IDS, ['modern', 'classic', 'elegant']);
    for (const template of EXPOSE_TEMPLATE_IDS) {
      const parsed = exposeConfigurationSchema.parse({
        template,
        sections: defaultExposeSections(),
      });
      assert.equal(parsed.template, template);
    }
  });

  it('accepts configurations persisted before the template concept', () => {
    const parsed = exposeConfigurationSchema.parse({ sections: defaultExposeSections() });
    assert.equal(parsed.template, 'modern');
  });

  it('default sections have stable ids matching their type', () => {
    for (const section of defaultExposeSections()) {
      assert.equal(section.id, section.type);
    }
  });

  it('validates a persisted configuration round trip', () => {
    const configuration = {
      template: 'modern',
      sections: [
        { id: 'cover', type: 'cover', visible: true },
        { id: 'gallery', type: 'gallery', visible: false },
      ],
      selectedCoverImageId: 'img-1',
      galleryImageIds: ['img-1', 'img-2'],
      contentOverrides: { title: 'Eigener Titel', highlights: ['Garten'] },
    } as const;
    const parsed = exposeConfigurationSchema.parse(configuration);
    assert.deepEqual(parsed, configuration);
  });

  it('rejects unknown templates and section types', () => {
    assert.throws(() => exposeConfigurationSchema.parse({ template: 'luxury' }));
    assert.throws(() =>
      exposeConfigurationSchema.parse({
        template: 'modern',
        sections: [{ id: 'x', type: 'unknown', visible: true }],
      }),
    );
  });

  it('validates branding with optional fields and empty-string clearances', () => {
    const parsed = exposeBrandingSchema.parse({
      companyName: 'Muster Immobilien GmbH',
      logoUrl: 'https://example.com/logo.png',
      phone: '+49 30 123456',
      email: 'kontakt@example.com',
      website: 'https://www.example.com',
    });
    assert.equal(parsed.companyName, 'Muster Immobilien GmbH');
    assert.equal(parsed.logoUrl, 'https://example.com/logo.png');
    assert.equal(parsed.phone, '+49 30 123456');
    assert.equal(parsed.email, 'kontakt@example.com');
    assert.equal(parsed.website, 'https://www.example.com');
  });

  it('accepts an empty branding object and empty-string email/website clearances', () => {
    assert.deepEqual(exposeBrandingSchema.parse({}), {});
    const parsed = exposeBrandingSchema.parse({ email: '', website: '' });
    assert.equal(parsed.email, '');
    assert.equal(parsed.website, '');
  });

  it('rejects invalid branding values and unknown branding keys', () => {
    assert.throws(() => exposeBrandingSchema.parse({ email: 'keine-mail' }));
    assert.throws(() => exposeBrandingSchema.parse({ website: 'javascript:alert(1)' }));
    assert.throws(() => exposeBrandingSchema.parse({ madeUpField: 'x' }));
    // logoUrl is a plain string; unsafe schemes are rejected at render time.
    assert.equal(exposeBrandingSchema.parse({ logoUrl: 'javascript:alert(1)' }).logoUrl, 'javascript:alert(1)');
  });

  it('persists branding inside a full configuration round trip', () => {
    const configuration = {
      template: 'classic',
      sections: defaultExposeSections(),
      branding: { companyName: 'Vista Premium' },
    } as const;
    const parsed = exposeConfigurationSchema.parse(configuration);
    assert.equal(parsed.template, 'classic');
    assert.equal(parsed.branding?.companyName, 'Vista Premium');
  });

  it('rejects duplicate or missing sections', () => {
    assert.throws(() =>
      exposeConfigurationSchema.parse({
        template: 'modern',
        sections: [],
      }),
    );
    assert.throws(() =>
      exposeConfigurationSchema.parse({
        template: 'modern',
        sections: [
          { id: 'a', type: 'cover', visible: true },
          { id: 'a', type: 'gallery', visible: true },
        ],
      }),
    );
  });

  it('rejects unknown override keys to keep the persisted shape stable', () => {
    assert.throws(() =>
      exposeContentOverridesSchema.parse({ title: 'T', madeUpField: 'x' }),
    );
  });

  it('accepts an empty override set', () => {
    const parsed = exposeContentOverridesSchema.parse({});
    assert.deepEqual(parsed, {});
  });

  it('validates a single section', () => {
    assert.deepEqual(exposeSectionSchema.parse({ id: 'facts', type: 'facts', visible: false }), {
      id: 'facts',
      type: 'facts',
      visible: false,
    });
  });
});