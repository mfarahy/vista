import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  claimLocationRelevance,
  filterClaimsForLocation,
  normalizeLocationName,
  type LocationContext,
} from './location-relevance.js';

const neukoelln: LocationContext = {
  district: 'Neukölln',
  city: 'Berlin',
  postalCode: '12045',
};

describe('claimLocationRelevance', () => {
  it('accepts a claim about the property district', () => {
    assert.equal(
      claimLocationRelevance('Neukölln verfügt über eine gute Infrastruktur.', neukoelln),
      'relevant',
    );
  });

  it('rejects a claim about a different district', () => {
    assert.equal(
      claimLocationRelevance('Prenzlauer Berg bietet viele Cafés und Restaurants.', neukoelln),
      'irrelevant',
    );
  });

  it('rejects other-district claims even when the city is mentioned', () => {
    assert.equal(
      claimLocationRelevance('In Prenzlauer Berg steigen die Mietpreise in Berlin.', neukoelln),
      'irrelevant',
    );
  });

  it('accepts a city-wide fact without the district name', () => {
    assert.equal(
      claimLocationRelevance('Berlin verfügt über ein dichtes U-Bahn-Netz.', neukoelln),
      'relevant',
    );
  });

  it('accepts a claim that references the property postal code', () => {
    assert.equal(
      claimLocationRelevance('Im Umfeld der 12045 gibt es mehrere Supermärkte.', neukoelln),
      'relevant',
    );
  });

  it('accepts a city-wide fact that additionally names another district', () => {
    assert.equal(
      claimLocationRelevance(
        'Das Berliner U-Bahn-Netz verbindet alle Bezirke, auch Prenzlauer Berg.',
        neukoelln,
      ),
      'relevant',
    );
  });

  it('does not reject a claim merely because the district name is absent', () => {
    assert.equal(
      claimLocationRelevance('Die Infrastruktur im Umfeld ist gut ausgebaut.', neukoelln),
      'relevant',
    );
  });

  it('matches the district without confusing similar words', () => {
    assert.equal(claimLocationRelevance('Der Mietpreis steigt mitten in der Stadt.', neukoelln), 'relevant');
    assert.equal(claimLocationRelevance('Lichtenberg hat ein neues Freibad.', neukoelln), 'irrelevant');
    assert.equal(claimLocationRelevance('Mariendorf und Marienfelde liegen im Süden.', neukoelln), 'irrelevant');
  });

  it('normalizes umlauts for matching', () => {
    assert.equal(normalizeLocationName('Köpenick'), 'koepenick');
    assert.equal(normalizeLocationName('Müggelsee'), 'mueggelsee');
  });

  it('applies the neighborhood before the district', () => {
    assert.equal(
      claimLocationRelevance('Der Reuterkiez ist sehr lebendig.', {
        district: 'Neukölln',
        neighborhood: 'Reuterkiez',
        city: 'Berlin',
      }),
      'relevant',
    );
  });

  it('keeps claims with no location context', () => {
    assert.equal(claimLocationRelevance('Ein guter Standort für Familien.', {}), 'relevant');
  });

  it('filters claims deterministically without touching city-wide statements', () => {
    const claims = [
      { statement: 'Neukölln verfügt über viele Parks.' },
      { statement: 'Prenzlauer Berg bietet viele Cafés.' },
      { statement: 'Berlin hat ein dichtes U-Bahn-Netz.' },
      { statement: 'Die Gegend ist gut angebunden.' },
    ];
    const kept = filterClaimsForLocation(claims, neukoelln);
    assert.deepEqual(
      kept.map((claim) => claim.statement),
      [
        'Neukölln verfügt über viele Parks.',
        'Berlin hat ein dichtes U-Bahn-Netz.',
        'Die Gegend ist gut angebunden.',
      ],
    );
  });
});