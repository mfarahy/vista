import type { DocumentType, ExtractedField } from '../types.js';

/**
 * Rule-based extraction of property information from the OCR text of a
 * document. The source is the normalized text produced by the analysis
 * provider; evidence is the matched snippet, and confidence is null because
 * the OCR pipeline does not provide a reliable per-field confidence value.
 */

export function detectDocumentType(text: string): DocumentType {
  const check = (pattern: RegExp) => pattern.test(text);
  if (check(/grundbuch/i)) return 'grundbuchauszug';
  if (check(/flurkarte|lageplan|flurplan/i)) return 'lageplan';
  if (check(/grundriss|grundriß/i)) return 'grundriss';
  if (
    check(
      /energieausweis|energieeffizienzklasse|endenergie(?:bedarf|verbrauch)|energieverbrauchsausweis/i,
    )
  )
    return 'energieausweis';
  if (check(/wohnfl(?:ächen|aechen)berechnung/i)) return 'wohnflaechenberechnung';
  if (check(/kaufvertrag|notar/i)) return 'kaufvertrag';
  if (check(/expos(?:é|e)|objektbeschreibung/i)) return 'expose';
  return 'other';
}

function parseNumber(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

interface FieldRule {
  field: string;
  pattern: RegExp;
  transform?: (match: string) => string | number | boolean;
}

const NUMBER_RULES: FieldRule[] = [
  {
    field: 'livingArea',
    pattern: /\bWohnfläche\b[^\d]{0,25}(\d{1,4}(?:[.,]\d+)?)\s*m²?/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'plotArea',
    pattern:
      /\b(?:Grundstücksfläche|Grundstuecksflaeche|Grundstücksgröße)\b[^\d]{0,25}(\d{1,6}(?:[.,]\d+)?)\s*m²?/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'rooms',
    pattern: /\b(\d{1,2})\s+Zimmer\b/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'bedrooms',
    pattern: /\b(\d{1,2})\s+Schlafzimmer\b/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'bathrooms',
    pattern: /\b(\d{1,2})\s+(?:Badezimmer|Bäder)\b/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'yearBuilt',
    pattern: /\bBaujahr\b[^\d]{0,10}((?:18|19|20)\d{2})\b/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'numberOfFloors',
    pattern: /\b(\d{1,2})\s+(?:Stockwerke|Etagen)\b/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'energyClass',
    pattern: /\bEnergieeffizienzklasse\b[^\d]{0,10}([A-H])\b/i,
    transform: (match) => match.toUpperCase(),
  },
  {
    field: 'energyDemand',
    pattern: /\bEndenergiebedarf\b[^\d]{0,15}(\d{1,4}(?:[.,]\d+)?)\s*kWh/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'energyConsumption',
    pattern: /\bEndenergieverbrauch\b[^\d]{0,15}(\d{1,4}(?:[.,]\d+)?)\s*kWh/i,
    transform: (match) => parseNumber(match) ?? match,
  },
  {
    field: 'heatingType',
    pattern: /\b(?:Heizung|Heizungsart)\b[^A-Za-zÄÖÜäöüß]{0,15}([A-Za-zÄÖÜäöüß-]{3,30})/i,
    transform: (match) => match.trim(),
  },
  {
    field: 'parcelNumber',
    pattern: /\bFlurstück\b[\s:]{0,5}([A-Za-z0-9/\\-]{1,20})/i,
    transform: (match) => match.trim(),
  },
];

const PRESENCE_RULES: FieldRule[] = [
  {
    field: 'basement',
    pattern: /\bKeller\b/i,
    transform: () => true,
  },
  {
    field: 'parking',
    pattern: /\b(?:Stellplatz|Stellplätze|Parkplatz|Parkplätze|Tiefgarage|Garage)\b/i,
    transform: () => true,
  },
];

const ADDRESS_RULES: FieldRule[] = [
  {
    field: 'postalCode',
    pattern: /\b(\d{5})\b/,
  },
  {
    field: 'city',
    pattern: /\b(?:\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\- ]{2,40})\b/,
    transform: (match) => match.trim(),
  },
  {
    field: 'street',
    pattern:
      /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{2,60}(?:straße|strasse|weg|allee|platz|gasse|ring|damm|ufer|promenade))\s+(\d{1,4}[a-zA-Z]?)\b/i,
    transform: (match) => match.trim(),
  },
  {
    field: 'houseNumber',
    pattern:
      /\b(?:[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{2,60}(?:straße|strasse|weg|allee|platz|gasse|ring|damm|ufer|promenade))\s+(\d{1,4}[a-zA-Z]?)\b/i,
    transform: (match) => match.trim(),
  },
];

function detectPropertyType(
  text: string,
): { field: string; value: string; pattern: RegExp } | null {
  const rules: Array<[RegExp, string]> = [
    [/Eigentumswohnung|Etagenwohnung/i, 'apartment'],
    [/Doppelhaushälfte|Doppelhaushaelfte/i, 'semi-detached'],
    [/Reihenhaus/i, 'terraced'],
    [/Penthouse|Maisonette/i, 'penthouse'],
    [/Einfamilienhaus|Mehrfamilienhaus/i, 'house'],
  ];
  for (const [pattern, value] of rules) {
    if (pattern.test(text)) return { field: 'propertyType', value, pattern };
  }
  return null;
}

function evidenceFor(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - 30);
  return text
    .slice(start, match.index + match[0].length + 30)
    .replace(/\s+/g, ' ')
    .trim();
}

function applyRules(text: string, rules: FieldRule[], sourceDocumentId: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  for (const rule of rules) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    const raw = match[1];
    const value = rule.transform
      ? rule.transform(raw ?? '')
      : raw == null || raw === ''
        ? true
        : raw.trim();
    if (value === '' || value === undefined) continue;
    fields.push({
      field: rule.field,
      value: value as string | number | boolean,
      sourceDocumentId,
      evidence: evidenceFor(text, rule.pattern) || null,
      confidence: null,
    });
  }
  return fields;
}

export function extractFields(text: string, sourceDocumentId: string): ExtractedField[] {
  const fields = [
    ...applyRules(text, NUMBER_RULES, sourceDocumentId),
    ...applyRules(text, PRESENCE_RULES, sourceDocumentId),
    ...applyRules(text, ADDRESS_RULES, sourceDocumentId),
  ];

  const propertyType = detectPropertyType(text);
  if (propertyType) {
    fields.push({
      field: propertyType.field,
      value: propertyType.value,
      sourceDocumentId,
      evidence: evidenceFor(text, propertyType.pattern) || null,
      confidence: null,
    });
  }

  return fields;
}
