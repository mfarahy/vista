import type { Property } from '../types.js';
import { buildListingModel, buildPropertyModel } from '../domain-model.js';
import type { MarketingContentInput, MarketingUserInformation } from './types.js';
import { marketingContentInputOf } from './types.js';

/**
 * Readable prompt template for the marketing-content model. Kept separate from
 * the provider so it can be tuned without touching request plumbing.
 *
 * The model receives ONLY the reviewed Property facts (whitelist payload built
 * from the domain model), the current Listing state, and the user-provided
 * "Ihre Angaben". Raw OCR and raw Document AI responses never reach this
 * prompt.
 */

const SYSTEM_PROMPT = `Du bist ein professioneller deutscher Immobilienmakler und Verfasser von Exposé-Texten. Du verfasst sachliche, präzise und seriöse Verkaufstexte im Stil eines hochwertigen deutschen Makler-Exposés.

Regeln:
- Schreibe ausschließlich auf Deutsch, in professionellem, natürlichem Immobilien-Deutsch. Vermeide Werbesprache, Clickbait, künstliche Superlative, sich wiederholende Floskeln, unnatürliche KI-Formulierungen, Emojis und übertriebene Ausrufezeichen.
- Verwende AUSSCHLIESSLICH Fakten aus dem bereitgestellten Faktenblatt. Erfinde niemals Informationen.
- Erfinde niemals: Raumgrößen, Renovierungsdaten, Baumaterialien, Bauqualität, Ausblicke, Entfernungen, Fahrtzeiten, Schulen, Nachbarschaftseigenschaften, Renditen, Rechtsstatus, Energiewerte, Parkmöglichkeiten, Ausstattungsmerkmale oder emotionale Behauptungen als Tatsachen.
- Erfinde niemals Entfernungen oder Wegezeiten (z. B. "in 5 Minuten zu Fuß erreichbar"), es sei denn, das Faktenblatt enthält eine konkrete Angabe.
- Unbekannt ist nicht falsch: Erwähne niemals fehlende Merkmale als negativ. Steht im Faktenblatt "Einbauküche: nicht angegeben", schreibe NICHT "Die Immobilie verfügt über keine Einbauküche".
- Interne Platzhalterwerte (z. B. "other", "unknown", "not_available") sind keine Fakten und dürfen niemals wörtlich erscheinen. Wenn der Energieträger oder ein anderer Wert als Platzhalter angegeben ist, lasse ihn einfach weg — erwähne den Platzhalter weder als Fakt noch als Negativbehauptung.
- Formuliere keine Behauptungen als Tatsache, die nicht durch das Faktenblatt gedeckt sind. Auch wenn Werte wie Lage, Ausblick oder Zustand im Faktenblatt fehlen, füge sie nicht hinzu.
- Angaben des Verkäufers bzw. Nutzers sind persönliche Perspektiven ("Die bisherigen Eigentümer haben den Garten besonders geschätzt"), keine objektiven Fakten. Wandle sie niemals in sachliche Behauptungen um (z. B. "Der Garten ist außergewöhnlich groß").
- Die Zielgruppe ist eine Marketing-Anweisung, kein Faktenattribut. Passe bei Bedarf Gewichtung und Wortwahl an (z. B. bei "Familien" die Zimmeranzahl, den Garten oder ein Gäste-WC betonen), aber erfinde keine zielgruppenspezifischen Fakten.
- Titel: ein präziser, kurzer Titel, der die Objektart und die wichtigsten verifizierten Verkaufsargumente nennt. Keine unbelegten Behauptungen. Keine vollständige Adresse.
- Untertitel: ein kurzer Satz mit Objektart, ggf. Unterart und Ort/Stadtteil, soweit angegeben.
- Highlights: 3 bis 6 kurze Stichpunkte. Jeder Stichpunkt muss einem verifizierten Faktenblatt-Feld entsprechen (z. B. "107 m² Wohnfläche", "4 Zimmer", "Eigener Garten", "Garage"). Schreibe keine generischen Aussagen wie "Perfekt für Familien" oder "Top-Investment", es sei denn, der Nutzer hat eine solche Positionierung ausdrücklich vorgegeben. Enthält das Faktenblatt zu wenige Fakten, liefere weniger Stichpunkte, statt zu erfinden.
- Objektbeschreibung: professioneller Exposé-Text mit Objektart, Größe, Raumaufteilung, wichtigen Gebäude- und Ausstattungsmerkmalen, Außenbereich, Parkmöglichkeiten und ggf. Zustand/Modernisierung. Wiederhole nicht mechanisch jedes Feld; der Text soll wie ein echtes Makler-Exposé lesen.
- Ausstattungsbeschreibung: beschreibe nur die tatsächlich vorhandenen Merkmale (z. B. Einbauküche, Bad, Gäste-WC, Dusche, Badewanne, Heizung, Terrasse, Balkon, Garten, Garage, Carport, Stellplätze). Nicht vorhandene oder unbekannte Merkmale nicht erwähnen.
- Lagebeschreibung: ausschließlich aus den strukturierten Lageangaben (Stadtteil, ÖPNV, Schulen, Kindergärten, Einkaufsmöglichkeiten, medizinische Versorgung, Freizeit, Lagebeschreibung). Keine Entfernungen oder Zeiten erfinden. Gibt es keine verwertbaren Lageangaben, gib für die Lagebeschreibung null zurück — fülle sie nicht mit allgemeinen Floskeln.
- Verwende natürliche deutsche Immobilien-Terminologie (z. B. Wohnfläche, Grundstücksfläche, Baujahr, Zustand, Einbauküche, Gäste-WC, Energieeffizienzklasse, Endenergiebedarf).
- WEG-Angaben (Hausgeld, Instandhaltungsrücklage, Miteigentumsanteil) dürfen nur dann erwähnt werden, wenn das Faktenblatt sie enthält. Erfinde niemals WEG-Vorteile, Rücklagenhöhen, Sondernutzungsrechte, Verwaltungsangaben oder Anlageimplikationen, die nicht im Faktenblatt stehen.

Das Ergebnis muss exakt dem vorgegebenen JSON-Schema entsprechen.`;

function clean(value: string | null | undefined): string {
  return value?.trim() || '';
}

/** Energy-source placeholder values that carry no factual meaning. */
const PLACEHOLDER_ENERGY_SOURCES = new Set(['other', 'unknown', 'not_available', 'none']);

/** Extracts the user-provided "Ihre Angaben" as marketing context. */
export function marketingUserInformationOf(property: Property): MarketingUserInformation {
  const additional = property.exposeData?.additionalInformation;
  return {
    sellerDescription: clean(property.sellerDescription) || undefined,
    specialNotes: clean(property.specialNotes) || undefined,
    sellerNotes: clean(additional?.sellerNotes) || undefined,
    additionalInformation: clean(additional?.additionalInformation) || undefined,
    targetAudience: clean(property.targetAudience) || undefined,
  };
}

/**
 * Whitelist-only AI input built from the reviewed Property model. Raw OCR,
 * raw Document AI responses and unverified document data are never included:
 * the document-understanding pipeline has already extracted and reviewed the
 * facts that are persisted on the Property model.
 *
 * Records whose exposeData was never synced (e.g. the demo property) still
 * carry reviewed facts on the legacy flat fields; those are used as fallback
 * exactly like the wizard review does, never as a second source of truth.
 */
export function buildMarketingContentInput(property: Property): MarketingContentInput {
  const input = marketingContentInputOf(
    buildPropertyModel(property),
    buildListingModel(property),
    marketingUserInformationOf(property),
  );
  const facts = input.property;
  if (facts.livingAreaM2 == null && property.livingArea != null)
    facts.livingAreaM2 = property.livingArea;
  if (facts.plotAreaM2 == null && property.plotArea != null) facts.plotAreaM2 = property.plotArea;
  if (facts.totalRooms == null && property.rooms != null) facts.totalRooms = property.rooms;
  if (facts.bathrooms == null && property.bathrooms != null) facts.bathrooms = property.bathrooms;
  if (facts.yearBuilt == null && property.constructionYear != null)
    facts.yearBuilt = property.constructionYear;
  if (facts.floors == null && property.totalFloors != null) facts.floors = property.totalFloors;
  if (facts.askingPriceEur == null && property.askingPrice != null)
    facts.askingPriceEur = property.askingPrice;
  if (facts.address.district == null && property.district)
    facts.address.district = property.district;
  if (facts.address.city == null && property.city) facts.address.city = property.city;
  if (facts.address.postalCode == null && property.zipCode)
    facts.address.postalCode = property.zipCode;
  return input;
}

function section(title: string, lines: string[]): string {
  const body = lines.filter(Boolean);
  return body.length ? [`${title}:`, ...body.map((line) => `- ${line}`)].join('\n') : '';
}

function factsOf(input: MarketingContentInput): string {
  const property = input.property;
  const lines = [
    property.propertyType ? `Objektart: ${property.propertyType}` : '',
    property.propertySubtype ? `Objektunterart: ${property.propertySubtype}` : '',
    property.usageType ? `Nutzung: ${property.usageType}` : '',
    property.livingAreaM2 != null ? `Wohnfläche: ${property.livingAreaM2} m²` : '',
    property.usableAreaM2 != null ? `Nutzfläche: ${property.usableAreaM2} m²` : '',
    property.plotAreaM2 != null ? `Grundstücksfläche: ${property.plotAreaM2} m²` : '',
    property.totalRooms != null ? `Zimmer: ${property.totalRooms}` : '',
    property.bedrooms != null ? `Schlafzimmer: ${property.bedrooms}` : '',
    property.bathrooms != null ? `Badezimmer: ${property.bathrooms}` : '',
    property.guestToilets != null ? `Gäste-WCs: ${property.guestToilets}` : '',
    property.yearBuilt != null ? `Baujahr: ${property.yearBuilt}` : '',
    property.buildingStatus ? `Gebäudestatus: ${property.buildingStatus}` : '',
    property.condition && property.condition !== 'unknown' ? `Zustand: ${property.condition}` : '',
    property.floors != null ? `Etagen: ${property.floors}` : '',
    property.basement === true ? 'Keller: vorhanden' : '',
    property.attic === true ? 'Dachgeschoss: vorhanden' : '',
    property.renovationStatus ? `Sanierungsstatus: ${property.renovationStatus}` : '',
    property.lastModernizationYear != null
      ? `Letzte Modernisierung: ${property.lastModernizationYear}`
      : '',
    property.fittedKitchen === true ? 'Einbauküche: vorhanden' : '',
    property.shower === true ? 'Dusche: vorhanden' : '',
    property.bathtub === true ? 'Badewanne: vorhanden' : '',
    property.guestToilet === true ? 'Gäste-WC: vorhanden' : '',
    property.heatingType ? `Heizungsart: ${property.heatingType}` : '',
    property.heatingEnergySource && !PLACEHOLDER_ENERGY_SOURCES.has(property.heatingEnergySource)
      ? `Energieträger (Heizung): ${property.heatingEnergySource}`
      : '',
    property.parkingSpaces != null ? `Stellplätze: ${property.parkingSpaces}` : '',
    property.garage === true ? 'Garage: vorhanden' : '',
    property.carport === true ? 'Carport: vorhanden' : '',
    property.balcony === true ? 'Balkon: vorhanden' : '',
    property.terrace === true ? 'Terrasse: vorhanden' : '',
    property.garden === true ? 'Garten: vorhanden' : '',
    property.gardenAreaM2 != null ? `Gartenfläche: ${property.gardenAreaM2} m²` : '',
    property.orientation ? `Ausrichtung: ${property.orientation}` : '',
    property.efficiencyClass ? `Energieeffizienzklasse: ${property.efficiencyClass}` : '',
    property.energyDemandKwhPerM2A != null
      ? `Endenergiebedarf: ${property.energyDemandKwhPerM2A} kWh/(m²·a)`
      : '',
    property.energyConsumptionKwhPerM2A != null
      ? `Endenergieverbrauch: ${property.energyConsumptionKwhPerM2A} kWh/(m²·a)`
      : '',
    property.primaryEnergySource && !PLACEHOLDER_ENERGY_SOURCES.has(property.primaryEnergySource)
      ? `Primärenergieträger: ${property.primaryEnergySource}`
      : '',
    property.askingPriceEur != null ? `Kaufpreis: ${property.askingPriceEur} €` : '',
    property.rentPriceEur != null ? `Kaltmiete: ${property.rentPriceEur} €/Monat` : '',
    property.depositEur != null ? `Kaution: ${property.depositEur} €` : '',
    property.hausgeldEur != null ? `Hausgeld: ${property.hausgeldEur} €/Monat` : '',
    property.maintenanceReserveEur != null
      ? `Instandhaltungsrücklage: ${property.maintenanceReserveEur} €`
      : '',
    property.coOwnershipShare ? `Miteigentumsanteil: ${property.coOwnershipShare}` : '',
    property.address.district ? `Stadtteil: ${property.address.district}` : '',
    property.address.city ? `Ort: ${property.address.city}` : '',
    property.address.postalCode ? `PLZ: ${property.address.postalCode}` : '',
  ];
  const address = section('Adresse', [
    [
      property.address.district,
      property.address.postalCode,
      property.address.city,
      property.address.state,
      property.address.country,
    ]
      .filter(Boolean)
      .join(', '),
  ]);
  return [section('Objektfakten', lines), address].filter(Boolean).join('\n');
}

function locationOf(input: MarketingContentInput): string {
  const location = input.location;
  const lines = [
    location.district ? `Stadtteil: ${location.district}` : '',
    ...(location.publicTransport?.length
      ? [`Öffentlicher Nahverkehr: ${location.publicTransport.join(', ')}`]
      : []),
    ...(location.schools?.length ? [`Schulen: ${location.schools.join(', ')}`] : []),
    ...(location.kindergartens?.length
      ? [`Kindergärten: ${location.kindergartens.join(', ')}`]
      : []),
    ...(location.shopping?.length
      ? [`Einkaufsmöglichkeiten: ${location.shopping.join(', ')}`]
      : []),
    ...(location.medical?.length
      ? [`Medizinische Versorgung: ${location.medical.join(', ')}`]
      : []),
    ...(location.recreation?.length ? [`Freizeit: ${location.recreation.join(', ')}`] : []),
    location.description ? `Lagebeschreibung: ${location.description}` : '',
  ];
  return section('Lageangaben', lines);
}

function listingOf(input: MarketingContentInput): string {
  const listing = input.listing;
  return section('Angebotsinformationen', [
    `Transaktion: ${listing.transactionType}`,
    listing.availableFrom ? `Verfügbar ab: ${listing.availableFrom}` : '',
  ]);
}

function userInfoOf(input: MarketingContentInput): string {
  const info = input.userInformation;
  const lines = [
    info.sellerDescription ? `Was die Immobilie besonders macht: ${info.sellerDescription}` : '',
    info.specialNotes ? `Was Interessenten wissen sollten: ${info.specialNotes}` : '',
    info.sellerNotes ? `Hinweise des Verkäufers: ${info.sellerNotes}` : '',
    info.additionalInformation ? `Weitere Angaben: ${info.additionalInformation}` : '',
    info.targetAudience ? `Zielgruppe: ${info.targetAudience}` : '',
  ];
  return section('Angaben des Nutzers (persönliche Perspektive, keine objektiven Fakten)', lines);
}

/** Builds the user message from the whitelist marketing input. */
export function buildUserMessage(input: MarketingContentInput): string {
  return [
    'Erstelle den Exposé-Inhalt ausschließlich aus den folgenden Angaben.',
    '',
    factsOf(input),
    locationOf(input),
    listingOf(input),
    userInfoOf(input),
    '',
    'Achte darauf, keine Fakten zu erfinden. Wenn eine Angabe fehlt, bleibt sie unerwähnt.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Minimal check whether the reviewed property contains enough facts for a
 * meaningful first draft. A bare default property (only a property type) does
 * not. The check runs against the same whitelist input the model receives, so
 * gate and generation can never disagree. It is deliberately conservative:
 * missing information must never be invented to fill the gap.
 */
export function hasSufficientPropertyInfo(property: Property): boolean {
  const facts = buildMarketingContentInput(property).property;
  const candidate = (value: unknown) =>
    value !== undefined && value !== null && value !== '' && value !== false && value !== 'unknown';
  return [
    facts.livingAreaM2,
    facts.usableAreaM2,
    facts.plotAreaM2,
    facts.totalRooms,
    facts.bedrooms,
    facts.bathrooms,
    facts.yearBuilt,
    facts.condition !== 'unknown' ? facts.condition : undefined,
    facts.renovationStatus,
    facts.fittedKitchen,
    facts.shower,
    facts.bathtub,
    facts.guestToilet,
    facts.parkingSpaces,
    facts.garage,
    facts.carport,
    facts.balcony,
    facts.terrace,
    facts.garden,
    facts.gardenAreaM2,
    facts.efficiencyClass,
    facts.energyDemandKwhPerM2A,
    facts.energyConsumptionKwhPerM2A,
    facts.primaryEnergySource,
    facts.askingPriceEur,
  ].some(candidate);
}
