/**
 * Deterministic location-relevance filter for location research claims.
 *
 * The research flow may return results about the wrong district (for example
 * Prenzlauer Berg content for a Neukölln property). This filter answers the
 * question "Is this claim plausibly about the property's location?" without
 * calling another LLM:
 *
 *   - a reference to the property's postal code, district or neighborhood is
 *     always relevant,
 *   - a claim about a different known district is only accepted when it is
 *     clearly a city-wide fact,
 *   - a city-wide fact (the city name without a different district) is
 *     accepted,
 *   - a claim without any location reference is kept: absence of the district
 *     name is never a reason to reject.
 *
 * The district vocabulary is intentionally small and deterministic; extend
 * it as more cities are covered.
 */

export interface LocationContext {
  district?: string;
  neighborhood?: string;
  city?: string;
  postalCode?: string;
}

export type LocationRelevance = 'relevant' | 'irrelevant';

/** Well-known Berlin districts (Bezirke and common Ortsteile). */
const BERLIN_DISTRICTS = [
  'Mitte',
  'Friedrichshain',
  'Kreuzberg',
  'Pankow',
  'Prenzlauer Berg',
  'Weißensee',
  'Charlottenburg',
  'Wilmersdorf',
  'Spandau',
  'Steglitz',
  'Zehlendorf',
  'Tempelhof',
  'Schöneberg',
  'Neukölln',
  'Britz',
  'Buckow',
  'Rudow',
  'Gropiusstadt',
  'Treptow',
  'Köpenick',
  'Marzahn',
  'Hellersdorf',
  'Lichtenberg',
  'Reinickendorf',
  'Wedding',
  'Moabit',
  'Tiergarten',
  'Grunewald',
  'Dahlem',
  'Lankwitz',
  'Lichterfelde',
  'Mariendorf',
  'Marienfelde',
  'Baumschulenweg',
  'Adlershof',
  'Altglienicke',
  'Wannsee',
  'Nikolassee',
  'Friedenau',
  'Schmargendorf',
  'Halensee',
  'Westend',
  'Haselhorst',
  'Siemensstadt',
] as const;

/**
 * District vocabulary per city. Claims that mention one of these districts for
 * the property's city but not the property's own district are treated as
 * other-district facts unless the claim is clearly city-wide.
 */
const DISTRICTS_BY_CITY: Record<string, readonly string[]> = {
  Berlin: BERLIN_DISTRICTS,
};

/** Normalizes a location name for substring matching (case and umlauts). */
export function normalizeLocationName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss');
}

function mentions(text: string, token: string): boolean {
  const needle = normalizeLocationName(token);
  if (!needle) return false;
  const pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z])${pattern}(?:[^a-z]|$)`).test(text);
}

/** City-wide markers that justify accepting a claim that names another district. */
const CITY_WIDE_MARKERS = [
  'netz',
  'stadtweit',
  'landesweit',
  'bezirksuebergreifend',
  'gesamte stadt',
  'ganze stadt',
  'gesamtes stadtgebiet',
  'ueberall in',
  'ueberall im',
  'verkehrsnetz',
];

function isCityWide(text: string): boolean {
  return CITY_WIDE_MARKERS.some((marker) => mentions(text, marker));
}

/**
 * Determines whether a research claim is plausibly about the property's
 * location. Deterministic; never calls a model.
 */
export function claimLocationRelevance(
  statement: string,
  context: LocationContext,
): LocationRelevance {
  const text = normalizeLocationName(statement);

  // Postal code references are the strongest location signal.
  if (context.postalCode && mentions(text, context.postalCode)) return 'relevant';

  // The property's own district or neighborhood makes the claim relevant.
  if (context.district && mentions(text, context.district)) return 'relevant';
  if (context.neighborhood && mentions(text, context.neighborhood)) return 'relevant';

  const knownDistricts = context.city ? DISTRICTS_BY_CITY[context.city] ?? [] : [];
  const ownLocations = [context.district, context.neighborhood]
    .filter((value): value is string => Boolean(value))
    .map(normalizeLocationName);
  const otherDistrict = knownDistricts.find(
    (district) => !ownLocations.includes(normalizeLocationName(district)) && mentions(text, district),
  );

  if (otherDistrict) {
    // A claim about a different district is only acceptable when it clearly
    // states a city-wide fact that also applies to the property.
    return context.city &&
      text.includes(normalizeLocationName(context.city)) &&
      isCityWide(text)
      ? 'relevant'
      : 'irrelevant';
  }

  // City-wide facts remain valid even without the district name. The city is
  // matched as a substring so forms like "Berliner" or "Berlin-" count too.
  if (context.city && text.includes(normalizeLocationName(context.city))) return 'relevant';

  // Absence of any location reference is never a reason to reject.
  return 'relevant';
}

/** Filters claims, keeping only those plausibly about the property location. */
export function filterClaimsForLocation<T extends { statement: string }>(
  claims: readonly T[],
  input: LocationContext,
): T[] {
  return claims.filter((claim) => claimLocationRelevance(claim.statement, input) === 'relevant');
}