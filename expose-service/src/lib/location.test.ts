import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addressFromLegacy,
  distanceMetersBetween,
  formatDistance,
  getMapProvider,
  joinGermanList,
  locationSummary,
} from '../external-services/location.js';
import { createManualLocation, resolveLocation } from './location-service.js';
import type { RouteResult, RoutingProvider, TravelMode } from '../external-services/routing.js';
import type { LocationIntelligence, Place } from './expose-data.js';

describe('location services', () => {
  it('normalizes a legacy address into structured fields', () => {
    assert.deepEqual(addressFromLegacy('Furkastrasse 88a', '12107', 'Berlin', 'Marienfelde'), {
      street: 'Furkastrasse',
      houseNumber: '88a',
      postalCode: '12107',
      city: 'Berlin',
      district: 'Marienfelde',
      country: 'Deutschland',
    });
  });

  it('calculates geographic distance and German formatting', () => {
    const distance = distanceMetersBetween(52.52, 13.405, 52.52, 13.415);
    assert.ok(distance > 600 && distance < 800);
    assert.equal(formatDistance(650), '650 m');
    assert.equal(formatDistance(1250), '1,3 km');
  });

  it('preserves provider results, categorizes them, and caches the result', async () => {
    const property = {
      id: 'property-1',
      propertyType: 'apartment',
      transactionType: 'sale',
      address: 'Main Street 1',
      zipCode: '10115',
      city: 'Berlin',
      district: 'Mitte',
      selectedFeatures: [],
      surroundings: {},
      tone: 'professional',
      language: 'de',
      images: [],
      roomsData: [],
      exposeData: {
        basicInformation: {
          propertyType: 'apartment',
          propertySubtype: null,
          title: null,
          address: {
            street: 'Main Street',
            houseNumber: '1',
            postalCode: '10115',
            city: 'Berlin',
            district: 'Mitte',
            country: 'Deutschland',
          },
        },
        location: {
          address: {
            street: 'Main Street',
            houseNumber: '1',
            postalCode: '10115',
            city: 'Berlin',
            district: 'Mitte',
            country: 'Deutschland',
          },
        },
      },
    } as any;
    let geocodeCalls = 0;
    const geocoder = {
      geocode: async () => {
        geocodeCalls += 1;
        return {
          latitude: 52.52,
          longitude: 13.405,
          formattedAddress: 'Main Street 1, Berlin',
          provider: 'mock',
        };
      },
    };
    const places = {
      searchNearby: async (latitude: number, longitude: number, category: any) => [
        {
          id: category,
          name: category,
          category,
          latitude: latitude + 0.001,
          longitude,
          distanceMeters: 0,
          distanceType: 'straight_line' as const,
          source: 'mock',
        },
      ],
    };
    const first = await resolveLocation(property, { geocoder, places, radiusMeters: 500 });
    assert.equal(first.intelligence?.facilities.shopping[0].category, 'supermarket');
    const cachedProperty = {
      ...property,
      exposeData: {
        ...property.exposeData,
        location: { ...property.exposeData.location, intelligence: first.intelligence },
      },
    };
    const second = await resolveLocation(cachedProperty, { geocoder, places, radiusMeters: 500 });
    assert.equal(second.intelligence?.generatedAt, first.intelligence?.generatedAt);
    assert.equal(geocodeCalls, 1);
    const changedProperty = {
      ...cachedProperty,
      exposeData: {
        ...cachedProperty.exposeData,
        basicInformation: {
          ...cachedProperty.exposeData.basicInformation,
          address: { ...cachedProperty.exposeData.basicInformation.address, city: 'Hamburg' },
        },
      },
    };
    await resolveLocation(changedProperty, { geocoder, places, radiusMeters: 500 });
    assert.equal(geocodeCalls, 2);
  });

  it('marks manually corrected coordinates as manual', async () => {
    const property = {
      address: 'Main Street 1',
      zipCode: '10115',
      city: 'Berlin',
      district: null,
      exposeData: {
        basicInformation: {
          address: {
            street: 'Main Street',
            houseNumber: '1',
            postalCode: '10115',
            city: 'Berlin',
            district: null,
            country: 'Deutschland',
          },
        },
      },
    } as any;
    const result = await createManualLocation(
      property,
      { latitude: 52.52, longitude: 13.405 },
      { places: { searchNearby: async () => [] } },
    );
    assert.equal(result.source, 'manual');
    assert.deepEqual(result.coordinates, { latitude: 52.52, longitude: 13.405 });
  });

  it('passes corrected coordinates and markers to the map provider', async () => {
    let mapCenter: { latitude: number; longitude: number } | undefined;
    let mapMarkers: Array<{ latitude: number; longitude: number; label: string }> = [];
    const property = {
      address: 'Main Street 1',
      zipCode: '10115',
      city: 'Berlin',
      district: null,
      exposeData: {
        basicInformation: {
          address: {
            street: 'Main Street',
            houseNumber: '1',
            postalCode: '10115',
            city: 'Berlin',
            district: null,
            country: 'Deutschland',
          },
        },
      },
    } as any;
    const corrected = { latitude: 52.521, longitude: 13.406 };
    const result = await createManualLocation(property, corrected, {
      places: {
        searchNearby: async (latitude, longitude, category) => [
          {
            id: category,
            name: 'Real test place',
            category,
            latitude: latitude + 0.001,
            longitude,
            distanceMeters: 0,
            distanceType: 'straight_line' as const,
            source: 'test',
          },
        ],
      },
      routing: {
        supports: () => true,
        route: async () => route('foot', 120, 90),
      },
      mapProvider: {
        createStaticMap: async (center, markers) => {
          mapCenter = center;
          mapMarkers = markers;
          return {
            assetId: 'test-map',
            url: 'data:image/svg+xml;base64,PHN2Zy8+',
            mimeType: 'image/svg+xml' as const,
            caption: 'Test map',
          };
        },
      },
    });
    assert.deepEqual(mapCenter, corrected);
    assert.equal(mapMarkers[0].label, 'Immobilie');
    assert.equal(mapMarkers[0].latitude, corrected.latitude);
    assert.equal(mapMarkers[0].longitude, corrected.longitude);
    assert.ok(mapMarkers.some((marker) => marker.latitude !== corrected.latitude));
    assert.equal(
      result.facilities.shopping[0].distanceMeters,
      distanceMetersBetween(
        corrected.latitude,
        corrected.longitude,
        corrected.latitude + 0.001,
        corrected.longitude,
      ),
    );
  });

  it('renders coordinate-aware markers in the local fallback map', async () => {
    const provider = getMapProvider();
    const first = await provider.createStaticMap({ latitude: 52.52, longitude: 13.405 }, [
      { latitude: 52.52, longitude: 13.405, label: 'Immobilie', category: 'property' },
    ]);
    const second = await provider.createStaticMap({ latitude: 52.52, longitude: 13.405 }, [
      { latitude: 52.521, longitude: 13.405, label: 'Schule', category: 'school' },
    ]);
    const decode = (url: string) => Buffer.from(url.split(',', 2)[1], 'base64').toString('utf8');
    const firstSvg = decode(first.url);
    const secondSvg = decode(second.url);
    assert.match(firstSvg, /Immobilie/);
    assert.match(secondSvg, /Schule/);
    assert.notEqual(firstSvg, secondSvg);
  });
});

function route(mode: TravelMode, distanceMeters: number, durationSeconds: number): RouteResult {
  return { distanceMeters, durationSeconds, travelMode: mode, provider: 'test' };
}

function routingWith(routes: Partial<Record<TravelMode, RouteResult | Error>>): RoutingProvider {
  return {
    supports: (mode) => mode !== 'transit',
    route: async (_from, _to, mode) => {
      const result = routes[mode];
      if (result instanceof Error) throw result;
      if (!result) throw new Error(`unexpected mode ${mode}`);
      return result;
    },
  };
}

function placesWith(categoryResults: Record<string, unknown>) {
  return {
    searchNearby: async (latitude: number, longitude: number, category: string) => {
      const result = categoryResults[category];
      if (result instanceof Error) throw result;
      if (Array.isArray(result)) return result;
      return [
        {
          id: category,
          name: `${category} place`,
          category,
          latitude: latitude + 0.001,
          longitude,
          distanceMeters: 0,
          distanceType: 'straight_line' as const,
          source: 'mock',
        },
      ];
    },
  };
}

const routedProperty = {
  address: 'Main Street 1',
  zipCode: '10115',
  city: 'Berlin',
  district: null,
  exposeData: {
    basicInformation: {
      address: {
        street: 'Main Street',
        houseNumber: '1',
        postalCode: '10115',
        city: 'Berlin',
        district: null,
        country: 'Deutschland',
      },
    },
    location: {
      address: {
        street: 'Main Street',
        houseNumber: '1',
        postalCode: '10115',
        city: 'Berlin',
        district: null,
        country: 'Deutschland',
      },
    },
  },
} as unknown as Parameters<typeof createManualLocation>[0];

describe('nearby facility routing', () => {
  it('attaches a verified route to the nearest facility of each category', async () => {
    const intelligence = await createManualLocation(routedProperty, { latitude: 52.52, longitude: 13.405 }, {
      places: placesWith({}),
      routing: routingWith({ foot: route('foot', 120, 90) }),
      mapProvider: {
        createStaticMap: async () => ({
          assetId: 'm',
          url: 'data:image/svg+xml;base64,',
          mimeType: 'image/svg+xml' as const,
          caption: 'm',
        }),
      },
    });
    const supermarket = intelligence.facilities.shopping.find(
      (place) => place.category === 'supermarket',
    );
    const kindergarten = intelligence.facilities.education.find(
      (place) => place.category === 'kindergarten',
    );
    assert.deepEqual(supermarket?.route, route('foot', 120, 90));
    assert.deepEqual(kindergarten?.route, route('foot', 120, 90));
  });

  it('only routes the closest candidate when several share a category', async () => {
    const intelligence = await createManualLocation(routedProperty, { latitude: 52.52, longitude: 13.405 }, {
      places: {
        searchNearby: async (latitude: number, longitude: number, category: string) => {
          if (category !== 'supermarket') return [];
          return [
            {
              id: 'supermarket-far',
              name: 'Far market',
              category,
              latitude: latitude + 0.05,
              longitude,
              distanceMeters: 0,
              distanceType: 'straight_line' as const,
              source: 'mock',
            },
            {
              id: 'supermarket-near',
              name: 'Near market',
              category,
              latitude: latitude + 0.001,
              longitude,
              distanceMeters: 0,
              distanceType: 'straight_line' as const,
              source: 'mock',
            },
          ];
        },
      },
      routing: {
        supports: () => true,
        route: async () => route('foot', 111, 80),
      },
      mapProvider: {
        createStaticMap: async () => ({
          assetId: 'm',
          url: 'data:image/svg+xml;base64,',
          mimeType: 'image/svg+xml' as const,
          caption: 'm',
        }),
      },
    });
    const facilities = intelligence.facilities.shopping;
    const routed = facilities.filter((place) => place.route);
    assert.equal(routed.length, 1);
    assert.equal(routed[0]?.id, 'supermarket-near');
  });

  it('skips a facility when routing fails instead of fabricating a route', async () => {
    const intelligence = await createManualLocation(routedProperty, { latitude: 52.52, longitude: 13.405 }, {
      places: placesWith({}),
      routing: routingWith({ foot: new Error('routing down'), car: new Error('routing down') }),
      mapProvider: {
        createStaticMap: async () => ({
          assetId: 'm',
          url: 'data:image/svg+xml;base64,',
          mimeType: 'image/svg+xml' as const,
          caption: 'm',
        }),
      },
    });
    const all = Object.values(intelligence.facilities).flat();
    assert.ok(all.length > 0, 'facilities still exist without routes');
    assert.ok(all.every((place) => place.route === undefined), 'no place carries a fake route');
    assert.equal(intelligence.mapAsset?.url.startsWith('data:image/svg+xml;base64,'), true);
  });

  it('keeps resolution alive when one places category fails', async () => {
    const intelligence = await createManualLocation(routedProperty, { latitude: 52.52, longitude: 13.405 }, {
      places: placesWith({ school: new Error('overpass rate limit') }),
      routing: routingWith({ foot: route('foot', 120, 90) }),
      mapProvider: {
        createStaticMap: async () => ({
          assetId: 'm',
          url: 'data:image/svg+xml;base64,',
          mimeType: 'image/svg+xml' as const,
          caption: 'm',
        }),
      },
    });
    assert.ok(
      intelligence.facilities.shopping.some((place) => place.category === 'supermarket'),
      'healthy categories are still resolved',
    );
    assert.equal(
      intelligence.facilities.education.some((place) => place.category === 'school'),
      false,
      'failed category is skipped',
    );
    assert.ok(
      intelligence.facilities.education.some((place) => place.category === 'kindergarten'),
      'other categories of the same group are unaffected',
    );
  });

  it('continues without a map when the map provider fails', async () => {
    const intelligence = await createManualLocation(routedProperty, { latitude: 52.52, longitude: 13.405 }, {
      places: placesWith({}),
      routing: routingWith({ foot: route('foot', 120, 90) }),
      mapProvider: {
        createStaticMap: async () => {
          throw new Error('map service down');
        },
      },
    });
    assert.ok(intelligence.facilities.shopping.length > 0);
    assert.equal(intelligence.mapAsset, undefined);
  });

  it('returns an error for missing coordinates instead of failing silently', async () => {
    const property = {
      id: 'no-coords',
      propertyType: 'apartment',
      transactionType: 'sale',
      selectedFeatures: [],
      surroundings: {},
      tone: 'professional',
      language: 'de',
      images: [],
      roomsData: [],
      exposeData: {
        basicInformation: { address: { country: 'Deutschland' } },
        location: { address: { country: 'Deutschland' } },
      },
    } as unknown as Parameters<typeof resolveLocation>[0];
    const result = await resolveLocation(property, {
      geocoder: {
        geocode: async () => {
          throw new Error('no address');
        },
      },
    });
    assert.equal(result.intelligence, null);
    assert.ok(result.error);
  });
});

describe('location summary (verified data only)', () => {
  function facilitiesWith(
    overrides: Partial<
      Record<keyof LocationIntelligence['facilities'], Array<Partial<Place>>>
    > = {},
  ): LocationIntelligence['facilities'] {
    const empty = {
      shopping: [],
      education: [],
      transport: [],
      healthcare: [],
      recreation: [],
      dailyLife: [],
    };
    return { ...empty, ...overrides } as LocationIntelligence['facilities'];
  }

  it('mentions only walking-reachable categories as fußläufig', () => {
    const summary = locationSummary({
      city: 'Berlin',
      district: 'Neukölln',
      facilities: facilitiesWith({
        shopping: [
          { category: 'supermarket', route: route('foot', 650, 480) },
          { category: 'supermarket', route: undefined },
        ],
        education: [
          { category: 'kindergarten', route: route('bike', 900, 240) },
        ],
        transport: [
          { category: 'train_station', route: route('foot', 1400, 1100) },
        ],
      }),
    });
    assert.equal(
      summary,
      'Die Immobilie befindet sich in Berlin, Neukölln. Einkaufsmöglichkeiten und öffentliche Verkehrsmittel sind fußläufig erreichbar.',
    );
  });

  it('ignores facilities without a route entirely', () => {
    const summary = locationSummary({
      city: 'Berlin',
      facilities: facilitiesWith({
        shopping: [{ category: 'supermarket', route: undefined }],
        healthcare: [{ category: 'hospital', route: undefined }],
      }),
    });
    assert.equal(summary, 'Die Immobilie befindet sich in Berlin.');
  });

  it('mentions verified groups when nothing is walkable', () => {
    const summary = locationSummary({
      city: 'Berlin',
      facilities: facilitiesWith({
        transport: [{ category: 'bus_stop', route: route('bike', 1600, 420) }],
        healthcare: [{ category: 'hospital', route: route('car', 4800, 660) }],
      }),
    });
    assert.equal(
      summary,
      'Die Immobilie befindet sich in Berlin. Öffentliche Verkehrsmittel und Gesundheitsversorgung sind in der ausgewählten Umgebung vertreten.',
    );
  });

  it('does not call a long foot route walkable', () => {
    const summary = locationSummary({
      city: 'Berlin',
      facilities: facilitiesWith({
        shopping: [{ category: 'supermarket', route: route('foot', 1400, 2000) }],
      }),
    });
    assert.ok(!summary.includes('fußläufig'));
  });

  it('joins German lists with und', () => {
    assert.equal(joinGermanList(['A']), 'A');
    assert.equal(joinGermanList(['A', 'B']), 'A und B');
    assert.equal(joinGermanList(['A', 'B', 'C']), 'A, B und C');
    assert.equal(joinGermanList([]), '');
  });
});
