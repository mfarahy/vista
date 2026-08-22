import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyExposeData } from './expose-data.js';
import type { Property, PropertyExposeData } from './types.js';
import {
  WIZARD_FIELD_TARGETS,
  WIZARD_FIELDS_WITHOUT_TARGET,
  applyWizardFieldsToModel,
  buildDomainModel,
  buildListingModel,
  buildMarketingContentModel,
  buildPropertyModel,
  type PropertyModel,
} from './domain-model.js';
import { WIZARD_FIELDS } from './document-understanding/schema.js';
import { documentWizardCandidates } from './document-understanding/prefill.js';
import type { DocumentUnderstandingResult } from './document-understanding/types.js';

function propertyWith(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    propertyType: 'apartment',
    transactionType: 'sale',
    constructionYear: null,
    address: '',
    zipCode: '',
    city: '',
    district: '',
    livingArea: null,
    plotArea: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    floor: '',
    totalFloors: null,
    bodenrichtwert: null,
    availableFrom: '',
    condition: '',
    askingPrice: null,
    additionalCosts: null,
    commission: '',
    hausgeld: null,
    coldRent: null,
    deposit: null,
    selectedFeatures: [],
    additionalFeatures: '',
    surroundings: {},
    locationNote: '',
    sellerDescription: '',
    specialNotes: '',
    targetAudience: '',
    tone: 'professional',
    language: 'de',
    images: [],
    roomsData: [],
    ...overrides,
  };
}

function exposeDataWith(overrides: Partial<PropertyExposeData>): PropertyExposeData {
  return { ...emptyExposeData(), ...overrides };
}

describe('PropertyModel: property variants', () => {
  it('represents an apartment for sale', () => {
    const property = propertyWith({
      id: 'apartment-sale',
      propertyType: 'apartment',
      transactionType: 'sale',
      condition: 'new',
      selectedFeatures: ['balcony', 'fitted-kitchen', 'basement'],
      exposeData: exposeDataWith({
        basicInformation: {
          propertyType: 'apartment',
          propertySubtype: 'Eigentumswohnung',
          title: 'Helle 3-Zimmer-Wohnung',
          address: {
            street: 'Weserstraße',
            houseNumber: '42',
            postalCode: '12045',
            city: 'Berlin',
            district: 'Neukölln',
            country: 'Deutschland',
          },
        },
        propertyDetails: {
          livingArea: 92,
          plotArea: null,
          rooms: 3,
          bathrooms: 1,
          yearBuilt: 2018,
          completionYear: null,
          floor: '2. OG',
          numberOfFloors: 5,
          garageCount: null,
          parkingSpaceCount: 1,
          bodenrichtwert: 420,
        },
        pricing: {
          purchasePrice: 449000,
          rentPrice: null,
          additionalCosts: null,
          buyerCommission: '3,57 % inkl. MwSt.',
          sellerCommission: null,
        },
      }),
    });

    const model = buildPropertyModel(property);
    assert.equal(model.identity.propertyId, 'apartment-sale');
    assert.equal(model.classification.propertyType, 'apartment');
    assert.equal(model.classification.propertySubtype, 'Eigentumswohnung');
    assert.equal(model.transaction.type, 'sale');
    assert.equal(model.address.street, 'Weserstraße');
    assert.equal(model.address.postalCode, '12045');
    assert.equal(model.address.city, 'Berlin');
    assert.equal(model.areas.livingAreaM2, 92);
    assert.equal(model.rooms.total, 3);
    assert.equal(model.rooms.bathrooms, 1);
    assert.equal(model.building.yearBuilt, 2018);
    assert.equal(model.building.status, 'new');
    assert.equal(model.building.condition, 'unknown');
    assert.equal(model.building.basement, true);
    assert.equal(model.features.kitchen?.fitted, true);
    assert.equal(model.features.parking?.parkingSpaces, 1);
    assert.equal(model.outdoor.balcony, true);
    assert.equal(model.financial.askingPriceEur, 449000);
    assert.equal(model.financial.pricePerM2Eur, Math.round(449000 / 92));
    assert.equal(model.financial.commission?.ratePercent, 3.57);
    assert.equal(model.financial.commission?.payer, 'buyer');
    assert.equal(model.financial.commission?.vatIncluded, true);
    assert.equal(model.rental, undefined, 'a sale listing has no rental section');
  });

  it('represents a house for sale', () => {
    const property = propertyWith({
      id: 'house-sale',
      propertyType: 'house',
      transactionType: 'sale',
      bedrooms: 4,
      selectedFeatures: ['garden', 'garage'],
      exposeData: exposeDataWith({
        basicInformation: {
          propertyType: 'house',
          propertySubtype: 'Einfamilienhaus',
          title: null,
          address: {
            street: 'Musterweg',
            houseNumber: '1',
            postalCode: '12345',
            city: 'Hamburg',
            country: 'Deutschland',
          },
        },
        propertyDetails: {
          livingArea: 180,
          plotArea: 620,
          rooms: 6,
          bathrooms: 2,
          yearBuilt: 1998,
          completionYear: null,
          floor: null,
          numberOfFloors: 2,
          garageCount: 1,
          parkingSpaceCount: 2,
          bodenrichtwert: 300,
        },
        pricing: {
          purchasePrice: 780000,
          rentPrice: null,
          additionalCosts: null,
          buyerCommission: null,
          sellerCommission: null,
        },
        outdoorAreas: [
          { id: 'garden-1', type: 'garden', area: 420, orientation: 'Süd', description: null },
        ],
      }),
    });

    const model = buildPropertyModel(property);
    assert.equal(model.classification.propertyType, 'house');
    assert.equal(model.classification.propertySubtype, 'Einfamilienhaus');
    assert.equal(model.transaction.type, 'sale');
    assert.equal(model.areas.livingAreaM2, 180);
    assert.equal(model.areas.plotAreaM2, 620);
    assert.equal(model.rooms.bedrooms, 4);
    assert.equal(model.building.status, 'existing');
    assert.equal(model.building.condition, 'unknown');
    assert.equal(model.features.parking?.garage, true);
    assert.equal(model.features.parking?.parkingSpaces, 2);
    assert.equal(model.outdoor.garden, true);
    assert.equal(model.outdoor.gardenAreaM2, 420);
    assert.equal(model.outdoor.orientation, 'Süd');
    assert.equal(model.rental, undefined, 'a sale listing has no rental section');
  });

  it('represents a house for rent', () => {
    const property = propertyWith({
      id: 'house-rent',
      propertyType: 'house',
      transactionType: 'rent',
      availableFrom: '01.10.2026',
      coldRent: 1900,
      exposeData: exposeDataWith({
        basicInformation: {
          propertyType: 'house',
          propertySubtype: 'Doppelhaushälfte',
          title: null,
          address: { country: 'Deutschland' },
        },
        propertyDetails: {
          livingArea: 150,
          plotArea: 400,
          rooms: 5,
          bathrooms: 2,
          yearBuilt: 2005,
          completionYear: null,
          floor: null,
          numberOfFloors: 2,
          garageCount: null,
          parkingSpaceCount: null,
          bodenrichtwert: null,
        },
        pricing: {
          purchasePrice: null,
          rentPrice: 1900,
          additionalCosts: 450,
          buyerCommission: null,
          sellerCommission: null,
        },
      }),
    });

    const model = buildPropertyModel(property);
    assert.equal(model.transaction.type, 'rent');
    assert.equal(model.classification.propertySubtype, 'Doppelhaushälfte');
    assert.equal(model.areas.livingAreaM2, 150);
    assert.equal(model.rental?.monthlyRentEur, 1900);
    assert.equal(model.rental?.additionalCostsEur, 450);
    assert.equal(model.rental?.availableFrom, '01.10.2026');
    assert.equal(model.financial.askingPriceEur, undefined, 'rental has no asking price');
  });

  it('represents an investment property', () => {
    const model: PropertyModel = {
      identity: { propertyId: 'investment-1' },
      address: { city: 'Leipzig', country: 'Deutschland' },
      classification: {
        propertyType: 'apartment',
        propertySubtype: 'Eigentumswohnung',
        usageType: 'investment',
      },
      transaction: { type: 'sale' },
      areas: { livingAreaM2: 48 },
      rooms: { total: 2 },
      building: { yearBuilt: 2012 },
      financial: { askingPriceEur: 210000, pricePerM2Eur: Math.round(210000 / 48) },
      rental: { isRented: true, monthlyRentEur: 950 },
      investment: { grossYieldTargetPercent: 4.5, grossYieldActualPercent: 5.4 },
      features: {},
      outdoor: {},
    };

    assert.equal(model.classification.usageType, 'investment');
    assert.equal(model.investment?.grossYieldTargetPercent, 4.5);
    assert.equal(model.investment?.grossYieldActualPercent, 5.4);
    assert.equal(model.rental?.isRented, true);

    const derived = buildPropertyModel(
      propertyWith({ transactionType: 'sale', askingPrice: 210000, coldRent: 950 }),
    );
    assert.equal(
      derived.investment,
      undefined,
      'yield targets are not inferred from the persisted record',
    );
  });
});

describe('PropertyModel: conditional sections', () => {
  it('maps the energy section and keeps demand and consumption separate', () => {
    const property = propertyWith({
      exposeData: exposeDataWith({
        energy: {
          certificateType: 'needs_based',
          yearOfConstruction: 2000,
          primaryEnergySource: 'gas',
          finalEnergyDemand: 85,
          finalEnergyConsumption: null,
          efficiencyClass: 'B',
        },
      }),
    });

    const model = buildPropertyModel(property);
    assert.equal(model.energy?.certificateType, 'needs_based');
    assert.equal(model.energy?.efficiencyClass, 'B');
    assert.equal(model.energy?.demandKwhPerM2A, 85);
    assert.equal(
      model.energy?.consumptionKwhPerM2A,
      undefined,
      'consumption stays separate from demand',
    );
    assert.equal(model.energy?.primaryEnergySource, 'gas');
    assert.equal(model.features.heating?.energySource, 'gas');
  });

  it('maps the legal section from preserved legal notes', () => {
    const property = propertyWith({
      exposeData: exposeDataWith({
        additionalInformation: {
          additionalInformation: null,
          legalNotes: 'Auflassungsvormerkung zu Lasten des Grundstücks eingetragen.',
          sellerNotes: null,
          commissionNotes: null,
          availability: null,
          notes: {},
        },
      }),
    });

    const model = buildPropertyModel(property);
    assert.equal(
      model.legal?.notes,
      'Auflassungsvormerkung zu Lasten des Grundstücks eingetragen.',
    );
  });

  it('maps the location section from structured location data and surroundings', () => {
    const property = propertyWith({
      locationNote: 'Ruhige Lage mit guter Anbindung.',
      surroundings: {
        transport: 'U7, Buslinien',
        schools: 'Grundschule am Park',
        childcare: 'Kindergarten Sonnenschein',
        shopping: 'Supermarkt und Wochenmarkt',
        medical: 'Hausärzte in 500 m',
        parks: 'Volkspark',
        restaurants: 'Cafés und Restaurants',
      },
      exposeData: exposeDataWith({
        location: {
          address: { country: 'Deutschland' },
          latitude: null,
          longitude: null,
          district: 'Neukölln',
          neighborhood: null,
          description: null,
        },
      }),
    });

    const model = buildPropertyModel(property);
    assert.equal(model.location?.district, 'Neukölln');
    assert.equal(model.location?.description, 'Ruhige Lage mit guter Anbindung.');
    assert.deepEqual(model.location?.publicTransport, ['U7, Buslinien']);
    assert.deepEqual(model.location?.schools, ['Grundschule am Park']);
    assert.deepEqual(model.location?.kindergartens, ['Kindergarten Sonnenschein']);
    assert.deepEqual(model.location?.shopping, ['Supermarkt und Wochenmarkt']);
    assert.deepEqual(model.location?.medical, ['Hausärzte in 500 m']);
    assert.equal(model.location?.recreation?.length, 1);
    assert.ok(model.location?.recreation?.[0]?.includes('Volkspark'));
  });

  it('omits sections that carry no data', () => {
    const model = buildPropertyModel(propertyWith());
    assert.equal(model.energy, undefined);
    assert.equal(model.rental, undefined);
    assert.equal(model.investment, undefined);
    assert.equal(model.legal, undefined);
    assert.equal(model.location?.district, undefined);
    assert.equal(model.location?.publicTransport, undefined);
    assert.equal(model.location?.description, undefined);
  });
});

describe('PropertyModel: expanded persisted fields', () => {
  it('maps usable area, guest toilets and building construction metadata', () => {
    const property = propertyWith({
      exposeData: exposeDataWith({
        propertyDetails: {
          ...emptyExposeData().propertyDetails,
          livingArea: 107,
          usableArea: 121,
          plotArea: 320,
          rooms: 4,
          bedrooms: 2,
          bathrooms: 1,
          guestToilets: 1,
          yearBuilt: 1987,
          numberOfFloors: 3,
          buildingStatus: 'existing',
          renovationStatus: 'modernized',
          lastModernizationYear: 2019,
        },
      }),
    });

    const model = buildPropertyModel(property);
    assert.equal(model.areas.usableAreaM2, 121);
    assert.equal(model.rooms.guestToilets, 1);
    assert.equal(model.building.status, 'existing');
    assert.equal(model.building.renovationStatus, 'modernized');
    assert.equal(model.building.lastModernizationYear, 2019);
    assert.equal(model.building.floors, 3);
  });

  it('prefers the explicitly stored price per m² over a derived value', () => {
    const property = propertyWith({
      livingArea: 92,
      askingPrice: 449000,
      exposeData: exposeDataWith({
        propertyDetails: { ...emptyExposeData().propertyDetails, livingArea: 92 },
        pricing: {
          purchasePrice: 449000,
          rentPrice: null,
          additionalCosts: null,
          buyerCommission: null,
          sellerCommission: null,
          pricePerM2: 4400,
          commissionRate: null,
          commissionPayer: null,
          commissionVatIncluded: null,
        },
      }),
    });

    const model = buildPropertyModel(property);
    assert.equal(model.financial.pricePerM2Eur, 4400, 'stored explicit value wins');
  });

  it('maps structured commission and keeps the legacy string fallback', () => {
    const structured = buildPropertyModel(
      propertyWith({
        exposeData: exposeDataWith({
          pricing: {
            purchasePrice: 449000,
            rentPrice: null,
            additionalCosts: null,
            buyerCommission: null,
            sellerCommission: null,
            pricePerM2: null,
            commissionRate: 3.5,
            commissionPayer: 'seller',
            commissionVatIncluded: false,
          },
        }),
      }),
    );
    assert.equal(structured.financial.commission?.ratePercent, 3.5);
    assert.equal(structured.financial.commission?.payer, 'seller');
    assert.equal(structured.financial.commission?.vatIncluded, false);

    const legacy = buildPropertyModel(
      propertyWith({
        commission: '3,57 % inkl. MwSt.',
        exposeData: exposeDataWith({
          pricing: {
            purchasePrice: 449000,
            rentPrice: null,
            additionalCosts: null,
            buyerCommission: '3,57 % inkl. MwSt.',
            sellerCommission: null,
            pricePerM2: null,
            commissionRate: null,
            commissionPayer: null,
            commissionVatIncluded: null,
          },
        }),
      }),
    );
    assert.equal(legacy.financial.commission?.ratePercent, 3.57);
    assert.equal(legacy.financial.commission?.payer, 'buyer');
    assert.equal(legacy.financial.commission?.vatIncluded, true);
  });

  it('maps energy certificate dates, heating type and hot water inclusion', () => {
    const model = buildPropertyModel(
      propertyWith({
        exposeData: exposeDataWith({
          energy: {
            certificateType: 'needs_based',
            certificateDate: '2020-03-01',
            certificateValidUntil: '2030-03-01',
            yearOfConstruction: 2000,
            primaryEnergySource: 'gas',
            heatingType: 'Zentralheizung',
            hotWaterIncluded: true,
            finalEnergyDemand: 85,
            finalEnergyConsumption: null,
            efficiencyClass: 'B',
          },
        }),
      }),
    );
    assert.equal(model.energy?.certificateDate, '2020-03-01');
    assert.equal(model.energy?.certificateValidUntil, '2030-03-01');
    assert.equal(model.energy?.heatingType, 'Zentralheizung');
    assert.equal(model.energy?.hotWaterIncluded, true);
    assert.equal(model.features.heating?.type, 'Zentralheizung');
  });

  it('maps legal flags, rental and investment data from persisted sections', () => {
    const model = buildPropertyModel(
      propertyWith({
        transactionType: 'sale',
        exposeData: exposeDataWith({
          basicInformation: {
            propertyType: 'apartment',
            propertySubtype: 'Eigentumswohnung',
            usageType: 'investment',
            title: null,
            address: { country: 'Deutschland' },
          },
          additionalInformation: {
            additionalInformation: null,
            legalNotes: null,
            sellerNotes: null,
            commissionNotes: null,
            availability: null,
            notes: {},
            legalFlags: {
              usufruct: false,
              leasehold: true,
              foreclosure: false,
              heritageProtection: null,
            },
          },
          rental: { isRented: true, furnished: false, annualRent: 11400 },
          investment: { grossYieldTargetPercent: 4.5, grossYieldActualPercent: 5.4 },
        }),
      }),
    );
    assert.equal(model.classification.usageType, 'investment');
    assert.equal(model.legal?.leasehold, true);
    assert.equal(model.legal?.usufruct, false);
    assert.equal(model.rental?.isRented, true);
    assert.equal(model.rental?.furnished, false);
    assert.equal(model.rental?.annualRentEur, 11400);
    assert.equal(model.investment?.grossYieldTargetPercent, 4.5);
    assert.equal(model.investment?.grossYieldActualPercent, 5.4);
  });

  it('maps bathroom, carport and guest toilet feature booleans', () => {
    const model = buildPropertyModel(
      propertyWith({ selectedFeatures: ['shower', 'bathtub', 'carport', 'guest-toilet'] }),
    );
    assert.equal(model.features.bathroom?.shower, true);
    assert.equal(model.features.bathroom?.bathtub, true);
    assert.equal(model.features.guestToilet, true);
    assert.equal(model.features.parking?.carport, true);
  });

  it('omits new sections when they carry no data', () => {
    const model = buildPropertyModel(propertyWith());
    assert.equal(model.areas.usableAreaM2, undefined);
    assert.equal(model.rooms.guestToilets, undefined);
    assert.equal(model.building.renovationStatus, undefined);
    assert.equal(model.building.lastModernizationYear, undefined);
    assert.equal(model.classification.usageType, undefined);
    assert.equal(model.energy, undefined);
    assert.equal(model.rental, undefined);
    assert.equal(model.investment, undefined);
    assert.equal(model.legal, undefined);
  });
});

describe('Domain separation', () => {
  it('keeps Property, Listing, MarketingContent and Expose as separate concepts', () => {
    const property = propertyWith({
      propertyType: 'apartment',
      transactionType: 'sale',
      livingArea: 92,
      askingPrice: 449000,
      selectedFeatures: ['balcony'],
      exposeData: exposeDataWith({
        basicInformation: {
          propertyType: 'apartment',
          propertySubtype: 'Eigentumswohnung',
          title: 'Helle Wohnung',
          address: { country: 'Deutschland', city: 'Berlin' },
        },
        propertyDetails: {
          livingArea: 92,
          plotArea: null,
          rooms: 3,
          bathrooms: 1,
          yearBuilt: 2018,
          completionYear: null,
          floor: null,
          numberOfFloors: null,
          garageCount: null,
          parkingSpaceCount: null,
          bodenrichtwert: null,
        },
        pricing: {
          purchasePrice: 449000,
          rentPrice: null,
          additionalCosts: null,
          buyerCommission: null,
          sellerCommission: null,
        },
      }),
      expose: {
        id: 'exp-1',
        propertyId: 'prop-1',
        template: 'modern',
        content: {
          title: 'Helle Wohnung in Berlin',
          portalTitle: '',
          shortDescription: '',
          mainDescription: '',
          highlights: ['Balkon'],
          roomDescriptions: [],
          locationDescription: '',
          targetAudience: '',
          factualSnapshot: [],
        },
        pdfUrl: null,
        generatedAt: null,
      },
    });

    const domain = buildDomainModel(property);
    assert.deepEqual(
      Object.keys(domain).sort(),
      ['expose', 'listing', 'marketingContent', 'property'],
    );

    domain.listing.status = 'archived';
    domain.marketingContent.title = 'Edited by user';
    domain.expose.template = 'premium';
    domain.property.address.city = 'Hamburg';

    assert.equal(domain.listing.status, 'archived');
    assert.equal(domain.marketingContent.title, 'Edited by user');
    assert.equal(domain.expose.template, 'premium');
    assert.equal(domain.property.address.city, 'Hamburg');
    assert.equal(domain.listing.transactionType, 'sale');
    assert.equal(domain.property.transaction.type, 'sale');
  });

  it('treats marketing content as separate from factual property data', () => {
    const property = propertyWith({
      exposeData: exposeDataWith({
        basicInformation: {
          propertyType: 'apartment',
          propertySubtype: null,
          title: 'Helle Wohnung',
          address: { country: 'Deutschland' },
        },
      }),
      expose: {
        id: 'exp-1',
        propertyId: 'prop-1',
        template: 'modern',
        content: {
          title: 'Helle Wohnung',
          portalTitle: '',
          shortDescription: '',
          mainDescription: 'Eine helle Wohnung mit Balkon.',
          highlights: ['Balkon'],
          roomDescriptions: [],
          locationDescription: '',
          targetAudience: '',
          factualSnapshot: [],
        },
        pdfUrl: null,
        generatedAt: null,
      },
    });

    const marketing = buildMarketingContentModel(property);
    assert.equal(marketing.title, 'Helle Wohnung');
    assert.equal(marketing.propertyDescription, 'Eine helle Wohnung mit Balkon.');
    assert.deepEqual(marketing.highlights, ['Balkon']);

    const listing = buildListingModel(property);
    assert.equal(listing.status, 'active', 'generated content marks the listing active');
  });
});

describe('AI extraction mapping target', () => {
  it('every wizard field has a domain target or is documented as unmapped', () => {
    const targeted = new Set(Object.keys(WIZARD_FIELD_TARGETS));
    for (const field of WIZARD_FIELDS) {
      assert.ok(
        targeted.has(field) || (WIZARD_FIELDS_WITHOUT_TARGET as readonly string[]).includes(field),
        `wizard field ${field} needs a domain target or an explicit unmapped entry`,
      );
    }
  });

  it('maps AI wizard fields onto the property model', () => {
    const understanding: DocumentUnderstandingResult = {
      documentType: 'grundriss',
      tags: [],
      summary: '',
      keepInLibrary: true,
      wizardFields: [
        { field: 'street', value: 'Furkastraße', evidence: 'Furkastraße 88 A' },
        { field: 'houseNumber', value: '88 A', evidence: 'Furkastraße 88 A' },
        { field: 'livingArea', value: 124.5, evidence: 'Wohnfläche: 124,5 m²' },
        { field: 'yearBuilt', value: 1987, evidence: 'Baujahr 1987' },
        { field: 'energyClass', value: 'A', evidence: 'Energieeffizienzklasse A' },
      ],
      additionalInformation: [],
    };

    const document = {
      id: 'doc-1',
      filename: 'grundriss.pdf',
      understandingResult: understanding,
    };
    const candidates = documentWizardCandidates(document);
    assert.equal(candidates.length, 5);
    assert.equal(candidates[2].value, 124.5);

    const model = applyWizardFieldsToModel(buildPropertyModel(propertyWith()), candidates);
    assert.equal(model.address.street, 'Furkastraße');
    assert.equal(model.address.houseNumber, '88 A');
    assert.equal(model.areas.livingAreaM2, 124.5);
    assert.equal(model.building.yearBuilt, 1987);
    assert.equal(model.energy?.efficiencyClass, 'A');
  });

  it('ignores fields without a typed target', () => {
    const model = applyWizardFieldsToModel(buildPropertyModel(propertyWith()), [
      { field: 'parcelNumber', value: '5/366' },
      { field: 'floor', value: '2. OG' },
      { field: 'city', value: 'Berlin' },
    ]);
    assert.equal(model.address.city, 'Berlin');
    assert.equal(model.legal, undefined);
  });
});