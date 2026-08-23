import type {
  LocationIntelligence,
  Place,
  PlaceCategory,
  PropertyExposeData,
  StructuredAddress,
} from '../lib/expose-data.js';
import { getLogger, trackExternalCall } from '../lib/logger.js';

function endpointPath(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodingResult extends Coordinates {
  formattedAddress: string;
  provider: string;
  confidence?: number;
  matchType?: string;
  ambiguous?: boolean;
}

export interface GeocodingProvider {
  geocode(address: StructuredAddress): Promise<GeocodingResult>;
}

export interface AddressSuggestion extends StructuredAddress {
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

export interface PlacesProvider {
  searchNearby(
    latitude: number,
    longitude: number,
    category: PlaceCategory,
    radiusMeters: number,
  ): Promise<Place[]>;
}

export interface MapMarker extends Coordinates {
  label: string;
  category: PlaceCategory | 'property';
}

export interface MapAsset {
  assetId: string;
  url: string;
  mimeType: 'image/svg+xml';
  caption: string;
}

export interface MapProvider {
  createStaticMap(
    center: Coordinates,
    markers: MapMarker[],
    options?: { width?: number; height?: number; radiusMeters?: number },
  ): Promise<MapAsset>;
}

export const DEFAULT_LOCATION_RADIUS_METERS = 1000;
export const LOCATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const defaultCountry = 'Deutschland';
const trim = (value: string | null | undefined) => value?.trim() || null;

export function normalizeStructuredAddress(address: StructuredAddress): StructuredAddress {
  return {
    street: trim(address.street),
    houseNumber: trim(address.houseNumber),
    postalCode: trim(address.postalCode),
    city: trim(address.city),
    district: trim(address.district),
    ...(address.state ? { state: trim(address.state) } : {}),
    country: trim(address.country) || defaultCountry,
    ...(address.formattedAddress ? { formattedAddress: trim(address.formattedAddress) } : {}),
    ...(address.latitude != null ? { latitude: address.latitude } : {}),
    ...(address.longitude != null ? { longitude: address.longitude } : {}),
  };
}

export function parseLegacyStreet(value: string | null | undefined) {
  const input = trim(value);
  if (!input) return { street: null, houseNumber: null };
  const match = input.match(/^(.*?)[, ]+([0-9]+[a-zA-Z]?[-/]?[0-9a-zA-Z]*)$/);
  return match
    ? { street: trim(match[1]), houseNumber: trim(match[2]) }
    : { street: input, houseNumber: null };
}

export function addressFromLegacy(
  address: string | null | undefined,
  postalCode: string | null | undefined,
  city: string | null | undefined,
  district: string | null | undefined,
): StructuredAddress {
  const parsed = parseLegacyStreet(address);
  return normalizeStructuredAddress({
    street: parsed.street,
    houseNumber: parsed.houseNumber,
    postalCode,
    city,
    district,
    country: defaultCountry,
  });
}

export function addressKey(address: StructuredAddress) {
  const normalized = normalizeStructuredAddress(address);
  return [
    normalized.street,
    normalized.houseNumber,
    normalized.postalCode,
    normalized.city,
    normalized.country,
  ]
    .map((part) => part?.toLocaleLowerCase('de-DE') || '')
    .join('|');
}

export function formatAddress(address: StructuredAddress) {
  const normalized = normalizeStructuredAddress(address);
  return [
    [normalized.street, normalized.houseNumber].filter(Boolean).join(' '),
    [normalized.postalCode, normalized.city].filter(Boolean).join(' '),
    normalized.country,
  ]
    .filter(Boolean)
    .join(', ');
}

class UnconfiguredProviderError extends Error {
  constructor(kind: string) {
    super(`${kind} provider is not configured`);
    this.name = 'UnconfiguredProviderError';
  }
}

class NominatimGeocodingProvider implements GeocodingProvider {
  async geocode(address: StructuredAddress): Promise<GeocodingResult> {
    const query = formatAddress(address);
    const endpoint = process.env.GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org/search';
    const response = await trackExternalCall(
      {
        service: 'nominatim',
        operation: 'geocode',
        method: 'GET',
        path: endpointPath(endpoint),
        status: (result) => (result as Response).status,
      },
      () =>
        fetch(
          `${endpoint}?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`,
          {
            headers: {
              Accept: 'application/json',
              'User-Agent': process.env.GEOCODING_USER_AGENT || 'Vista/1.0 location resolver',
            },
          },
        ),
    );
    if (!response.ok) {
      const error = new Error(`Geocoding provider returned ${response.status}`);
      (error as { status?: number }).status = response.status;
      throw error;
    }
    const results = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      type?: string;
      importance?: number;
      address?: {
        house_number?: string;
        road?: string;
        postcode?: string;
        city?: string;
        town?: string;
        municipality?: string;
      };
    }>;
    const normalized = normalizeStructuredAddress(address);
    const normalizedStreet = normalized.street?.toLocaleLowerCase('de-DE');
    const normalizedCity = normalized.city?.toLocaleLowerCase('de-DE');
    const exactAddressMatch = (item: NonNullable<(typeof results)[number]>) => {
      const resultAddress = item.address;
      if (!resultAddress) return false;
      const resultCity = (
        resultAddress?.city ||
        resultAddress?.town ||
        resultAddress?.municipality
      )?.toLocaleLowerCase('de-DE');
      return (
        resultAddress?.house_number === normalized.houseNumber &&
        resultAddress.road?.toLocaleLowerCase('de-DE') === normalizedStreet &&
        resultAddress.postcode === normalized.postalCode &&
        resultCity === normalizedCity
      );
    };
    const first =
      results.find(
        (item) =>
          Number.isFinite(Number(item.lat)) &&
          Number.isFinite(Number(item.lon)) &&
          exactAddressMatch(item),
      ) ||
      results.find(
        (item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)),
      );
    if (!first) throw new Error('Der Standort konnte nicht ermittelt werden');
    const resultRoad = first.address?.road;
    const exactHouseMatch =
      first.address?.house_number === normalized.houseNumber &&
      resultRoad != null &&
      resultRoad.toLocaleLowerCase('de-DE') === normalized.street?.toLocaleLowerCase('de-DE');
    return {
      latitude: Number(first.lat),
      longitude: Number(first.lon),
      formattedAddress: first.display_name || query,
      provider: 'nominatim',
      confidence: first.importance,
      matchType: first.type,
      // Nominatim may return businesses at the exact property address as well as the house itself.
      ambiguous: results.length > 1 && !exactAddressMatch(first) && !exactHouseMatch,
    };
  }
}

export async function searchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const endpoint = process.env.GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org/search';
  const response = await trackExternalCall(
    {
      service: 'nominatim',
      operation: 'address-suggestions',
      method: 'GET',
      path: endpointPath(endpoint),
      status: (result) => (result as Response).status,
    },
    () =>
      fetch(
        `${endpoint}?format=jsonv2&limit=6&addressdetails=1&countrycodes=de&q=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': process.env.GEOCODING_USER_AGENT || 'Vista/1.0 address suggestions',
          },
        },
      ),
  );
  if (!response.ok) {
    const error = new Error(`Geocoding provider returned ${response.status}`);
    (error as { status?: number }).status = response.status;
    throw error;
  }
  const results = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
    address?: {
      road?: string;
      house_number?: string;
      postcode?: string;
      city?: string;
      town?: string;
      municipality?: string;
      suburb?: string;
      state?: string;
      country?: string;
    };
  }>;
  return results.flatMap((result) => {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const address = result.address || {};
    const structured: AddressSuggestion = {
      street: address.road || null,
      houseNumber: address.house_number || null,
      postalCode: address.postcode || null,
      city: address.city || address.town || address.municipality || null,
      district: address.suburb || null,
      state: address.state || null,
      country: address.country ?? defaultCountry,
      formattedAddress:
        result.display_name ||
        [
          address.road,
          address.house_number,
          address.postcode,
          address.city || address.town || address.municipality,
        ]
          .filter(Boolean)
          .join(', '),
      latitude,
      longitude,
    };
    return [structured];
  });
}

class UnconfiguredGeocodingProvider implements GeocodingProvider {
  geocode(): Promise<GeocodingResult> {
    return Promise.reject(new UnconfiguredProviderError('Geocoding'));
  }
}

const placeQueries: Partial<Record<PlaceCategory, string>> = {
  supermarket:
    'node["shop"="supermarket"](around:{radius},{lat},{lon});way["shop"="supermarket"](around:{radius},{lat},{lon});',
  grocery: 'node["shop"~"convenience|greengrocer"](around:{radius},{lat},{lon});',
  shopping_center:
    'node["shop"="mall"](around:{radius},{lat},{lon});way["shop"="mall"](around:{radius},{lat},{lon});',
  kindergarten:
    'node["amenity"="kindergarten"](around:{radius},{lat},{lon});way["amenity"="kindergarten"](around:{radius},{lat},{lon});',
  school:
    'node["amenity"="school"](around:{radius},{lat},{lon});way["amenity"="school"](around:{radius},{lat},{lon});',
  train_station:
    'node["railway"="station"](around:{radius},{lat},{lon});way["railway"="station"](around:{radius},{lat},{lon});',
  subway: 'node["station"="subway"](around:{radius},{lat},{lon});',
  tram: 'node["railway"="tram_stop"](around:{radius},{lat},{lon});',
  bus_stop:
    'node["highway"="bus_stop"](around:{radius},{lat},{lon});node["public_transport"="platform"](around:{radius},{lat},{lon});',
  doctor:
    'node["amenity"="doctors"](around:{radius},{lat},{lon});way["amenity"="doctors"](around:{radius},{lat},{lon});',
  pharmacy:
    'node["amenity"="pharmacy"](around:{radius},{lat},{lon});way["amenity"="pharmacy"](around:{radius},{lat},{lon});',
  hospital:
    'node["amenity"="hospital"](around:{radius},{lat},{lon});way["amenity"="hospital"](around:{radius},{lat},{lon});',
  park: 'node["leisure"="park"](around:{radius},{lat},{lon});way["leisure"="park"](around:{radius},{lat},{lon});',
  playground:
    'node["leisure"="playground"](around:{radius},{lat},{lon});way["leisure"="playground"](around:{radius},{lat},{lon});',
  sports_facility:
    'node["leisure"~"sports_centre|pitch"](around:{radius},{lat},{lon});way["leisure"~"sports_centre|pitch"](around:{radius},{lat},{lon});',
  restaurant:
    'node["amenity"="restaurant"](around:{radius},{lat},{lon});way["amenity"="restaurant"](around:{radius},{lat},{lon});',
  cafe: 'node["amenity"="cafe"](around:{radius},{lat},{lon});way["amenity"="cafe"](around:{radius},{lat},{lon});',
  bank: 'node["amenity"="bank"](around:{radius},{lat},{lon});way["amenity"="bank"](around:{radius},{lat},{lon});',
  post_office:
    'node["amenity"="post_office"](around:{radius},{lat},{lon});way["amenity"="post_office"](around:{radius},{lat},{lon});',
};

class OverpassPlacesProvider implements PlacesProvider {
  async searchNearby(
    latitude: number,
    longitude: number,
    category: PlaceCategory,
    radiusMeters: number,
  ) {
    const fragment = placeQueries[category];
    if (!fragment) return [];
    const query = `[out:json][timeout:15];(${fragment.replaceAll('{radius}', String(radiusMeters)).replaceAll('{lat}', String(latitude)).replaceAll('{lon}', String(longitude))});out center tags;`;
    const endpoint = process.env.PLACES_BASE_URL || 'https://overpass-api.de/api/interpreter';
    const response = await trackExternalCall(
      {
        service: 'overpass',
        operation: 'search-nearby',
        method: 'POST',
        path: endpointPath(endpoint),
        props: { category, radiusMeters },
        status: (result) => (result as Response).status,
      },
      () =>
        fetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'text/plain',
            'User-Agent': process.env.PLACES_USER_AGENT || 'Vista/1.0 location resolver',
          },
          body: query,
        }),
    );
    if (!response.ok) {
      const error = new Error(`Places provider returned ${response.status}`);
      (error as { status?: number }).status = response.status;
      throw error;
    }
    const body = (await response.json()) as {
      elements?: Array<{
        id?: number;
        lat?: number;
        lon?: number;
        center?: { lat?: number; lon?: number };
        tags?: Record<string, string>;
      }>;
    };
    return (body.elements || [])
      .flatMap((element): Place[] => {
        const placeLatitude = element.lat ?? element.center?.lat;
        const placeLongitude = element.lon ?? element.center?.lon;
        if (!Number.isFinite(placeLatitude) || !Number.isFinite(placeLongitude)) return [];
        const resolvedLatitude = placeLatitude as number;
        const resolvedLongitude = placeLongitude as number;
        return [
          {
            id: `${category}-${element.id ?? `${placeLatitude}-${placeLongitude}`}`,
            name: element.tags?.name || categoryLabel(category),
            category,
            latitude: resolvedLatitude,
            longitude: resolvedLongitude,
            address:
              [
                element.tags?.['addr:street'],
                element.tags?.['addr:housenumber'],
                element.tags?.['addr:postcode'],
                element.tags?.['addr:city'],
              ]
                .filter(Boolean)
                .join(' ') || undefined,
            distanceMeters: distanceMetersBetween(
              latitude,
              longitude,
              resolvedLatitude,
              resolvedLongitude,
            ),
            distanceType: 'straight_line',
            source: 'overpass',
          },
        ];
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 10);
  }
}

class EmptyPlacesProvider implements PlacesProvider {
  searchNearby(): Promise<Place[]> {
    return Promise.resolve([]);
  }
}

export function getGeocodingProvider(): GeocodingProvider {
  return process.env.GEOCODING_PROVIDER?.toLowerCase() === 'nominatim'
    ? new NominatimGeocodingProvider()
    : new UnconfiguredGeocodingProvider();
}

export function getPlacesProvider(): PlacesProvider {
  return process.env.PLACES_PROVIDER?.toLowerCase() === 'overpass'
    ? new OverpassPlacesProvider()
    : new EmptyPlacesProvider();
}

export function distanceMetersBetween(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const earthRadius = 6371008.8;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(fromLatitude)) *
      Math.cos(radians(toLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function categoryLabel(category: PlaceCategory) {
  const labels: Record<PlaceCategory, string> = {
    supermarket: 'Supermarkt',
    grocery: 'Lebensmittel',
    shopping_center: 'Einkaufszentrum',
    kindergarten: 'Kindergarten',
    school: 'Schule',
    train_station: 'Bahnhof',
    subway: 'U-Bahn',
    tram: 'Tram',
    bus_stop: 'Bushaltestelle',
    doctor: 'Arzt',
    pharmacy: 'Apotheke',
    hospital: 'Krankenhaus',
    park: 'Park',
    playground: 'Spielplatz',
    sports_facility: 'Sportstätte',
    restaurant: 'Restaurant',
    cafe: 'Café',
    bank: 'Bank',
    post_office: 'Post',
  };
  return labels[category];
}

export function categoryGroup(category: PlaceCategory): keyof LocationIntelligence['facilities'] {
  if (['supermarket', 'grocery', 'shopping_center'].includes(category)) return 'shopping';
  if (['kindergarten', 'school'].includes(category)) return 'education';
  if (['train_station', 'subway', 'tram', 'bus_stop'].includes(category)) return 'transport';
  if (['doctor', 'pharmacy', 'hospital'].includes(category)) return 'healthcare';
  if (['park', 'playground', 'sports_facility'].includes(category)) return 'recreation';
  return 'dailyLife';
}

function selectedCategories(): PlaceCategory[] {
  const configured = process.env.LOCATION_FACILITY_CATEGORIES?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) as PlaceCategory[] | undefined;
  return configured?.length
    ? configured
    : [
        'supermarket',
        'kindergarten',
        'school',
        'train_station',
        'bus_stop',
        'pharmacy',
        'park',
        'restaurant',
        'cafe',
      ];
}

function emptyFacilities(): LocationIntelligence['facilities'] {
  return {
    shopping: [],
    education: [],
    transport: [],
    healthcare: [],
    recreation: [],
    dailyLife: [],
  };
}

export async function searchNearbyFacilities(
  center: Coordinates,
  radiusMeters: number,
  provider = getPlacesProvider(),
) {
  const facilities = emptyFacilities();
  // Overpass instances enforce request-rate limits; keep the provider calls
  // serialized. A failing category is skipped with a warning — the Exposé
  // must still work when one category has no usable result.
  const results: Place[][] = [];
  for (const category of selectedCategories()) {
    try {
      results.push(
        await provider.searchNearby(center.latitude, center.longitude, category, radiusMeters),
      );
    } catch (error) {
      getLogger().warn(
        { err: error, category, radiusMeters },
        'Nearby-facility search failed for category {category}; category is skipped',
      );
    }
  }
  results.flat().forEach((place) => {
    place.distanceMeters = distanceMetersBetween(
      center.latitude,
      center.longitude,
      place.latitude,
      place.longitude,
    );
    facilities[categoryGroup(place.category)].push(place);
  });
  for (const group of Object.keys(facilities) as Array<keyof LocationIntelligence['facilities']>) {
    facilities[group] = facilities[group]
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 10);
  }
  return facilities;
}

function escSvg(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

class LocalStaticMapProvider implements MapProvider {
  async createStaticMap(
    center: Coordinates,
    markers: MapMarker[],
    options: { width?: number; height?: number; radiusMeters?: number } = {},
  ) {
    const width = options.width || 900;
    const height = options.height || 520;
    const radius = options.radiusMeters || 1000;
    const latitudeScale = 111320;
    const longitudeScale = Math.max(111320 * Math.cos((center.latitude * Math.PI) / 180), 1);

    // Fit the view to the property and the selected facilities (zoom/center
    // always include both). Without facilities the default radius view is used.
    const points = [
      center,
      ...markers.filter((marker) => marker.category !== 'property'),
    ];
    const latitudes = points.map((point) => point.latitude);
    const longitudes = points.map((point) => point.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);
    const spanLatMeters = Math.max((maxLat - minLat) * latitudeScale, radius * 0.4);
    const spanLonMeters = Math.max(
      (maxLon - minLon) * longitudeScale,
      radius * 0.4,
    );
    const metersPerPixelX = spanLonMeters / (width * 0.68);
    const metersPerPixelY = spanLatMeters / (height * 0.68);
    const mapScale = Math.max(metersPerPixelX, metersPerPixelY, 1);
    const project = (point: Coordinates) => ({
      x: width / 2 + ((point.longitude - center.longitude) * longitudeScale) / mapScale,
      y: height / 2 - ((point.latitude - center.latitude) * latitudeScale) / mapScale,
    });
    const safePoint = (point: { x: number; y: number }) => ({
      x: Math.max(64, Math.min(width - 64, point.x)),
      y: Math.max(44, Math.min(height - 56, point.y)),
    });

    // Subtle cartographic grid instead of synthetic roads: the schematic
    // must never pretend to be a real street map.
    const grid = Array.from({ length: Math.floor(width / 90) }, (_, index) => {
      const x = (index + 1) * 90;
      return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#dde5dd" stroke-width="1"/>`;
    })
      .concat(
        Array.from({ length: Math.floor(height / 90) }, (_, index) => {
          const y = (index + 1) * 90;
          return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#dde5dd" stroke-width="1"/>`;
        }),
      )
      .join('');

    const radiusPixels = Math.min(width, height) * 0.3;
    const radiusRing = `<circle cx="${width / 2}" cy="${height / 2}" r="${radiusPixels}" fill="none" stroke="#9db3a1" stroke-width="1.5" stroke-dasharray="4 8"/>`;

    const markerSvg = markers
      .map((marker) => {
        const point = safePoint(project(marker));
        if (marker.category === 'property') {
          return `<g><circle cx="${point.x}" cy="${point.y}" r="13" fill="#24352c" stroke="#f8f8f4" stroke-width="4"/><circle cx="${point.x}" cy="${point.y}" r="6" fill="#9db3a1"/><text x="${point.x}" y="${point.y + 34}" text-anchor="middle" class="label property-label">${escSvg(marker.label)}</text></g>`;
        }
        return `<g><circle cx="${point.x}" cy="${point.y}" r="8" fill="#5f7a68" stroke="#f8f8f4" stroke-width="3.5"/><text x="${point.x}" y="${point.y + 26}" text-anchor="middle" class="label">${escSvg(marker.label)}</text></g>`;
      })
      .join('');
    const legend = `<g class="legend"><rect x="28" y="24" width="${width - 56}" height="30" rx="15" fill="#f8f8f4" opacity="0.92"/><circle cx="48" cy="39" r="6" fill="#24352c" stroke="#f8f8f4" stroke-width="2"/><text x="60" y="43" class="legend-text">Immobilie</text><circle cx="130" cy="39" r="5" fill="#5f7a68" stroke="#f8f8f4" stroke-width="2"/><text x="140" y="43" class="legend-text">Umgebung</text><text x="${width - 34}" y="43" text-anchor="end" class="legend-text">Standortübersicht · ${escSvg(process.env.MAP_ATTRIBUTION || 'Vista')}</text></g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#eef2ee"/><g>${grid}</g>${radiusRing}${legend}<g font-family="Arial, sans-serif">${markerSvg}</g><style>.label{font-size:12.5px;font-weight:600;fill:#24352c;letter-spacing:0.02em}.property-label{font-weight:700}.legend-text{font-size:11.5px;fill:#57625a;letter-spacing:0.03em}</style></svg>`;
    return {
      assetId: 'location-map',
      url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      mimeType: 'image/svg+xml' as const,
      caption: 'Lage und Umgebung',
    };
  }
}

export { getRoutingProvider } from './routing.js';
export type { RouteResult, RoutingProvider, TravelMode } from './routing.js';

export function getMapProvider(): MapProvider {
  return new LocalStaticMapProvider();
}

/** The nearest facility of a group that has a verified route, if any. */
function nearestRouted(
  facilities: LocationIntelligence['facilities'][keyof LocationIntelligence['facilities']],
) {
  return facilities.find((place) => place.route);
}

const SUMMARY_GROUPS: Array<
  [keyof LocationIntelligence['facilities'], string]
> = [
  ['shopping', 'Einkaufsmöglichkeiten'],
  ['education', 'Bildungseinrichtungen'],
  ['transport', 'öffentliche Verkehrsmittel'],
  ['healthcare', 'Gesundheitsversorgung'],
  ['recreation', 'Parks'],
  ['dailyLife', 'Restaurants und Cafés'],
];

/** A foot route of up to 25 minutes counts as "zu Fuß erreichbar". */
const WALKABLE_MAX_SECONDS = 25 * 60;

function walkableGroups(facilities: LocationIntelligence['facilities']) {
  return SUMMARY_GROUPS.filter(([group]) =>
    facilities[group].some(
      (place) =>
        place.route?.travelMode === 'foot' &&
        place.route.durationSeconds <= WALKABLE_MAX_SECONDS,
    ),
  ).map(([, label]) => label);
}

/** Joins German list items: "A", "A und B", "A, B und C". */
export function joinGermanList(items: string[]) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} und ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/**
 * Deterministic location summary. Only facilities with a verified route are
 * mentioned; categories that are reachable on foot are called out
 * explicitly. Never invents distances or travel times.
 */
export function locationSummary(
  location: Pick<LocationIntelligence, 'facilities'> & {
    city?: string | null;
    district?: string | null;
  },
) {
  const city = [location.city, location.district].filter(Boolean).join(', ');
  const locationPrefix = city ? `Die Immobilie befindet sich in ${city}. ` : '';
  const capitalize = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);
  const walkable = walkableGroups(location.facilities);
  if (walkable.length) {
    return `${locationPrefix}${capitalize(joinGermanList(walkable))} sind fußläufig erreichbar.`;
  }
  const routedGroups = SUMMARY_GROUPS.filter(([group]) => nearestRouted(location.facilities[group]));
  if (routedGroups.length) {
    return `${locationPrefix}${capitalize(joinGermanList(routedGroups.map(([, label]) => label)))} sind in der ausgewählten Umgebung vertreten.`;
  }
  return city
    ? `Die Immobilie befindet sich in ${city}.`
    : 'Zur Umgebung liegen derzeit keine geprüften Angaben vor.';
}

export function locationAddressFromData(data: PropertyExposeData): StructuredAddress {
  return normalizeStructuredAddress(data.basicInformation.address);
}

export { UnconfiguredProviderError };
