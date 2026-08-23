import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLocationResearchQueries,
  researchLocation,
  validateLocationResearch,
  type LocationResearchProvider,
} from './location-research-agent.js';
import { clearLocationResearchCache } from '../../lib/location-research-cache.js';

const input = {
  propertyId: 'test-property',
  address: 'Weserstraße 42',
  city: 'Berlin',
  district: 'Neukölln',
  neighborhood: 'Reuterkiez',
  postalCode: '12045',
  country: 'Germany',
  latitude: 52.48,
  longitude: 13.43,
  locationIntelligence: {
    coordinates: { latitude: 52.48, longitude: 13.43 },
    facilities: { transport: [{ name: 'Station', category: 'subway', distanceMeters: 350 }] },
  },
};

function provider(counter: { searches: number; extracts: number }): LocationResearchProvider {
  return {
    async search({ query }) {
      counter.searches += 1;
      return {
        results: [
          {
            title: `Quelle für ${query}`,
            url: 'https://www.berlin.de/bezirk/',
            content:
              'Der Bezirk beschreibt das recherchierte Umfeld mit öffentlichen Informationen.',
            score: 0.9,
          },
          {
            title: 'Duplikat',
            url: 'https://www.berlin.de/bezirk/',
            content: 'Doppelte Quelle mit gleichem Inhalt.',
            score: 0.4,
          },
        ],
      };
    },
    async extract({ urls }) {
      counter.extracts += 1;
      return {
        results: urls.map((url) => ({
          url,
          rawContent: 'Der offizielle Inhalt bestätigt den lokalen Sachverhalt.',
        })),
      };
    },
  };
}

describe('location research', () => {
  it('builds focused, privacy-preserving German-area queries', () => {
    const queries = buildLocationResearchQueries(input);
    assert.equal(queries.length, 6);
    assert.ok(queries.every((item) => item.query.includes('Berlin')));
    assert.ok(
      queries
        .filter((item) => item.category !== 'makrolage')
        .every((item) => item.query.includes('Reuterkiez')),
    );
    assert.ok(
      queries.every((item) => !item.query.includes('Weserstraße') && !item.query.includes('42')),
    );
  });

  it('preserves and deduplicates source URLs and keeps deterministic data separate', async () => {
    clearLocationResearchCache();
    const counter = { searches: 0, extracts: 0 };
    const research = await researchLocation(input, { provider: provider(counter) });
    assert.equal(counter.searches, 6);
    assert.equal(counter.extracts, 1);
    assert.equal(research.sources.length, 1);
    assert.equal(research.sources[0].url, 'https://www.berlin.de/bezirk/');
    assert.ok(research.mikrolage.claims.every((claim) => claim.sources.length > 0));
    assert.deepEqual(input.locationIntelligence?.coordinates, {
      latitude: 52.48,
      longitude: 13.43,
    });
    assert.ok(
      research.infrastructure.transport.every((claim) => !claim.statement.match(/\b\d+\s*m\b/)),
    );
    assert.doesNotThrow(() => validateLocationResearch(research));
  });

  it('uses the independent research cache', async () => {
    clearLocationResearchCache();
    const counter = { searches: 0, extracts: 0 };
    await researchLocation(input, { provider: provider(counter) });
    await researchLocation(input, { provider: provider(counter) });
    assert.equal(counter.searches, 6);
  });

  it('does not require a Tavily key when the provider is unavailable, allowing workflow fallback', async () => {
    clearLocationResearchCache();
    const previous = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    await assert.rejects(() => researchLocation(input), /TAVILY_API_KEY/);
    if (previous) process.env.TAVILY_API_KEY = previous;
  });

  it('drops claims about a different district and keeps city-wide facts', async () => {
    clearLocationResearchCache();
    const wrongDistrictProvider: LocationResearchProvider = {
      async search() {
        return {
          results: [
            {
              title: 'Quelle für die falsche Gegend',
              url: 'https://www.berlin.de/prenzlauer-berg/',
              content:
                'Prenzlauer Berg bietet zahlreiche Cafés, Restaurants und ein lebendiges kulturelles Angebot für die ganze Familie.',
              score: 0.9,
            },
            {
              title: 'Stadtweite Quelle',
              url: 'https://www.berlin.de/verkehr/',
              content:
                'Berlin verfügt über ein dichtes U-Bahn- und S-Bahn-Netz, das alle Stadtteile miteinander verbindet.',
              score: 0.8,
            },
          ],
        };
      },
      async extract() {
        return { results: [] };
      },
    };
    const research = await researchLocation(input, { provider: wrongDistrictProvider });
    const allClaims = [
      ...research.mikrolage.claims,
      ...research.makrolage.claims,
      ...Object.values(research.infrastructure).flat(),
    ];
    assert.ok(
      allClaims.every((claim) => !claim.statement.includes('Prenzlauer Berg')),
      'claims about a different district must be filtered out',
    );
    assert.ok(
      allClaims.some((claim) => claim.statement.includes('U-Bahn')),
      'city-wide claims stay available',
    );
  });
});
