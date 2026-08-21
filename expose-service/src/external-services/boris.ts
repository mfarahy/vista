import type { BorisEnrichment } from '../lib/expose-data.js';
import type { Coordinates } from './location.js';
import { trackExternalCall } from '../lib/logger.js';

/**
 * Minimal, isolated client for the Brandenburg BORIS OGC API.
 *
 * BORIS is an optional enrichment source: it only applies to coordinates that lie
 * inside Brandenburg's Bodenrichtwert zones. All failures (timeouts, non-2xx
 * responses, malformed payloads, no matching zone) resolve to `null` so the rest
 * of the address flow can continue untouched.
 *
 * Base URL is configurable via `BORIS_BASE_URL` so the client can be pointed at a
 * different deployment or replaced later.
 */

export const BORIS_DEFAULT_BASE_URL = 'https://ogc-api.geobasis-bb.de/boris';
export const BORIS_COLLECTION = 'br_bodenrichtwert';

/**
 * Global spatial coverage of the BORIS service as published on the landing page
 * (`extent.spatial.bbox`, CRS84: [minLon, minLat, maxLon, maxLat]). This is a cheap
 * local gate that avoids an unnecessary API call for coordinates clearly outside
 * Brandenburg. It intentionally over-approximates (the bounding rectangle also
 * covers parts of Berlin); the authoritative check is the degenerate bbox query
 * against the Bodenrichtwert zones below.
 */
export const BORIS_COVERAGE_BBOX = {
  minLon: 11.265772516623,
  minLat: 51.3590080790421,
  maxLon: 14.7657478309683,
  maxLat: 53.5590504652457,
};

export function getBorisBaseUrl() {
  return (process.env.BORIS_BASE_URL || BORIS_DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function borisCoversCoordinates(coordinates: Coordinates): boolean {
  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude))
    return false;
  const { minLon, minLat, maxLon, maxLat } = BORIS_COVERAGE_BBOX;
  return (
    coordinates.longitude >= minLon &&
    coordinates.longitude <= maxLon &&
    coordinates.latitude >= minLat &&
    coordinates.latitude <= maxLat
  );
}

// Verified codelist labels from https://ogc-api.geobasis-bb.de/boris/codelists
const LAND_USE: Record<string, string> = {
  '1100': 'Wohnbaufläche (W)',
  '1110': 'Kleinsiedlungsgebiet (WS)',
  '1120': 'reines Wohngebiet (WR)',
  '1130': 'allgemeines Wohngebiet (WA)',
  '1140': 'besonderes Wohngebiet (WB)',
  '1200': 'gemischte Baufläche (M)',
  '1210': 'Dorfgebiet (MD)',
  '1220': 'Dörfliches Wohngebiet (MDW)',
  '1230': 'Mischgebiet (MI)',
  '1240': 'Kerngebiet (MK)',
  '1250': 'Urbanes Gebiet (MU)',
  '1300': 'gewerbliche Baufläche (G)',
  '1310': 'Gewerbegebiet (GE)',
  '1320': 'Industriegebiet (GI)',
  '1400': 'Sonderbaufläche (S)',
  '1410': 'Sondergebiet für Erholung (SE)',
  '1420': 'sonstige Sondergebiete (SO)',
  '1500': 'Baufläche für Gemeinbedarf (GB)',
  '2000': 'landwirtschaftliche Fläche (L)',
  '2100': 'Acker (A)',
  '2200': 'Grünland (GR)',
  '2300': 'Erwerbsgartenbaufläche (EGA)',
  '2400': 'Anbaufläche für Sonderkulturen (SK)',
  '2500': 'Weingarten (WG)',
  '2600': 'Kurzumtriebsplantagen, Agroforst (KUP)',
  '2700': 'Unland, Geringstland, Bergweide, Moor (UN)',
  '2800': 'forstwirtschaftliche Fläche (F)',
  '3010': 'private Grünfläche (PG)',
  '3020': 'Kleingartenfläche (Bundeskleingartengesetz) (KGA)',
  '3030': 'Freizeitgartenfläche (FGA)',
  '3040': 'Campingplatz (CA)',
  '3050': 'Sportfläche (u.a. Golfplatz) (SPO)',
  '3060': 'sonstige private Fläche (SG)',
  '3070': 'Friedhof (FH)',
  '3080': 'Wasserfläche (WF)',
  '3090': 'Flughafen, Flugplätze usw. (FP)',
  '3100': 'private Parkplätze, Stellplatzfläche (PP)',
  '3110': 'Lagerfläche (LG)',
  '3120': 'Abbauland (AB)',
  '3130': 'Gemeinbedarfsfläche (kein Bauland) (GF)',
  '3140': 'Sondernutzungsfläche (SN)',
  '9998': 'Nach Quellenlage nicht zu spezifizieren',
};
const DEVELOPMENT_STATE: Record<string, string> = {
  '1000': 'Baureifes Land (B)',
  '2000': 'Rohbauland (R)',
  '3000': 'Bauerwartungsland (E)',
  '4000': 'Fläche der Land- und Forstwirtschaft (LF)',
  '5000': 'Sonstige Fläche (SF)',
};
const BUILDING_TYPE: Record<string, string> = {
  '1100': 'offene Bauweise (o)',
  '1200': 'geschlossene Bauweise (g)',
  '1300': 'abweichende Bauweise (a)',
  '2100': 'Einzelhäuser (eh)',
  '2200': 'Einzel- und Doppelhäuser (ed)',
  '2300': 'Doppelhaushälften (dh)',
  '2400': 'Reihenhäuser (rh)',
  '2500': 'Reihenmittelhäuser (rm)',
  '2600': 'Reihenendhäuser (re)',
};
const CONTRIBUTION_STATE: Record<string, string> = {
  '1000': 'beitragsfrei (frei)',
  '2000':
    'erschließungsbeitrags- bzw. kostenerstattungsbetragsfrei und beitragspflichtig nach Kommunalabgabenrecht (ebf)',
  '3000':
    'erschließungsbeitrags- bzw. kostenerstattungsbetragspflichtig und beitragspflichtig nach Kommunalabgabenrecht (ebp)',
};
const KLASSIFIKATION: Record<string, string> = {
  '1000': 'allgemeiner Bodenrichtwert',
  '2000': 'Bodenrichtwert nach steuerlichen Vorgaben',
  '3000': 'besonderer Bodenrichtwert',
  '4000': 'steuerlicher Bodenrichtwert wegen geänderter Qualität',
};

function label(table: Record<string, string>, code: unknown): string | undefined {
  return typeof code === 'string' && code ? (table[code] ?? code) : undefined;
}

function featureId(feature: Record<string, unknown>): string | undefined {
  const id = feature?.id;
  return typeof id === 'string' ? id : undefined;
}

interface BorisFeatureProperties {
  bodenrichtwert?: unknown;
  bodenrichtwertNummer?: unknown;
  bodenrichtwertzoneName?: unknown;
  stichtag?: unknown;
  nutzung?: { art?: unknown };
  entwicklungszustand?: unknown;
  bauweise?: unknown;
  beitragsrechtlicherZustand?: unknown;
  bodenrichtwertKlassifikation?: unknown;
  vollgeschosszahl?: unknown;
  [key: string]: unknown;
}

export function normalizeBorisFeature(feature: Record<string, unknown>): BorisEnrichment {
  const properties = (feature?.properties ?? {}) as BorisFeatureProperties;
  const bodenrichtwert = Number(properties.bodenrichtwert);
  const zoneId =
    typeof properties.bodenrichtwertNummer === 'string' ? properties.bodenrichtwertNummer : null;
  const zoneName =
    typeof properties.bodenrichtwertzoneName === 'string'
      ? properties.bodenrichtwertzoneName
      : null;
  const referenceDate = typeof properties.stichtag === 'string' ? properties.stichtag : null;

  const characteristics: Record<string, unknown> = {};
  if (Array.isArray(properties.vollgeschosszahl))
    characteristics.vollgeschosszahl = properties.vollgeschosszahl;
  const bauweise = label(BUILDING_TYPE, properties.bauweise);
  if (bauweise !== undefined) characteristics.bauweise = bauweise;
  const beitrag = label(CONTRIBUTION_STATE, properties.beitragsrechtlicherZustand);
  if (beitrag !== undefined) characteristics.beitragsrechtlicherZustand = beitrag;
  const klassifikation = label(KLASSIFIKATION, properties.bodenrichtwertKlassifikation);
  if (klassifikation !== undefined) characteristics.bodenrichtwertKlassifikation = klassifikation;

  const enrichment: BorisEnrichment = {
    available: true,
    source: 'BORIS Brandenburg',
    retrievedAt: new Date().toISOString(),
    referenceDate,
    zone: zoneId || zoneName ? { id: zoneId, name: zoneName } : undefined,
    bodenrichtwert: Number.isFinite(bodenrichtwert)
      ? { value: bodenrichtwert, unit: 'EUR/m²' }
      : undefined,
    landUse: label(LAND_USE, properties.nutzung?.art),
    developmentState: label(DEVELOPMENT_STATE, properties.entwicklungszustand),
    valueDeterminingCharacteristics: characteristics,
    raw: properties,
  };
  if (featureId(feature)) enrichment.zone = { ...enrichment.zone, id: featureId(feature) };
  return enrichment;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queries BORIS for the Bodenrichtwert zone containing the given coordinates.
 * Returns a normalized enrichment when covered, otherwise `null`. Never throws.
 */
export async function fetchBorisEnrichment(
  coordinates: Coordinates,
): Promise<BorisEnrichment | null> {
  if (!borisCoversCoordinates(coordinates)) return null;
  const baseUrl = getBorisBaseUrl();
  // Degenerate bbox selects only zones intersecting the exact point.
  const bbox = `${coordinates.longitude},${coordinates.latitude},${coordinates.longitude},${coordinates.latitude}`;
  const url = `${baseUrl}/collections/${BORIS_COLLECTION}/items?bbox=${encodeURIComponent(bbox)}&limit=1&f=json`;
  try {
    const response = await trackExternalCall(
      {
        service: 'boris',
        operation: 'bodenrichtwert-query',
        method: 'GET',
        path: `/collections/${BORIS_COLLECTION}/items`,
        status: (result) => (result as Response).status,
      },
      () =>
        fetchWithTimeout(url, { headers: { Accept: 'application/json' } }).then((response) => {
          if (!response.ok) {
            const error = new Error(`BORIS request rejected with status ${response.status}`);
            (error as { status?: number }).status = response.status;
            throw error;
          }
          return response;
        }),
    );
    const body = (await response.json()) as { features?: Array<Record<string, unknown>> };
    const feature = body?.features?.[0];
    if (!feature) return null;
    return normalizeBorisFeature(feature);
  } catch {
    // Optional enrichment source: all failures resolve to `null`.
    return null;
  }
}
