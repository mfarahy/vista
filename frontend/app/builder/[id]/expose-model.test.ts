import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MarketingContent, Property } from '../../create/[id]/types';
import {
  EXPOSE_SECTION_TYPES,
  coverImageOf,
  defaultExposeConfiguration,
  defaultGalleryImageIds,
  effectiveMarketingContent,
  energyFacts,
  galleryImagesOf,
  isExposeConfiguration,
  propertyFacts,
  summaryFacts,
  visibleSections,
} from './expose-model';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    propertyType: 'house',
    transactionType: 'sale',
    constructionYear: 1987,
    address: 'Musterstraße 12',
    zipCode: '12345',
    city: 'Berlin',
    district: 'Buckow',
    livingArea: 107,
    plotArea: 469,
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    floor: 'EG',
    totalFloors: 2,
    bodenrichtwert: null,
    availableFrom: null,
    condition: 'wellMaintained',
    askingPrice: 469000,
    additionalCosts: null,
    commission: null,
    hausgeld: null,
    coldRent: null,
    deposit: null,
    selectedFeatures: ['garden', 'garage'],
    additionalFeatures: null,
    surroundings: {},
    locationNote: null,
    sellerDescription: null,
    specialNotes: null,
    targetAudience: null,
    tone: 'professional',
    language: 'de',
    images: [],
    roomsData: [],
    exposeData: {
      basicInformation: {
        propertyType: 'house',
        propertySubtype: 'singleFamilyHouse',
        usageType: null,
        title: null,
        address: {
          street: 'Musterstraße 12',
          houseNumber: null,
          postalCode: '12345',
          city: 'Berlin',
          district: 'Buckow',
          country: 'Deutschland',
        },
      },
      pricing: {
        purchasePrice: 469000,
        rentPrice: null,
        additionalCosts: null,
        buyerCommission: null,
        sellerCommission: null,
        pricePerM2: null,
        commissionRate: null,
        commissionPayer: null,
        commissionVatIncluded: null,
      },
      propertyDetails: {
        livingArea: 107,
        plotArea: 469,
        usableArea: null,
        rooms: 4,
        bedrooms: 3,
        bathrooms: 2,
        guestToilets: null,
        yearBuilt: 1987,
        completionYear: null,
        floor: 'EG',
        numberOfFloors: 2,
        garageCount: null,
        parkingSpaceCount: null,
        bodenrichtwert: null,
        buildingStatus: null,
        renovationStatus: null,
        lastModernizationYear: null,
      },
      energy: null,
      rental: { isRented: null, furnished: null, annualRent: null },
      investment: { grossYieldTargetPercent: null, grossYieldActualPercent: null },
      rooms: [],
      equipment: [],
      outdoorAreas: [],
      location: {
        address: {
          street: 'Musterstraße 12',
          houseNumber: null,
          postalCode: '12345',
          city: 'Berlin',
          district: 'Buckow',
          country: 'Deutschland',
        },
        district: 'Buckow',
        latitude: null,
        longitude: null,
        neighborhood: null,
        description: null,
      },
      images: [],
      floorPlans: [],
      maps: [],
      additionalInformation: {
        additionalInformation: null,
        legalNotes: null,
        sellerNotes: null,
        commissionNotes: null,
        availability: null,
        legalFlags: {},
      },
      systemBranding: { companyName: 'Vista', processSteps: [] },
    },
    ...overrides,
  };
}

function makeMarketing(): MarketingContent {
  return {
    title: { value: 'KI-Titel', source: 'ai' },
    subtitle: { value: 'KI-Untertitel', source: 'ai' },
    highlights: { value: ['107 m² Wohnfläche', '4 Zimmer'], source: 'ai' },
    propertyDescription: { value: 'KI-Objektbeschreibung', source: 'ai' },
    equipmentDescription: { value: 'KI-Ausstattungstext', source: 'ai' },
    locationDescription: { value: 'KI-Lagetext', source: 'ai' },
  };
}

describe('expose configuration model', () => {
  it('defaults to the modern template with every section visible in order', () => {
    const configuration = defaultExposeConfiguration();
    assert.equal(configuration.template, 'modern');
    assert.deepEqual(
      configuration.sections.map((section) => section.type),
      EXPOSE_SECTION_TYPES,
    );
    assert.ok(configuration.sections.every((section) => section.visible));
  });

  it('persists section visibility toggles', () => {
    const configuration = defaultExposeConfiguration();
    configuration.sections = configuration.sections.map((section) =>
      section.type === 'energy' ? { ...section, visible: false } : section,
    );
    const visible = visibleSections(configuration);
    assert.ok(visible.every((section) => section.type !== 'energy'));
    assert.equal(visible.length, EXPOSE_SECTION_TYPES.length - 1);
  });

  it('preserves a custom section order', () => {
    const configuration = defaultExposeConfiguration();
    const sections = [...configuration.sections];
    const gallery = sections.findIndex((section) => section.type === 'gallery');
    const cover = sections.findIndex((section) => section.type === 'cover');
    [sections[gallery], sections[cover]] = [sections[cover], sections[gallery]];
    configuration.sections = sections;
    assert.equal(visibleSections(configuration)[0].type, 'gallery');
  });

  it('stores cover and gallery references', () => {
    const configuration = {
      ...defaultExposeConfiguration(),
      selectedCoverImageId: 'img-cover',
      galleryImageIds: ['img-a', 'img-b'],
    };
    assert.equal(configuration.selectedCoverImageId, 'img-cover');
    assert.deepEqual(configuration.galleryImageIds, ['img-a', 'img-b']);
  });

  it('recognizes persisted configurations and rejects malformed ones', () => {
    const configuration = {
      ...defaultExposeConfiguration(),
      selectedCoverImageId: 'img-1',
    };
    assert.equal(isExposeConfiguration(configuration), true);
    assert.equal(isExposeConfiguration(null), false);
    assert.equal(isExposeConfiguration({ ...configuration, template: 'luxury' }), false);
    assert.equal(
      isExposeConfiguration({
        ...configuration,
        sections: [{ id: 'x', type: 'unknown', visible: true }],
      }),
      false,
    );
  });
});

describe('effective content', () => {
  it('uses MarketingContent when no override exists', () => {
    const effective = effectiveMarketingContent(makeMarketing(), undefined);
    assert.equal(effective.title, 'KI-Titel');
    assert.equal(effective.subtitle, 'KI-Untertitel');
    assert.deepEqual(effective.highlights, ['107 m² Wohnfläche', '4 Zimmer']);
    assert.equal(effective.propertyDescription, 'KI-Objektbeschreibung');
    assert.equal(effective.equipmentDescription, 'KI-Ausstattungstext');
    assert.equal(effective.locationDescription, 'KI-Lagetext');
  });

  it('gives the Expose override precedence over MarketingContent for every field', () => {
    const marketing = makeMarketing();
    const effective = effectiveMarketingContent(marketing, {
      title: 'Eigener Titel',
      subtitle: 'Eigener Untertitel',
      highlights: ['Eigener Stichpunkt'],
      propertyDescription: 'Eigene Objektbeschreibung',
      equipmentDescription: 'Eigene Ausstattung',
      locationDescription: 'Eigene Lage',
    });
    assert.equal(effective.title, 'Eigener Titel');
    assert.equal(effective.subtitle, 'Eigener Untertitel');
    assert.deepEqual(effective.highlights, ['Eigener Stichpunkt']);
    assert.equal(effective.propertyDescription, 'Eigene Objektbeschreibung');
    assert.equal(effective.equipmentDescription, 'Eigene Ausstattung');
    assert.equal(effective.locationDescription, 'Eigene Lage');
  });

  it('falls back per field when only some overrides exist', () => {
    const marketing = makeMarketing();
    const effective = effectiveMarketingContent(marketing, { title: 'Nur Titel' });
    assert.equal(effective.title, 'Nur Titel');
    assert.equal(effective.subtitle, 'KI-Untertitel');
    assert.deepEqual(effective.highlights, ['107 m² Wohnfläche', '4 Zimmer']);
  });

  it('respects empty-string overrides as explicit user choices', () => {
    const marketing = makeMarketing();
    const effective = effectiveMarketingContent(marketing, { title: '' });
    assert.equal(effective.title, '');
  });

  it('handles missing marketing content gracefully', () => {
    const effective = effectiveMarketingContent(null, { title: 'Nur Titel' });
    assert.equal(effective.title, 'Nur Titel');
    assert.equal(effective.subtitle, '');
    assert.deepEqual(effective.highlights, []);
    assert.equal(effective.locationDescription, '');
  });
});

describe('property isolation', () => {
  it('editing overrides never mutates the MarketingContent record', () => {
    const marketing = makeMarketing();
    const snapshot = JSON.parse(JSON.stringify(marketing));
    const overrides = {
      title: 'Geändert',
      highlights: ['Neu'],
      propertyDescription: 'Anders',
    };
    effectiveMarketingContent(marketing, overrides);
    assert.deepEqual(marketing, snapshot);
    assert.equal(marketing.title.value, 'KI-Titel');
    assert.deepEqual(marketing.highlights.value, ['107 m² Wohnfläche', '4 Zimmer']);
  });

  it('editing overrides never mutates the Property model', () => {
    const property = makeProperty();
    const snapshot = JSON.parse(JSON.stringify(property));
    const overrides = {
      title: 'Geändert',
      subtitle: 'Geändert',
      highlights: ['Neu'],
      propertyDescription: 'Anders',
      equipmentDescription: 'Anders',
      locationDescription: 'Anders',
    };
    effectiveMarketingContent(null, overrides);
    assert.deepEqual(property, snapshot);
  });

  it('fact helpers read from Property without writing', () => {
    const property = makeProperty();
    propertyFacts(property);
    summaryFacts(property);
    energyFacts(property);
    assert.deepEqual(property, makeProperty());
  });
});

describe('missing data', () => {
  it('empty facts return empty lists instead of crashing', () => {
    const empty = makeProperty({
      livingArea: null,
      plotArea: null,
      rooms: null,
      bedrooms: null,
      bathrooms: null,
      constructionYear: null,
      condition: '',
      askingPrice: null,
      selectedFeatures: [],
      images: [],
      exposeData: undefined,
    });
    assert.deepEqual(propertyFacts(empty), []);
    assert.deepEqual(energyFacts(empty), []);
    assert.deepEqual(summaryFacts(empty), [{ label: 'Objektart', value: 'Haus' }]);
  });

  it('gallery helpers fall back to empty lists without photos', () => {
    const property = makeProperty();
    const configuration = defaultExposeConfiguration();
    assert.deepEqual(defaultGalleryImageIds(property), []);
    assert.deepEqual(galleryImagesOf(property, configuration), []);
    assert.equal(coverImageOf(property, configuration), undefined);
  });
});

describe('persistence', () => {
  it('serialize → parse round trip preserves the configuration', () => {
    const configuration = {
      ...defaultExposeConfiguration(),
      sections: defaultExposeConfiguration().sections.map((section) =>
        section.type === 'highlights' ? { ...section, visible: false } : section,
      ),
      selectedCoverImageId: 'img-cover',
      galleryImageIds: ['img-a', 'img-b'],
      contentOverrides: {
        title: 'Persistierter Titel',
        highlights: ['H1', 'H2'],
      },
    };
    const restored = JSON.parse(JSON.stringify(configuration)) as typeof configuration;
    assert.deepEqual(restored, configuration);
    assert.equal(isExposeConfiguration(restored), true);
    assert.equal(restored.sections.find((section) => section.type === 'highlights')?.visible, false);
  });
});