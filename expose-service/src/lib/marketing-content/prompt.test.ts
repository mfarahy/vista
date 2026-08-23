import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyExposeData } from '../expose-data.js';
import type { Property } from '../types.js';
import {
  buildMarketingContentInput,
  buildSystemPrompt,
  buildUserMessage,
  hasSufficientPropertyInfo,
  marketingUserInformationOf,
} from './prompt.js';

function propertyWith(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    propertyType: 'house',
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

describe('marketing content prompt', () => {
  it('requests professional German Exposé copy', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /professioneller deutscher Immobilienmakler/i);
    assert.match(prompt, /Makler-Exposé/i);
    assert.match(prompt, /Schreibe ausschließlich auf Deutsch/i);
    assert.match(prompt, /Vermeide Werbesprache, Clickbait/i);
    assert.match(prompt, /Emojis/i);
  });

  it('contains explicit no-hallucination instructions', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Erfinde niemals/i);
    assert.match(prompt, /AUSSCHLIESSLICH Fakten/i);
    assert.match(prompt, /Raumgrößen/i);
    assert.match(prompt, /Entfernungen/i);
    assert.match(prompt, /Fahrtzeiten/i);
    assert.match(prompt, /Schulen/i);
    assert.match(prompt, /Renditen/i);
    assert.match(prompt, /Erfinde niemals Entfernungen oder Wegezeiten/i);
    assert.match(prompt, /nicht "Die Immobilie verfügt über keine Einbauküche"/i);
    assert.match(prompt, /Unbekannt ist nicht falsch/i);
  });

  it('instructs the model to return null for empty location data', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /keine verwertbaren Lageangaben/i);
    assert.match(prompt, /gib für die Lagebeschreibung null zurück/i);
  });

  it('keeps user information as marketing context, not facts', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Angaben des Verkäufers/i);
    assert.match(prompt, /persönliche Perspektiven/i);
    assert.match(prompt, /Zielgruppe ist eine Marketing-Anweisung/i);
  });

  it('passes reviewed property facts into the user message', () => {
    const property = propertyWith({
      livingArea: 107,
      rooms: 4,
      city: 'Berlin',
      district: 'Buckow',
      selectedFeatures: ['garden', 'garage'],
    });
    const input = buildMarketingContentInput(property);
    const message = buildUserMessage(input);
    assert.equal(input.property.livingAreaM2, 107);
    assert.equal(input.property.totalRooms, 4);
    assert.equal(input.property.garden, true);
    assert.equal(input.property.garage, true);
    assert.match(message, /Wohnfläche: 107 m²/);
    assert.match(message, /Zimmer: 4/);
    assert.match(message, /Garten: vorhanden/);
    assert.match(message, /Garage: vorhanden/);
    assert.match(message, /Stadtteil: Buckow/);
  });

  it('makes the persisted deposit available as a structured rental fact', () => {
    const property = propertyWith({
      transactionType: 'rent',
      coldRent: 890,
      deposit: 2670,
      livingArea: 72,
    });
    const input = buildMarketingContentInput(property);
    assert.equal(input.property.rentPriceEur, 890);
    assert.equal(input.property.depositEur, 2670);
    const message = buildUserMessage(input);
    assert.match(message, /Kaltmiete: 890 €\/Monat/);
    assert.match(message, /Kaution: 2670 €/);
  });

  it('never invents a deposit that is not persisted', () => {
    const property = propertyWith({ transactionType: 'rent', coldRent: 890 });
    const input = buildMarketingContentInput(property);
    assert.equal(input.property.depositEur, undefined);
    assert.doesNotMatch(buildUserMessage(input), /Kaution/);
  });

  it('makes persisted WEG facts available to the marketing prompt', () => {
    const property = propertyWith({
      livingArea: 82,
      exposeData: {
        ...emptyExposeData(),
        weg: { hausgeldEur: 350, maintenanceReserveEur: 85000, coOwnershipShare: '145/10.000' },
      },
    });
    const input = buildMarketingContentInput(property);
    assert.equal(input.property.hausgeldEur, 350);
    assert.equal(input.property.maintenanceReserveEur, 85000);
    assert.equal(input.property.coOwnershipShare, '145/10.000');
    const message = buildUserMessage(input);
    assert.match(message, /Hausgeld: 350 €\/Monat/);
    assert.match(message, /Instandhaltungsrücklage: 85000 €/);
    assert.match(message, /Miteigentumsanteil: 145\/10.000/);
  });

  it('never invents WEG facts that are not persisted', () => {
    const property = propertyWith({ livingArea: 82 });
    const input = buildMarketingContentInput(property);
    assert.equal(input.property.hausgeldEur, undefined);
    assert.equal(input.property.maintenanceReserveEur, undefined);
    assert.equal(input.property.coOwnershipShare, undefined);
    assert.doesNotMatch(
      buildUserMessage(input),
      /Hausgeld|Instandhaltungsrücklage|Miteigentumsanteil/,
    );
  });

  it('passes seller and user information as marketing context', () => {
    const property = propertyWith({
      sellerDescription: 'Wir haben den Garten besonders geliebt.',
      specialNotes: 'Besichtigungen nach Vereinbarung.',
      targetAudience: 'Familien',
      exposeData: {
        ...emptyExposeData(),
        additionalInformation: {
          ...emptyExposeData().additionalInformation,
          sellerNotes: 'Hinweise des Verkäufers.',
          additionalInformation: 'Weitere Angaben.',
        },
      },
    });
    const userInfo = marketingUserInformationOf(property);
    assert.equal(userInfo.sellerDescription, 'Wir haben den Garten besonders geliebt.');
    assert.equal(userInfo.specialNotes, 'Besichtigungen nach Vereinbarung.');
    assert.equal(userInfo.targetAudience, 'Familien');
    assert.equal(userInfo.sellerNotes, 'Hinweise des Verkäufers.');
    assert.equal(userInfo.additionalInformation, 'Weitere Angaben.');

    const message = buildUserMessage(buildMarketingContentInput(property));
    assert.match(message, /Wir haben den Garten besonders geliebt/);
    assert.match(message, /Zielgruppe: Familien/);
  });

  it('does not pass raw OCR or raw document AI responses', () => {
    const property = propertyWith({
      livingArea: 107,
      // A persisted document record with OCR text and an understanding result
      // must never leak into the marketing input.
      exposeData: {
        ...emptyExposeData(),
        propertyDetails: { ...emptyExposeData().propertyDetails, livingArea: 107 },
      },
    }) as Property & {
      documents?: unknown[];
    };
    property.documents = [
      {
        id: 'doc-1',
        analysisResult: { text: 'RAW OCR TEXT Wohnfläche 999 m²' },
        understandingResult: { wizardFields: [], additionalInformation: [] },
      },
    ];
    const input = buildMarketingContentInput(property);
    const serialized = JSON.stringify(input);
    assert.doesNotMatch(serialized, /RAW OCR TEXT/i);
    assert.doesNotMatch(serialized, /analysisResult/i);
    assert.doesNotMatch(serialized, /understandingResult/i);
  });

  it('omits unknown features instead of turning them into negative claims', () => {
    const property = propertyWith({
      livingArea: 107,
      selectedFeatures: ['garden', 'garage'],
    });
    const message = buildUserMessage(buildMarketingContentInput(property));
    // fitted kitchen is unknown: the fact sheet must not mention it at all.
    assert.doesNotMatch(message, /Einbauküche/);
    assert.match(message, /Garten: vorhanden/);
  });

  it('omits placeholder energy sources instead of passing them as facts', () => {
    const property = propertyWith({
      livingArea: 107,
      exposeData: {
        ...emptyExposeData(),
        energy: {
          ...emptyExposeData().energy,
          primaryEnergySource: 'other',
          heatingType: 'Zentralheizung',
        },
      },
    });
    const message = buildUserMessage(buildMarketingContentInput(property));
    // The raw enum placeholder must never reach the model as a fact.
    assert.doesNotMatch(message, /Energieträger \(Heizung\): other/);
    assert.doesNotMatch(message, /Primärenergieträger: other/);
    assert.doesNotMatch(message, /„other“/);
    // A real source is still rendered.
    const gasProperty = propertyWith({
      livingArea: 107,
      exposeData: {
        ...emptyExposeData(),
        energy: {
          ...emptyExposeData().energy,
          primaryEnergySource: 'gas',
          heatingType: 'Zentralheizung',
        },
      },
    });
    const gasMessage = buildUserMessage(buildMarketingContentInput(gasProperty));
    assert.match(gasMessage, /Primärenergieträger: gas/);
  });

  it('instructs the model to never surface internal placeholder values', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /"other", "unknown", "not_available"/);
  });

  it('omits location facts that are not present', () => {
    const property = propertyWith({ livingArea: 107 });
    const input = buildMarketingContentInput(property);
    const message = buildUserMessage(input);
    assert.deepEqual(input.location, {
      district: undefined,
      publicTransport: undefined,
      schools: undefined,
      kindergartens: undefined,
      shopping: undefined,
      medical: undefined,
      recreation: undefined,
      description: undefined,
    });
    assert.doesNotMatch(message, /Öffentlicher Nahverkehr/);
    assert.doesNotMatch(message, /Lagebeschreibung/);
  });
});

describe('hasSufficientPropertyInfo', () => {
  it('rejects a bare default property', () => {
    assert.equal(hasSufficientPropertyInfo(propertyWith()), false);
  });

  it('accepts a property with at least one reviewed fact', () => {
    assert.equal(hasSufficientPropertyInfo(propertyWith({ livingArea: 107 })), true);
    assert.equal(hasSufficientPropertyInfo(propertyWith({ rooms: 4 })), true);
    assert.equal(hasSufficientPropertyInfo(propertyWith({ selectedFeatures: ['garden'] })), true);
    assert.equal(hasSufficientPropertyInfo(propertyWith({ askingPrice: 449000 })), true);
  });
});
