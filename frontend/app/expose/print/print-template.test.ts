import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import type { DocumentRecord, Property, PropertyImage } from '../../create/[id]/types';
import { ModernExposeTemplate } from '../../builder/[id]/components/modern-expose-template';
import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
  ExposeMedia,
} from '../../builder/[id]/expose-model';
import {
  defaultExposeConfiguration,
  effectiveMarketingContent,
} from '../../builder/[id]/expose-model';
import { translations } from '@/lib/i18n/core';

function makeImage(overrides: Partial<PropertyImage> = {}): PropertyImage {
  return {
    id: 'img-a',
    url: '/uploads/a.jpg',
    fileName: 'a.jpg',
    mimeType: 'image/jpeg',
    size: 10,
    sequence: 0,
    isCover: false,
    category: 'exterior',
    caption: 'Hausansicht',
    ...overrides,
  };
}

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
    condition: 'wellMaintained',
    askingPrice: 469000,
    selectedFeatures: ['garden', 'garage'],
    additionalFeatures: null,
    surroundings: {},
    tone: 'professional',
    language: 'de',
    images: [
      makeImage({ id: 'img-a', url: '/uploads/a.jpg', isCover: true, caption: 'Hausansicht' }),
      makeImage({ id: 'img-b', url: '/uploads/b.jpg', caption: 'Wohnzimmer' }),
      makeImage({ id: 'img-c', url: '/uploads/c.jpg', caption: 'Küche' }),
    ],
    roomsData: [],
    exposeData: {
      basicInformation: {
        propertyType: 'house',
        propertySubtype: 'singleFamilyHouse',
        address: {
          street: 'Musterstraße 12',
          postalCode: '12345',
          city: 'Berlin',
          district: 'Buckow',
          country: 'Deutschland',
        },
      },
      pricing: { purchasePrice: 469000 },
      propertyDetails: { livingArea: 107, plotArea: 469, rooms: 4, yearBuilt: 1987 },
      energy: {
        certificateType: 'consumption_based',
        efficiencyClass: 'B',
        primaryEnergySource: 'gas',
      },
      location: {
        address: {
          street: 'Musterstraße 12',
          postalCode: '12345',
          city: 'Berlin',
          district: 'Buckow',
          country: 'Deutschland',
        },
        district: 'Buckow',
      },
      images: [],
      floorPlans: [],
      maps: [],
      rooms: [],
      equipment: [],
      outdoorAreas: [],
      additionalInformation: {},
      systemBranding: { companyName: 'Vista', processSteps: [] },
    },
    ...overrides,
  };
}

const marketing: EffectiveMarketingContent = {
  title: 'Gepflegtes Einfamilienhaus mit Garten',
  subtitle: 'Musterstraße 12, Berlin-Buckow',
  highlights: ['107 m² Wohnfläche', '4 Zimmer', 'Großer Garten'],
  propertyDescription: 'Ein ruhiges Zuhause mit hellem Wohnzimmer.',
  equipmentDescription: 'Garage und Terrasse.',
  locationDescription: 'Kurze Wege zu Geschäften.',
};

const documents: DocumentRecord[] = [
  {
    id: 'doc-1',
    propertyId: 'prop-1',
    filename: 'grundriss.pdf',
    mimeType: 'application/pdf',
    size: 100,
    url: '/uploads/grundriss.pdf',
    status: 'completed',
    documentType: 'grundriss',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'doc-2',
    propertyId: 'prop-1',
    filename: 'energieausweis.pdf',
    mimeType: 'application/pdf',
    size: 100,
    url: '/uploads/energieausweis.pdf',
    status: 'completed',
    documentType: 'energieausweis',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'doc-3',
    propertyId: 'prop-1',
    filename: 'grundbuchauszug.pdf',
    mimeType: 'application/pdf',
    size: 100,
    url: '/uploads/grundbuchauszug.pdf',
    status: 'completed',
    documentType: 'grundbuchauszug',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'doc-4',
    propertyId: 'prop-1',
    filename: 'kaufvertrag.pdf',
    mimeType: 'application/pdf',
    size: 100,
    url: '/uploads/kaufvertrag.pdf',
    status: 'completed',
    documentType: 'kaufvertrag',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function render({
  property = makeProperty(),
  content = marketing,
  expose = defaultExposeConfiguration(),
  media,
}: {
  property?: Property;
  content?: EffectiveMarketingContent;
  expose?: ExposeConfiguration;
  media?: ExposeMedia;
} = {}): string {
  return renderToString(
    createElement(ModernExposeTemplate, {
      property,
      marketingContent: content,
      expose,
      media: media ?? { images: property.images, documents },
      // The print document contract is asserted in German.
      translations: translations.de,
    }),
  );
}

describe('print route template rendering', () => {
  it('renders marketing content as escaped text and never as raw HTML', () => {
    const malicious = effectiveMarketingContent(null, {
      title: '<script>alert(1)</script>',
      subtitle: '<b>fett</b>',
      propertyDescription: '<img src=x onerror=alert(2)><script>steal()</script>',
      highlights: ['<svg onload=alert(3)>'],
      equipmentDescription: '<iframe src="https://evil.example">',
      locationDescription: 'Normaler Text',
    });
    const html = render({ content: malicious });
    assert.ok(!html.includes('<script>'), 'script tags must be escaped');
    assert.ok(!html.includes('<img src=x'), 'img injection must be escaped');
    assert.ok(!html.includes('<svg'), 'svg injection must be escaped');
    assert.ok(!html.includes('<iframe'), 'iframe injection must be escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'escaped output must still be visible as text');
    assert.ok(html.includes('&lt;img src=x onerror=alert(2)&gt;'), 'injection stays inert text');
  });

  it('omits hidden sections and keeps visible ones', () => {
    const expose = defaultExposeConfiguration();
    expose.sections = expose.sections.map((section) =>
      ['energy', 'gallery', 'documents'].includes(section.type)
        ? { ...section, visible: false }
        : section,
    );
    const html = render({ expose });
    assert.ok(html.includes('id="expose-cover"'));
    assert.ok(html.includes('id="expose-highlights"'));
    assert.ok(!html.includes('id="expose-energy"'));
    assert.ok(!html.includes('id="expose-gallery"'));
    assert.ok(!html.includes('id="expose-documents"'));
  });

  it('renders sections in the persisted order', () => {
    const expose = defaultExposeConfiguration();
    const sections = [...expose.sections];
    const move = (type: string, toIndex: number) => {
      const index = sections.findIndex((section) => section.type === type);
      const [section] = sections.splice(index, 1);
      sections.splice(toIndex, 0, section);
    };
    move('gallery', 0);
    move('energy', 1);
    expose.sections = sections;
    const html = render({ expose });
    assert.ok(html.indexOf('id="expose-gallery"') < html.indexOf('id="expose-energy"'));
    assert.ok(html.indexOf('id="expose-energy"') < html.indexOf('id="expose-highlights"'));
  });

  it('uses the selected cover image on the cover', () => {
    const expose = { ...defaultExposeConfiguration(), selectedCoverImageId: 'img-b' };
    const html = render({ expose });
    const cover = html.slice(
      html.indexOf('id="expose-cover"'),
      html.indexOf('id="expose-cover"') + 4000,
    );
    assert.ok(cover.includes('http://localhost:4000/uploads/b.jpg'), 'cover must show img-b');
    assert.ok(!cover.includes('uploads/a.jpg'), 'cover must not fall back to the isCover image');
  });

  it('renders only the selected gallery images in the persisted order', () => {
    const expose = {
      ...defaultExposeConfiguration(),
      selectedCoverImageId: 'img-b',
      galleryImageIds: ['img-c', 'img-a', 'img-b'],
    };
    const html = render({ expose });
    const gallery = html.slice(
      html.indexOf('id="expose-gallery"'),
      html.indexOf('id="expose-gallery"') + 4000,
    );
    const imgC = gallery.indexOf('uploads/c.jpg');
    const imgA = gallery.indexOf('uploads/a.jpg');
    assert.ok(imgC >= 0, 'gallery must contain img-c');
    assert.ok(imgA >= 0, 'gallery must contain img-a');
    assert.ok(imgC < imgA, 'gallery must keep the configured order');
    assert.ok(!gallery.includes('uploads/b.jpg'), 'the cover image is excluded from the gallery');
  });

  it('never exposes sensitive legal documents in the Unterlagen section', () => {
    const html = render();
    assert.ok(html.includes('grundriss.pdf'));
    assert.ok(html.includes('energieausweis.pdf'));
    assert.ok(!html.includes('grundbuchauszug.pdf'));
    assert.ok(!html.includes('kaufvertrag.pdf'));
  });

  it('hides the contact section when no agent information exists', () => {
    const property = makeProperty({
      exposeData: { ...makeProperty().exposeData!, agent: undefined },
    });
    const html = render({ property });
    assert.ok(!html.includes('id="expose-contact"'));
  });

  it('renders only existing contact information without empty labels', () => {
    const exposeData = makeProperty().exposeData;
    const property = makeProperty({
      exposeData: { ...exposeData!, agent: { name: 'Max Mustermann', phone: '030 123456' } },
    });
    const html = render({ property });
    assert.ok(html.includes('Max Mustermann'));
    assert.ok(html.includes('030 123456'));
    const contact = html.slice(
      html.indexOf('id="expose-contact"'),
      html.indexOf('id="expose-contact"') + 2000,
    );
    assert.ok(!contact.includes('href='), 'no empty website/email links are rendered');
  });

  it('renders the cover with title, location, price and key facts', () => {
    const html = render();
    const cover = html.slice(0, html.indexOf('id="expose-facts"'));
    assert.ok(cover.includes('Gepflegtes Einfamilienhaus mit Garten'));
    assert.ok(cover.includes('Berlin'));
    assert.ok(cover.includes('Buckow'));
    assert.ok(cover.includes('Kaufpreis'));
    assert.ok(cover.includes('469.000'));
    assert.ok(cover.includes('107 m²'));
    assert.match(cover, /expose-cover-fact-value">4</, 'Zimmer value renders as a cover fact');
    assert.ok(cover.includes('1987'));
  });

  it('shows the persisted commission on a sale cover', () => {
    const property = makeProperty({
      commission: '3,57 % inkl. MwSt.',
      exposeData: {
        ...makeProperty().exposeData!,
        pricing: { ...makeProperty().exposeData!.pricing, buyerCommission: '3,57 % inkl. MwSt.' },
      },
    });
    const html = render({ property });
    const cover = html.slice(0, html.indexOf('id="expose-facts"'));
    assert.ok(cover.includes('Provision'));
    assert.ok(cover.includes('3,57 % inkl. MwSt.'));
  });

  it('renders rental information instead of sale information for rentals', () => {
    const property = makeProperty({
      transactionType: 'rent',
      coldRent: 1200,
      additionalCosts: 240,
      deposit: 3600,
      askingPrice: null,
      exposeData: {
        ...makeProperty().exposeData!,
        pricing: {
          ...makeProperty().exposeData!.pricing,
          purchasePrice: null,
          rentPrice: 1200,
          additionalCosts: 240,
        },
      },
    });
    const html = render({ property });
    const head = html.slice(0, html.indexOf('id="expose-facts"'));
    assert.ok(head.includes('Kaltmiete'));
    assert.ok(head.includes('Nebenkosten'));
    assert.ok(head.includes('Kaution'));
    assert.ok(!head.includes('Kaufpreis'), 'no sale price on a rental Exposé');
    assert.ok(!head.includes('Provision'), 'no sale commission on a rental Exposé');
  });

  it('renders the facts section as a clean label/value grid', () => {
    const html = render();
    const facts = html.slice(
      html.indexOf('id="expose-facts"'),
      html.indexOf('id="expose-highlights"'),
    );
    assert.ok(facts.includes('expose-fact-grid'));
    assert.ok(facts.includes('Objektart'));
    assert.ok(facts.includes('Einfamilienhaus'));
    assert.ok(facts.includes('Wohnfläche'));
    assert.ok(facts.includes('Grundstück'));
    assert.ok(facts.includes('Zimmer'));
    assert.ok(facts.includes('Baujahr'));
  });

  it('renders the energy section with scale and certificate dates', () => {
    const exposeData = makeProperty().exposeData;
    const property = makeProperty({
      exposeData: {
        ...exposeData!,
        energy: {
          certificateType: 'needs_based',
          certificateDate: '2024-03-01',
          certificateValidUntil: '2034-03-01',
          finalEnergyDemand: 78.5,
          finalEnergyConsumption: null,
          efficiencyClass: 'B',
          primaryEnergySource: 'district_heating',
          heatingType: 'Zentralheizung',
        },
      },
    });
    const html = render({ property });
    const energy = html.slice(
      html.indexOf('id="expose-energy"'),
      html.indexOf('id="expose-gallery"'),
    );
    assert.ok(energy.includes('Bedarfsausweis'));
    assert.ok(energy.includes('78,5'));
    assert.ok(energy.includes('Ausstellungsdatum'));
    assert.ok(energy.includes('01.03.2024'));
    assert.ok(energy.includes('Gültig bis'));
    assert.ok(energy.includes('01.03.2034'));
    assert.ok(energy.includes('Energieträger'));
    assert.ok(energy.includes('Fernwärme'));
    assert.ok(energy.includes('eff-B active'), 'the efficiency class segment is highlighted');
    assert.ok(
      !energy.includes('Endenergieverbrauch'),
      'consumption is not invented for Bedarfsausweis',
    );
  });

  it('keeps demand and consumption strictly separate', () => {
    const property = makeProperty({
      exposeData: {
        ...makeProperty().exposeData!,
        energy: {
          certificateType: 'consumption_based',
          finalEnergyDemand: null,
          finalEnergyConsumption: 127.5,
          efficiencyClass: 'C',
        },
      },
    });
    const html = render({ property });
    const energy = html.slice(
      html.indexOf('id="expose-energy"'),
      html.indexOf('id="expose-gallery"'),
    );
    assert.ok(energy.includes('Endenergieverbrauch'));
    assert.ok(!energy.includes('Endenergiebedarf'), 'demand is not invented for Verbrauchsausweis');
  });

  it('omits the energy section when no energy data exists', () => {
    const html = render({ property: makeProperty({ exposeData: undefined }) });
    assert.ok(!html.includes('id="expose-energy"'));
  });

  it('renders floorplans without distortion and with captions', () => {
    const property = makeProperty({
      images: [
        makeImage({
          id: 'plan-1',
          url: '/uploads/plan.png',
          category: 'floor_plan',
          caption: 'Grundriss Erdgeschoss',
        }),
      ],
    });
    const html = render({ property });
    const plans = html.slice(
      html.indexOf('id="expose-floorplans"'),
      html.indexOf('id="expose-documents"'),
    );
    assert.ok(plans.includes('expose-floorplan-figure'));
    assert.ok(plans.includes('Grundriss Erdgeschoss'));
    assert.ok(!plans.includes('aspect-'), 'floorplans must not be cropped to a fixed ratio');
    assert.ok(
      html.includes('.expose-floorplan-figure img') && html.includes('object-fit: contain'),
      'floorplan images must use object-fit: contain',
    );
  });

  it('keeps the 2D floor plan in the static PDF render even when a 3D model exists', () => {
    const property = makeProperty({
      floorPlan3D: {
        status: 'completed',
        provider: 'openai',
        sourceImageId: 'plan-1',
        model: {
          unit: 'm',
          rooms: [
            {
              id: 'room-1',
              name: 'Wohnzimmer',
              level: 0,
              x: 3,
              y: 2,
              width: 6,
              depth: 4,
              height: 2.5,
              areaM2: null,
            },
          ],
          walls: [],
          doors: [],
          windows: [],
        },
        error: null,
        createdAt: '2026-08-23T10:00:00.000Z',
        updatedAt: '2026-08-23T10:00:00.000Z',
      },
      images: [
        makeImage({
          id: 'plan-1',
          url: '/uploads/plan.png',
          category: 'floor_plan',
          caption: 'Grundriss Erdgeschoss',
        }),
      ],
    });
    const html = render({
      property,
      media: { images: property.images, documents, staticRender: true },
    });
    const plans = html.slice(
      html.indexOf('id="expose-floorplans"'),
      html.indexOf('id="expose-documents"'),
    );
    assert.ok(plans.includes('/uploads/plan.png'), 'the 2D plan must remain the PDF fallback');
    assert.ok(!plans.includes('floorplan-3d-scene'), 'the WebGL viewer must not render in the PDF');
    assert.ok(!plans.includes('3D-Grundriss wird erstellt'), 'no pending hint in static renders');
  });

  it('renders the 2D plan with a loading hint while generation is pending', () => {
    const property = makeProperty({
      floorPlan3D: {
        status: 'pending',
        provider: 'openai',
        sourceImageId: 'plan-1',
        model: null,
        error: null,
        createdAt: '2026-08-23T10:00:00.000Z',
        updatedAt: '2026-08-23T10:00:00.000Z',
      },
      images: [
        makeImage({
          id: 'plan-1',
          url: '/uploads/plan.png',
          category: 'floor_plan',
        }),
      ],
    });
    const html = render({ property });
    const plans = html.slice(
      html.indexOf('id="expose-floorplans"'),
      html.indexOf('id="expose-documents"'),
    );
    assert.ok(plans.includes('/uploads/plan.png'), 'the 2D plan is the fallback while pending');
    assert.ok(
      plans.includes('3D-Grundriss wird erstellt'),
      'a loading hint is shown while pending',
    );
    assert.ok(!plans.includes('floorplan-3d-scene'), 'no viewer before generation completes');
  });

  it('renders the default sections in the improved hierarchy order', () => {
    const exposeData = makeProperty().exposeData;
    const property = makeProperty({
      exposeData: {
        ...exposeData!,
        energy: {
          certificateType: 'consumption_based',
          finalEnergyDemand: null,
          finalEnergyConsumption: 127.5,
          efficiencyClass: 'C',
          primaryEnergySource: 'gas',
        },
        agent: { name: 'Max Mustermann', company: 'Muster Immobilien GmbH' },
      },
      images: [
        makeImage({ id: 'img-a', url: '/uploads/a.jpg', isCover: true, caption: 'Hausansicht' }),
        makeImage({ id: 'img-b', url: '/uploads/b.jpg', caption: 'Wohnzimmer' }),
        makeImage({ id: 'img-c', url: '/uploads/c.jpg', caption: 'Küche' }),
        makeImage({
          id: 'img-plan',
          url: '/uploads/plan.png',
          category: 'floor_plan',
          caption: 'Grundriss',
        }),
      ],
    });
    const html = render({ property });
    const order = [
      'id="expose-cover"',
      'id="expose-facts"',
      'id="expose-highlights"',
      'id="expose-property"',
      'id="expose-equipment"',
      'id="expose-location"',
      'id="expose-energy"',
      'id="expose-gallery"',
      'id="expose-floorplans"',
      'id="expose-documents"',
      'id="expose-contact"',
    ].map((id) => html.indexOf(id));
    for (let index = 1; index < order.length; index += 1) {
      assert.ok(
        order[index - 1] >= 0 && order[index - 1] < order[index],
        `${order[index - 1]} before ${order[index]}`,
      );
    }
  });

  it('renders contact channels with German labels', () => {
    const exposeData = makeProperty().exposeData;
    const property = makeProperty({
      exposeData: {
        ...exposeData!,
        agent: {
          name: 'Max Mustermann',
          company: 'Muster Immobilien GmbH',
          phone: '+49 30 123456',
          email: 'max@example.com',
          website: 'https://www.example.com',
        },
      },
    });
    const html = render({ property });
    const contact = html.slice(html.indexOf('id="expose-contact"'));
    assert.ok(contact.includes('Telefon'));
    assert.ok(contact.includes('+49 30 123456'));
    assert.ok(contact.includes('E-Mail'));
    assert.ok(contact.includes('max@example.com'));
    assert.ok(contact.includes('Web'));
    assert.ok(contact.includes('https://www.example.com'));
  });

  it('does not render any Builder UI, source badges or debug metadata', () => {
    const html = render();
    assert.ok(!html.includes('Bearbeitbar'));
    assert.ok(!html.includes('Nur-Lese'));
    assert.ok(!html.includes('Fakten aus Ihren Objektdaten'));
    assert.ok(!html.includes('source'));
    assert.ok(!html.includes('__EXPOSE_READY__'));
  });
});
