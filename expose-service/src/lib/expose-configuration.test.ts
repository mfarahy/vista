import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EXPOSE_SECTION_TYPES,
  defaultExposeConfiguration,
  defaultExposeSections,
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