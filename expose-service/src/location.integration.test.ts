import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getGeocodingProvider,
  getPlacesProvider,
  getRoutingProvider,
  distanceMetersBetween,
  type GeocodingProvider,
  type PlacesProvider,
  type RoutingProvider,
} from './external-services/location.js';
import { createManualLocation, resolveLocation } from './lib/location-service.js';
import type { Property } from './lib/types.js';

const enabled = process.env.RUN_LOCATION_INTEGRATION === '1';
const providersConfigured =
  process.env.GEOCODING_PROVIDER?.toLowerCase() === 'nominatim' &&
  process.env.PLACES_PROVIDER?.toLowerCase() === 'overpass';
const skipReason = !enabled
  ? 'Set RUN_LOCATION_INTEGRATION=1 to enable network integration tests'
  : !providersConfigured
    ? 'Set GEOCODING_PROVIDER=nominatim and PLACES_PROVIDER=overpass to enable real providers'
    : undefined;

const property: Property = {
  id: 'phase4-real-location',
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
      propertySubtype: null,
      title: 'Phase 4 Integration',
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
    },
  } as Property['exposeData'],
};

describe('real location pipeline', { skip: skipReason }, () => {
  it('runs geocoding, real POI search, cache, correction, and map', async () => {
    const previousCategories = process.env.LOCATION_FACILITY_CATEGORIES;
    process.env.LOCATION_FACILITY_CATEGORIES = 'supermarket';
    try {
      const realGeocoder = getGeocodingProvider();
      const realPlaces = getPlacesProvider();
      const realRouting = getRoutingProvider();
      let geocodeCalls = 0;
      let placesCalls = 0;
      let routingCalls = 0;
      const geocoder: GeocodingProvider = {
        geocode: async (address) => {
          geocodeCalls += 1;
          return realGeocoder.geocode(address);
        },
      };
      const places: PlacesProvider = {
        searchNearby: async (latitude, longitude, category, radiusMeters) => {
          placesCalls += 1;
          return realPlaces.searchNearby(latitude, longitude, category, radiusMeters);
        },
      };
      const routing: RoutingProvider = {
        supports: (mode) => realRouting.supports(mode),
        route: async (from, to, mode) => {
          routingCalls += 1;
          return realRouting.route(from, to, mode);
        },
      };

      const first = await resolveLocation(property, { geocoder, places, routing, radiusMeters: 1000 });
      assert.ok(first.intelligence, first.error);
      const location = first.intelligence!;
      assert.equal(location.geocodingProvider, 'nominatim');
      assert.ok(geocodeCalls > 0, 'real geocoder was not called');
      assert.ok(placesCalls > 0, 'real POI provider was not called');
      const facilities = Object.values(location.facilities).flat();
      assert.ok(
        facilities.length > 0,
        'real POI provider returned no facilities for the test address',
      );
      assert.ok(facilities.every((place) => place.source === 'overpass'));
      assert.ok(
        facilities.every(
          (place) =>
            place.distanceMeters ===
            distanceMetersBetween(
              location.coordinates.latitude,
              location.coordinates.longitude,
              place.latitude,
              place.longitude,
            ),
        ),
      );
      assert.ok(location.mapAsset?.url.startsWith('data:image/svg+xml;base64,'));

      if (process.env.ROUTING_PROVIDER?.toLowerCase() === 'osrm') {
        assert.ok(routingCalls > 0, 'real routing provider was not called');
        const routed = Object.values(location.facilities)
          .flat()
          .filter((place) => place.route);
        assert.ok(routed.length > 0, 'no facility received a verified route');
        assert.ok(
          routed.every(
            (place) =>
              place.route!.provider === 'osrm' &&
              place.route!.distanceMeters > 0 &&
              place.route!.durationSeconds > 0,
          ),
          'every route carries provider data',
        );
      }

      const cachedProperty = {
        ...property,
        exposeData: {
          ...property.exposeData!,
          location: { ...property.exposeData!.location, intelligence: location },
        },
      };
      geocodeCalls = 0;
      placesCalls = 0;
      routingCalls = 0;
      const cached = await resolveLocation(cachedProperty, {
        geocoder,
        places,
        routing,
        radiusMeters: 1000,
      });
      assert.equal(cached.intelligence?.generatedAt, location.generatedAt);
      assert.equal(geocodeCalls, 0, 'cached request called geocoder');
      assert.equal(placesCalls, 0, 'cached request called POI provider');
      assert.equal(routingCalls, 0, 'cached request called routing provider');

      const changedProperty = {
        ...cachedProperty,
        exposeData: {
          ...cachedProperty.exposeData!,
          basicInformation: {
            ...cachedProperty.exposeData!.basicInformation,
            address: { ...cachedProperty.exposeData!.basicInformation.address, city: 'Hamburg' },
          },
        },
      };
      let invalidationCalls = 0;
      await resolveLocation(changedProperty, {
        geocoder: {
          geocode: async () => {
            invalidationCalls += 1;
            return {
              ...location.coordinates,
              formattedAddress: 'Changed address',
              provider: 'nominatim',
            };
          },
        },
        places: { searchNearby: async () => [] },
        radiusMeters: 1000,
      });
      assert.equal(invalidationCalls, 1, 'changed address did not invalidate geocoding cache');

      const corrected = {
        latitude: location.coordinates.latitude + 0.001,
        longitude: location.coordinates.longitude + 0.001,
      };
      let correctedCenter: { latitude: number; longitude: number } | undefined;
      const manual = await createManualLocation(property, corrected, {
        places: {
          searchNearby: async (latitude, longitude, category) => [
            {
              id: category,
              name: 'Corrected test place',
              category,
              latitude: latitude + 0.001,
              longitude,
              distanceMeters: 0,
              distanceType: 'straight_line' as const,
              source: 'integration',
            },
          ],
        },
        mapProvider: {
          createStaticMap: async (center) => {
            correctedCenter = center;
            return {
              assetId: 'corrected-map',
              url: 'data:image/svg+xml;base64,PHN2Zy8+',
              mimeType: 'image/svg+xml' as const,
              caption: 'Corrected map',
            };
          },
        },
      });
      assert.equal(manual.source, 'manual');
      assert.deepEqual(manual.coordinates, corrected);
      assert.deepEqual(correctedCenter, corrected);
      const correctedFacilities = Object.values(manual.facilities).flat();
      assert.ok(
        correctedFacilities.every(
          (place) =>
            place.distanceMeters ===
            distanceMetersBetween(
              corrected.latitude,
              corrected.longitude,
              place.latitude,
              place.longitude,
            ),
        ),
      );
    } finally {
      if (previousCategories === undefined) delete process.env.LOCATION_FACILITY_CATEGORIES;
      else process.env.LOCATION_FACILITY_CATEGORIES = previousCategories;
    }
  });
});
