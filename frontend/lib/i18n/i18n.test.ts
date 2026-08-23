import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defaultLocale, isLocale } from './config';
import { translate } from './index';

describe('i18n translate', () => {
  it('defaults to English', () => {
    assert.equal(defaultLocale, 'en');
  });

  it('resolves keys for English and German', () => {
    assert.equal(translate('en', 'landing.newExpose'), 'New Exposé');
    assert.equal(translate('de', 'landing.newExpose'), 'Neues Exposé');
  });

  it('falls back to English for keys missing in German', () => {
    assert.equal(translate('de', 'common.language'), 'Sprache');
    assert.equal(translate('de', 'landing.floorplan3d'), 'Floorplan 3D');
  });

  it('returns the key itself when no translation exists anywhere', () => {
    assert.equal(translate('en', 'missing.section.label'), 'missing.section.label');
    assert.equal(translate('de', 'missing.section.label'), 'missing.section.label');
  });
});

describe('i18n locale validation', () => {
  it('accepts only supported locales', () => {
    assert.equal(isLocale('en'), true);
    assert.equal(isLocale('de'), true);
    assert.equal(isLocale('fr'), false);
    assert.equal(isLocale(null), false);
  });
});
