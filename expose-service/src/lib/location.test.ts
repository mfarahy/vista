import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addressFromLegacy,
  distanceMetersBetween,
  formatDistance,
  getMapProvider,
} from '../external-services/location.js';
import { createManualLocation, resolveLocation } from './location-service.js';

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
