import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import type { DocumentRecord, Property, PropertyImage } from '../../create/[id]/types';
import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
  ExposeMedia,
  ExposeTemplateId,
} from './expose-model';
import {
  defaultExposeConfiguration,
  effectiveBranding,
  effectiveMarketingContent,
  wegFacts,
} from './expose-model';
import { EXPOSE_TEMPLATES, getExposeTemplate } from './expose-templates';
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
      energy: null,
      rental: { isRented: null, furnished: null, annualRent: null },
      investment: { grossYieldTargetPercent: null, grossYieldActualPercent: null },
      rooms: [],
      equipment: [],
      outdoorAreas: [],
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
      additionalInformation: {},
      systemBranding: { companyName: 'Vista', processSteps: [] },
      agent: {
        name: 'Max Mustermann',
        company: 'Muster Immobilien GmbH',
        phone: '+49 30 123456',
        email: 'max@example.com',
        website: 'https://www.example.com',
      },
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
];

function render(
  template: ExposeTemplateId,
  {
    property = makeProperty(),
    content = marketing,
    expose = defaultExposeConfiguration(),
    media,
  }: {
    property?: Property;
    content?: EffectiveMarketingContent;
    expose?: ExposeConfiguration;
    media?: ExposeMedia;
  } = {},
): string {
  const Template = getExposeTemplate(template).component;
  return renderToString(
    createElement(Template, {
      property,
      marketingContent: content,
      expose,
      media: media ?? { images: property.images, documents },
      translations: translations.de,
    }),
  );
}

describe('expose template registry', () => {
  it('registers exactly the three templates with labels', () => {
    assert.deepEqual(
      EXPOSE_TEMPLATES.map((template) => template.id),
      ['modern', 'classic', 'elegant'],
    );
    const labels = EXPOSE_TEMPLATES.map((template) => translations.de.t(template.label));
    assert.ok(labels.includes('Modern'));
    assert.ok(labels.includes('Klassisch'));
    assert.ok(labels.includes('Elegant'));
    for (const template of EXPOSE_TEMPLATES) {
      assert.equal(typeof template.component, 'function');
    }
  });

  it('defaults to the modern template', () => {
    const resolved = getExposeTemplate(undefined);
    assert.equal(resolved.id, 'modern');
  });

  it('falls back safely for unknown template ids', () => {
    assert.equal(getExposeTemplate('luxury').id, 'modern');
    assert.equal(getExposeTemplate('').id, 'modern');
    assert.equal(getExposeTemplate(null).id, 'modern');
  });

  it('each template marks the rendered document with its own data-template', () => {
    for (const template of EXPOSE_TEMPLATES) {
      const html = render(template.id);
      assert.ok(
        html.includes(`data-template="${template.id}"`),
        `${template.id} must render data-template="${template.id}"`,
      );
    }
  });
});

describe('template switching', () => {
  it('persists the template through a serialize round trip', () => {
    const configuration = { ...defaultExposeConfiguration(), template: 'classic' };
    const restored = JSON.parse(JSON.stringify(configuration)) as typeof configuration;
    assert.equal(restored.template, 'classic');
  });

  it('changing the template never touches sections, order, visibility, overrides, media or branding', () => {
    const before: ExposeConfiguration = {
      template: 'modern',
      sections: defaultExposeConfiguration().sections.map((section, index) =>
        index === 0 ? { ...section, visible: false } : section,
      ),
      selectedCoverImageId: 'img-b',
      galleryImageIds: ['img-c', 'img-a'],
      contentOverrides: { title: 'Eigener Titel', highlights: ['Eigener Punkt'] },
      branding: { companyName: 'Meine Firma' },
    };
    const snapshot = JSON.stringify(before);
    const after: ExposeConfiguration = { ...before, template: 'elegant' };
    assert.equal(after.template, 'elegant');
    assert.deepEqual(after.sections, before.sections);
    assert.equal(after.selectedCoverImageId, 'img-b');
    assert.deepEqual(after.galleryImageIds, ['img-c', 'img-a']);
    assert.deepEqual(after.contentOverrides, before.contentOverrides);
    assert.deepEqual(after.branding, before.branding);
    assert.equal(JSON.stringify(before), snapshot, 'the source configuration is not mutated');
  });

  it('the template is the only field that changes when switching', () => {
    const before = {
      ...defaultExposeConfiguration(),
      selectedCoverImageId: 'img-b',
      galleryImageIds: ['img-a'],
    };
    const after = { ...before, template: 'classic' };
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (key === 'template') continue;
      assert.deepEqual(
        (after as Record<string, unknown>)[key],
        (before as Record<string, unknown>)[key],
        `field ${key} must survive a template switch`,
      );
    }
  });

  it('user content overrides survive a template switch in the rendered output', () => {
    const expose: ExposeConfiguration = {
      ...defaultExposeConfiguration(),
      template: 'classic',
      contentOverrides: { title: 'Mein eigener Titel' },
    };
    // The Builder resolves the effective content once; the template must
    // render exactly the effective content, whatever the selected template.
    const html = render('classic', {
      expose,
      content: { ...marketing, title: 'Mein eigener Titel' },
    });
    assert.ok(html.includes('Mein eigener Titel'));
    assert.ok(!html.includes('Gepflegtes Einfamilienhaus mit Garten'));
  });
});

describe('expose branding', () => {
  it('persists branding inside the configuration', () => {
    const configuration = {
      ...defaultExposeConfiguration(),
      branding: {
        companyName: 'Vista Premium',
        phone: '+49 30 999',
        email: 'premium@example.com',
        website: 'https://premium.example.com',
      },
    };
    const restored = JSON.parse(JSON.stringify(configuration)) as typeof configuration;
    assert.equal(restored.branding?.companyName, 'Vista Premium');
    assert.equal(restored.branding?.phone, '+49 30 999');
  });

  it('expose branding wins over the agent profile and the system branding', () => {
    const property = makeProperty();
    const configuration = {
      ...defaultExposeConfiguration(),
      branding: {
        companyName: 'Eigene Firma',
        phone: '030 000',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
    };
    const branding = effectiveBranding(property, configuration);
    assert.equal(branding.companyName, 'Eigene Firma');
    assert.equal(branding.phone, '030 000');
    assert.equal(branding.logoUrl, 'https://cdn.example.com/logo.png');
    assert.equal(branding.email, 'max@example.com', 'unset fields fall back to the agent');
  });

  it('falls back to the agent profile, then the system branding', () => {
    const branding = effectiveBranding(makeProperty(), defaultExposeConfiguration());
    assert.equal(branding.companyName, 'Muster Immobilien GmbH');
    assert.equal(branding.phone, '+49 30 123456');
    assert.equal(branding.email, 'max@example.com');
    const withoutAgent = effectiveBranding(
      makeProperty({ exposeData: { ...makeProperty().exposeData!, agent: undefined } }),
      defaultExposeConfiguration(),
    );
    assert.equal(withoutAgent.companyName, 'Vista');
    assert.equal(withoutAgent.phone, undefined);
  });

  it('rejects unsafe logo urls and never shows broken or dangerous sources', () => {
    const configuration = {
      ...defaultExposeConfiguration(),
      branding: {
        companyName: 'Firma',
        logoUrl: 'javascript:alert(1)',
        website: 'javascript:alert(1)',
      },
    };
    const withoutAgentWebsite = makeProperty({
      exposeData: {
        ...makeProperty().exposeData!,
        agent: { name: 'Max Mustermann' },
      },
    });
    const branding = effectiveBranding(withoutAgentWebsite, configuration);
    assert.equal(branding.logoUrl, undefined, 'javascript: logo urls are dropped');
    assert.equal(branding.website, undefined, 'javascript: websites are dropped');
    const html = render('classic', {
      expose: configuration,
      property: makeProperty({ exposeData: { ...makeProperty().exposeData!, agent: undefined } }),
    });
    assert.ok(!html.includes('javascript:'), 'no dangerous scheme reaches the document');
  });

  it('renders branding in the document for every template', () => {
    const expose = {
      ...defaultExposeConfiguration(),
      branding: {
        companyName: 'Luxus Immobilien',
        phone: '+49 30 123',
        logoUrl: '/uploads/logo.png',
      },
    };
    for (const template of EXPOSE_TEMPLATES) {
      const html = render(template.id, { expose });
      assert.ok(html.includes('Luxus Immobilien'), `${template.id} renders the brand name`);
      assert.ok(html.includes('uploads/logo.png'), `${template.id} renders the brand logo`);
      assert.ok(html.includes('+49 30 123'), `${template.id} renders the brand phone`);
    }
  });

  it('does not mutate the agent profile when branding is resolved', () => {
    const property = makeProperty();
    const snapshot = JSON.stringify(property);
    effectiveBranding(property, {
      ...defaultExposeConfiguration(),
      branding: { companyName: 'X', phone: '1', email: 'a@b.c', website: 'https://x.y' },
    });
    assert.equal(JSON.stringify(property), snapshot);
  });

  it('renders safely without any branding at all', () => {
    const property = makeProperty({
      exposeData: { ...makeProperty().exposeData!, agent: undefined },
    });
    for (const template of EXPOSE_TEMPLATES) {
      const html = render(template.id, { property });
      assert.ok(!html.includes('undefined'), `${template.id} never renders undefined`);
      assert.ok(!html.includes('null'), `${template.id} never renders null`);
      assert.ok(!html.includes('broken'), `${template.id} never renders broken placeholders`);
    }
  });
});

describe('weg facts', () => {
  it('renders only populated WEG values', () => {
    const property = makeProperty({
      exposeData: {
        ...makeProperty().exposeData!,
        weg: { hausgeldEur: 390, maintenanceReserveEur: 5400, coOwnershipShare: '145/10.000' },
      },
    });
    const facts = wegFacts(property, translations.de);
    assert.deepEqual(
      facts.map((fact) => translations.de.t(fact.label)),
      ['Hausgeld', 'Instandhaltungsrücklage', 'Miteigentumsanteil'],
    );
    assert.ok(facts[0].value.includes('390'), facts[0].value);
    assert.ok(facts[1].value.includes('5.400'), facts[1].value);
    assert.equal(facts[2].value, '145/10.000');
    const sparse = makeProperty({
      exposeData: {
        ...makeProperty().exposeData!,
        weg: { hausgeldEur: 390, maintenanceReserveEur: null, coOwnershipShare: null },
      },
    });
    assert.equal(wegFacts(sparse, translations.de).length, 1);
    assert.equal(translations.de.t(wegFacts(sparse, translations.de)[0].label), 'Hausgeld');
    assert.deepEqual(wegFacts(makeProperty(), translations.de), []);
  });

  it('falls back to the legacy hausgeld field', () => {
    const property = makeProperty({ hausgeld: 350 });
    const facts = wegFacts(property, translations.de);
    assert.equal(facts.length, 1);
    assert.equal(translations.de.t(facts[0].label), 'Hausgeld');
    assert.ok(facts[0].value.includes('350'), facts[0].value);
  });

  it('renders WEG facts in the Objekt section of every template', () => {
    const property = makeProperty({
      exposeData: {
        ...makeProperty().exposeData!,
        weg: { hausgeldEur: 390, maintenanceReserveEur: 5400, coOwnershipShare: '145/10.000' },
      },
    });
    for (const template of EXPOSE_TEMPLATES) {
      const html = render(template.id, { property });
      const propertySection = html.slice(
        html.indexOf('id="expose-property"'),
        html.indexOf('id="expose-equipment"'),
      );
      assert.ok(propertySection.includes('Hausgeld'), `${template.id} shows Hausgeld`);
      assert.ok(propertySection.includes('390'), `${template.id} shows the Hausgeld value`);
      assert.ok(
        propertySection.includes('Instandhaltungsrücklage'),
        `${template.id} shows the reserve`,
      );
      assert.ok(propertySection.includes('Miteigentumsanteil'), `${template.id} shows the share`);
      assert.ok(propertySection.includes('145/10.000'), `${template.id} shows the share value`);
    }
  });
});

describe('template rendering', () => {
  for (const template of EXPOSE_TEMPLATES) {
    describe(`${template.id} template`, () => {
      it('renders sale pricing with Kaufpreis and Provision', () => {
        const property = makeProperty({
          commission: '3,57 % inkl. MwSt.',
          exposeData: {
            ...makeProperty().exposeData!,
            pricing: {
              ...makeProperty().exposeData!.pricing,
              buyerCommission: '3,57 % inkl. MwSt.',
            },
          },
        });
        const html = render(template.id, { property });
        const head = html.slice(0, html.indexOf('id="expose-facts"'));
        assert.ok(head.includes('Kaufpreis'));
        assert.ok(head.includes('469.000'));
        assert.ok(head.includes('Provision'));
        assert.ok(head.includes('3,57 % inkl. MwSt.'));
      });

      it('renders rental pricing and never sale wording', () => {
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
        const html = render(template.id, { property });
        const head = html.slice(0, html.indexOf('id="expose-facts"'));
        assert.ok(head.includes('Kaltmiete'));
        assert.ok(head.includes('Nebenkosten'));
        assert.ok(head.includes('Kaution'));
        assert.ok(!head.includes('Kaufpreis'));
        assert.ok(!head.includes('Provision'));
      });

      it('handles missing data without empty headings or invented placeholders', () => {
        const empty = makeProperty({
          livingArea: null,
          plotArea: null,
          rooms: null,
          constructionYear: null,
          condition: '',
          askingPrice: null,
          selectedFeatures: [],
          images: [],
          exposeData: undefined,
        });
        const html = render(template.id, {
          property: empty,
          media: { images: [], documents: [] },
        });
        assert.ok(!html.includes('id="expose-energy"'), 'no energy section without energy data');
        assert.ok(!html.includes('id="expose-gallery"'), 'no gallery without photos');
        assert.ok(!html.includes('id="expose-floorplans"'), 'no floorplans without plans');
        assert.ok(!html.includes('undefined'), 'no undefined leakage');
        assert.ok(!html.includes('id="expose-documents"'), 'no documents without records');
      });

      it('keeps energy demand and consumption strictly separate', () => {
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
        const html = render(template.id, { property });
        const energy = html.slice(
          html.indexOf('id="expose-energy"'),
          html.indexOf('id="expose-gallery"'),
        );
        assert.ok(energy.includes('Endenergieverbrauch'));
        assert.ok(energy.includes('eff-C active'));
        assert.ok(!energy.includes('Endenergiebedarf'));
      });

      it('renders the selected gallery in the persisted order', () => {
        const expose = {
          ...defaultExposeConfiguration(),
          selectedCoverImageId: 'img-b',
          galleryImageIds: ['img-c', 'img-a', 'img-b'],
        };
        const html = render(template.id, { expose });
        const gallery = html.slice(
          html.indexOf('id="expose-gallery"'),
          html.indexOf('id="expose-gallery"') + 4000,
        );
        const imgC = gallery.indexOf('uploads/c.jpg');
        const imgA = gallery.indexOf('uploads/a.jpg');
        assert.ok(imgC >= 0 && imgA >= 0, 'gallery contains the selected images');
        assert.ok(imgC < imgA, 'gallery keeps the configured order');
        assert.ok(!gallery.includes('uploads/b.jpg'), 'the cover image is excluded');
      });

      it('renders floorplans with captions', () => {
        const property = makeProperty({
          images: [
            ...makeProperty().images,
            makeImage({
              id: 'plan-1',
              url: '/uploads/plan.png',
              category: 'floor_plan',
              caption: 'Grundriss Erdgeschoss',
            }),
          ],
        });
        const html = render(template.id, { property });
        const plans = html.slice(
          html.indexOf('id="expose-floorplans"'),
          html.indexOf('id="expose-documents"'),
        );
        assert.ok(plans.includes('expose-floorplan-figure'));
        assert.ok(plans.includes('Grundriss Erdgeschoss'));
      });

      it('renders the contact section with agent and branding information', () => {
        const expose = {
          ...defaultExposeConfiguration(),
          branding: { companyName: 'Muster Immobilien GmbH', logoUrl: '/uploads/logo.png' },
        };
        const html = render(template.id, { expose });
        const contact = html.slice(html.indexOf('id="expose-contact"'));
        assert.ok(contact.includes('Max Mustermann'));
        assert.ok(contact.includes('Muster Immobilien GmbH'));
        assert.ok(contact.includes('uploads/logo.png'));
        assert.ok(contact.includes('Telefon'));
        assert.ok(contact.includes('+49 30 123456'));
        assert.ok(contact.includes('E-Mail'));
        assert.ok(contact.includes('Web'));
      });

      it('omits hidden sections and keeps the persisted order', () => {
        const expose = defaultExposeConfiguration();
        const sections = [...expose.sections];
        const move = (type: string, toIndex: number) => {
          const index = sections.findIndex((section) => section.type === type);
          const [section] = sections.splice(index, 1);
          sections.splice(toIndex, 0, section);
        };
        move('gallery', 0);
        expose.sections = sections.map((section) =>
          ['energy', 'documents'].includes(section.type) ? { ...section, visible: false } : section,
        );
        const html = render(template.id, { expose });
        assert.ok(!html.includes('id="expose-energy"'), 'hidden energy section is omitted');
        assert.ok(!html.includes('id="expose-documents"'), 'hidden documents section is omitted');
        assert.ok(
          html.indexOf('id="expose-gallery"') < html.indexOf('id="expose-facts"'),
          'reordered gallery renders before facts',
        );
        assert.ok(html.includes('id="expose-gallery"'), 'visible gallery section stays');
      });

      it('escapes malicious user content', () => {
        const malicious = effectiveMarketingContent(null, {
          title: '<script>alert(1)</script>',
          subtitle: '<b>fett</b>',
          propertyDescription: '<img src=x onerror=alert(2)><script>steal()</script>',
          highlights: ['<svg onload=alert(3)>'],
          equipmentDescription: '<iframe src="https://evil.example">',
          locationDescription: '<a href="javascript:alert(4)">klick</a>',
        });
        const html = render(template.id, { content: malicious });
        assert.ok(!html.includes('<script>'));
        assert.ok(!html.includes('<img src=x'));
        assert.ok(!html.includes('<svg'));
        assert.ok(!html.includes('<iframe'));
        assert.ok(!html.includes('href="javascript:'), 'no live javascript: link attribute');
        assert.ok(html.includes('&lt;script&gt;'));
        assert.ok(
          html.includes('&lt;a href=&quot;javascript:alert(4)&quot;&gt;'),
          'the injected link stays inert escaped text',
        );
      });

      it('marks the rendered template in the document', () => {
        const html = render(template.id);
        assert.ok(html.includes(`data-template="${template.id}"`));
      });
    });
  }
});
