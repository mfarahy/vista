import {
  createProperty,
  updateProperty,
  addImage,
  saveMarketingContent,
} from '../lib/store.js';
import type { MarketingContentRecord } from '../lib/marketing-content/types.js';
import type { PropertyPayload } from '../lib/types.js';

const DEMO_ROOMS = [
  {
    name: 'Wohnbereich',
    type: 'Wohnen',
    size: 32,
    floor: '2. OG',
    description: 'Große Fenster und direkter Zugang zum Südwest-Balkon.',
    sequence: 0,
  },
  {
    name: 'Schlafzimmer',
    type: 'Schlafen',
    size: 15,
    floor: '2. OG',
    description: 'Ruhiger Rückzugsort mit Platz für ein Doppelbett.',
    sequence: 1,
  },
  {
    name: 'Arbeitszimmer',
    type: 'Arbeiten',
    size: 11,
    floor: '2. OG',
    description: 'Flexibel nutzbarer Raum für Homeoffice oder Gäste.',
    sequence: 2,
  },
  {
    name: 'Küche',
    type: 'Kochen',
    size: 9,
    floor: '2. OG',
    description: 'Moderne Einbauküche mit klarer Linienführung.',
    sequence: 3,
  },
] as const;

const DEMO_PAYLOAD: PropertyPayload = {
  propertyType: 'apartment',
  transactionType: 'sale',
  constructionYear: 2018,
  address: 'Weserstraße 42',
  zipCode: '12045',
  city: 'Berlin',
  district: 'Neukölln',
  livingArea: 92,
  plotArea: null,
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  floor: '2. OG',
  totalFloors: 5,
  availableFrom: 'sofort',
  condition: 'new',
  askingPrice: 449000,
  additionalCosts: null,
  commission: '3,57 % inkl. MwSt.',
  hausgeld: 390,
  coldRent: null,
  deposit: null,
  selectedFeatures: [
    'balcony',
    'elevator',
    'fitted-kitchen',
    'underfloor-heating',
    'basement',
    'energy-efficient',
  ],
  additionalFeatures: 'Südwest-Balkon mit Weitblick',
  surroundings: {
    transport: 'U7 und mehrere Buslinien in der Umgebung',
    shopping: 'Vielfältige Geschäfte und Wochenmarkt',
    restaurants: 'Cafés und Restaurants fußläufig erreichbar',
    parks: 'Volkspark Hasenheide für Freizeit und Erholung',
  },
  locationNote:
    'Lebendiges Umfeld mit Cafés, kleinen Läden und kurzen Wegen zu den täglichen Zielen.',
  sellerDescription:
    'Eine helle Wohnung mit offenem Grundriss und sorgfältig ausgewählten Materialien.',
  specialNotes: 'DEMO / TESTDATEN',
  targetAudience: 'Paare und anspruchsvolle Eigennutzer',
  tone: 'modern',
  language: 'de',
  roomsData: [...DEMO_ROOMS],
  exposeData: {
    basicInformation: {
      propertyType: 'apartment',
      propertySubtype: 'condominium',
      usageType: 'ownerOccupied',
      title: 'Eigentumswohnung mit Balkon in Berlin-Neukölln',
      address: {
        street: 'Weserstraße',
        houseNumber: '42',
        postalCode: '12045',
        city: 'Berlin',
        district: 'Neukölln',
        country: 'Deutschland',
      },
    },
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
    propertyDetails: {
      livingArea: 92,
      plotArea: null,
      usableArea: null,
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      guestToilets: null,
      yearBuilt: 2018,
      completionYear: null,
      floor: '2. OG',
      numberOfFloors: 5,
      garageCount: null,
      parkingSpaceCount: null,
      bodenrichtwert: null,
      buildingStatus: 'existing',
      renovationStatus: null,
      lastModernizationYear: null,
    },
    energy: {
      certificateType: 'needs_based',
      certificateDate: '2024-03-01',
      certificateValidUntil: '2034-03-01',
      yearOfConstruction: 2018,
      primaryEnergySource: 'district_heating',
      heatingType: 'Zentralheizung',
      hotWaterIncluded: true,
      finalEnergyDemand: 78.5,
      finalEnergyConsumption: null,
      efficiencyClass: 'B',
    },
    rental: { isRented: false, furnished: false, annualRent: null },
    investment: { grossYieldTargetPercent: null, grossYieldActualPercent: null },
    rooms: [
      { type: 'living_room', name: 'Wohnbereich', area: 32, description: 'Große Fenster und direkter Zugang zum Südwest-Balkon.', features: [], floor: '2. OG', order: 0 },
      { type: 'bedroom', name: 'Schlafzimmer', area: 15, description: 'Ruhiger Rückzugsort mit Platz für ein Doppelbett.', features: [], floor: '2. OG', order: 1 },
      { type: 'office', name: 'Arbeitszimmer', area: 11, description: 'Flexibel nutzbarer Raum für Homeoffice oder Gäste.', features: [], floor: '2. OG', order: 2 },
      { type: 'kitchen', name: 'Küche', area: 9, description: 'Moderne Einbauküche mit klarer Linienführung.', features: [], floor: '2. OG', order: 3 },
    ],
    equipment: [
      { category: 'outdoor', name: 'Balkon', description: 'Südwest-Ausrichtung mit Weitblick' },
      { category: 'kitchen', name: 'Einbauküche', description: null },
      { category: 'heating', name: 'Fußbodenheizung', description: null },
      { category: 'technology', name: 'Aufzug', description: null },
      { category: 'storage', name: 'Keller', description: null },
    ],
    outdoorAreas: [
      { type: 'balcony', area: 6, orientation: 'Südwest', description: 'Mit Weitblick' },
    ],
    location: {
      address: {
        street: 'Weserstraße',
        houseNumber: '42',
        postalCode: '12045',
        city: 'Berlin',
        district: 'Neukölln',
        country: 'Deutschland',
      },
      latitude: null,
      longitude: null,
      district: 'Neukölln',
      neighborhood: null,
      description:
        'Lebendiges Umfeld mit Cafés, kleinen Läden und kurzen Wegen zu den täglichen Zielen.',
    },
    images: [],
    floorPlans: [],
    maps: [],
    additionalInformation: {
      additionalInformation: null,
      legalNotes: null,
      sellerNotes: 'DEMO / TESTDATEN',
      commissionNotes: null,
      availability: 'sofort',
      notes: {},
      legalFlags: {
        usufruct: null,
        leasehold: null,
        foreclosure: null,
        heritageProtection: null,
      },
    },
    agent: {
      name: 'Max Mustermann',
      company: 'Muster Immobilien GmbH',
      address: {
        street: 'Musterstraße',
        houseNumber: '1',
        postalCode: '10115',
        city: 'Berlin',
        district: 'Mitte',
        country: 'Deutschland',
      },
      phone: '+49 30 1234567',
      email: 'kontakt@muster-immobilien.de',
      website: 'https://www.muster-immobilien.de',
      photo: null,
      logo: null,
    },
    systemBranding: { companyName: 'Vista', processSteps: [] },
  },
};

const DEMO_MARKETING: MarketingContentRecord = {
  title: {
    value: 'Gepflegte Eigentumswohnung mit Balkon und Weitblick',
    source: 'ai',
  },
  subtitle: { value: '3 Zimmer · 92 m² · Berlin-Neukölln', source: 'ai' },
  highlights: {
    value: [
      '92 m² Wohnfläche auf 3 Zimmern',
      'Südwest-Balkon mit Weitblick',
      'Baujahr 2018 mit Fußbodenheizung',
      'Moderne Einbauküche',
      'Aufzug im Haus',
      'Eigener Kellerraum',
    ],
    source: 'ai',
  },
  propertyDescription: {
    value:
      'Helle 3-Zimmer-Wohnung im 2. Obergeschoss eines gepflegten Mehrfamilienhauses in Berlin-Neukölln. Der offene Grundriss verbindet Wohnbereich, Küche und den Südwest-Balkon zu einem großzügigen Raumgefühl. Fußbodenheizung, Einbauküche und ein eigener Kellerraum ergänzen das Angebot. Das Haus wurde 2018 errichtet und befindet sich in einem sehr guten Zustand. Die Wohnung ist sofort verfügbar.',
    source: 'ai',
  },
  equipmentDescription: {
    value:
      'Südwest-Balkon mit Weitblick, moderne Einbauküche, Fußbodenheizung, Aufzug und ein eigener Kellerraum.',
    source: 'ai',
  },
  locationDescription: {
    value:
      'Die Wohnung liegt im lebendigen Neukölln mit Cafés, kleinen Läden und kurzen Wegen zu den täglichen Zielen. Die U7 und mehrere Buslinien sind in der Umgebung erreichbar, der Volkspark Hasenheide lädt zu Freizeit und Erholung ein.',
    source: 'ai',
  },
};

/**
 * Creates a fully-populated demo property: realistic expose data (energy,
 * agent, pricing, equipment), a static German marketing draft (no AI call),
 * demo photos and a floorplan, so the demo flow and the PDF smoke test render
 * a representative Exposé. Returns the new property id.
 */
export async function createDemoProperty(): Promise<string> {
  const property = await createProperty();
  await updateProperty(property.id, DEMO_PAYLOAD);
  await saveMarketingContent(property.id, DEMO_MARKETING);
  for (let index = 1; index <= 6; index += 1) {
    await addImage(property.id, {
      url: `/demo/room-${index}.svg`,
      fileName: `demo-room-${index}.svg`,
      mimeType: 'image/svg+xml',
      size: 0,
      sequence: index - 1,
      isCover: index === 1,
      category: index === 1 ? 'exterior' : 'interior',
      caption: index === 1 ? 'Hausansicht' : `Raum ${index}`,
    });
  }
  await addImage(property.id, {
    url: '/demo/floorplan.svg',
    fileName: 'demo-floorplan.svg',
    mimeType: 'image/svg+xml',
    size: 0,
    sequence: 6,
    isCover: false,
    category: 'floor_plan',
    caption: 'Grundriss 2. Obergeschoss',
  });
  return property.id;
}