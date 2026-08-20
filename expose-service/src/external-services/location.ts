import type {
  LocationIntelligence,
  Place,
  PlaceCategory,
  PropertyExposeData,
  StructuredAddress,
} from "../lib/expose-data.js";

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
  category: PlaceCategory | "property";
}

export interface MapAsset {
  assetId: string;
  url: string;
  mimeType: "image/svg+xml";
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

const defaultCountry = "Deutschland";
const trim = (value: string | null | undefined) => value?.trim() || null;

export function normalizeStructuredAddress(address: StructuredAddress): StructuredAddress {
  return {
    street: trim(address.street),
    houseNumber: trim(address.houseNumber),
    postalCode: trim(address.postalCode),
    city: trim(address.city),
    district: trim(address.district),
    country: trim(address.country) || defaultCountry,
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
  return [normalized.street, normalized.houseNumber, normalized.postalCode, normalized.city, normalized.country]
    .map((part) => part?.toLocaleLowerCase("de-DE") || "")
    .join("|");
}

export function formatAddress(address: StructuredAddress) {
  const normalized = normalizeStructuredAddress(address);
  return [
    [normalized.street, normalized.houseNumber].filter(Boolean).join(" "),
    [normalized.postalCode, normalized.city].filter(Boolean).join(" "),
    normalized.country,
  ].filter(Boolean).join(", ");
}

class UnconfiguredProviderError extends Error {
  constructor(kind: string) {
    super(`${kind} provider is not configured`);
    this.name = "UnconfiguredProviderError";
  }
}

class NominatimGeocodingProvider implements GeocodingProvider {
  async geocode(address: StructuredAddress): Promise<GeocodingResult> {
    const query = formatAddress(address);
    const endpoint = process.env.GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org/search";
    const response = await fetch(`${endpoint}?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/json", "User-Agent": process.env.GEOCODING_USER_AGENT || "Vista/1.0 location resolver" },
    });
    if (!response.ok) throw new Error(`Geocoding provider returned ${response.status}`);
    const results = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string; type?: string; importance?: number; address?: { house_number?: string; road?: string; postcode?: string; city?: string; town?: string; municipality?: string } }>;
    const normalized = normalizeStructuredAddress(address);
    const normalizedStreet = normalized.street?.toLocaleLowerCase("de-DE");
    const normalizedCity = normalized.city?.toLocaleLowerCase("de-DE");
    const exactAddressMatch = (item: NonNullable<typeof results[number]>) => {
      const resultAddress = item.address;
      if (!resultAddress) return false;
      const resultCity = (resultAddress?.city || resultAddress?.town || resultAddress?.municipality)?.toLocaleLowerCase("de-DE");
      return resultAddress?.house_number === normalized.houseNumber &&
        resultAddress.road?.toLocaleLowerCase("de-DE") === normalizedStreet &&
        resultAddress.postcode === normalized.postalCode &&
        resultCity === normalizedCity;
    };
    const first = results.find((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)) && exactAddressMatch(item))
      || results.find((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)));
    if (!first) throw new Error("Location could not be resolved");
    const resultRoad = first.address?.road;
    const exactHouseMatch = first.address?.house_number === normalized.houseNumber && resultRoad != null && resultRoad.toLocaleLowerCase("de-DE") === normalized.street?.toLocaleLowerCase("de-DE");
    return {
      latitude: Number(first.lat),
      longitude: Number(first.lon),
      formattedAddress: first.display_name || query,
      provider: "nominatim",
      confidence: first.importance,
      matchType: first.type,
      // Nominatim may return businesses at the exact property address as well as the house itself.
      ambiguous: results.length > 1 && !exactAddressMatch(first) && !exactHouseMatch,
    };
  }
}

class UnconfiguredGeocodingProvider implements GeocodingProvider {
  geocode(): Promise<GeocodingResult> {
    return Promise.reject(new UnconfiguredProviderError("Geocoding"));
  }
}

const placeQueries: Partial<Record<PlaceCategory, string>> = {
  supermarket: 'node["shop"="supermarket"](around:{radius},{lat},{lon});way["shop"="supermarket"](around:{radius},{lat},{lon});',
  grocery: 'node["shop"~"convenience|greengrocer"](around:{radius},{lat},{lon});',
  shopping_center: 'node["shop"="mall"](around:{radius},{lat},{lon});way["shop"="mall"](around:{radius},{lat},{lon});',
  kindergarten: 'node["amenity"="kindergarten"](around:{radius},{lat},{lon});way["amenity"="kindergarten"](around:{radius},{lat},{lon});',
  school: 'node["amenity"="school"](around:{radius},{lat},{lon});way["amenity"="school"](around:{radius},{lat},{lon});',
  train_station: 'node["railway"="station"](around:{radius},{lat},{lon});way["railway"="station"](around:{radius},{lat},{lon});',
  subway: 'node["station"="subway"](around:{radius},{lat},{lon});',
  tram: 'node["railway"="tram_stop"](around:{radius},{lat},{lon});',
  bus_stop: 'node["highway"="bus_stop"](around:{radius},{lat},{lon});node["public_transport"="platform"](around:{radius},{lat},{lon});',
  doctor: 'node["amenity"="doctors"](around:{radius},{lat},{lon});way["amenity"="doctors"](around:{radius},{lat},{lon});',
  pharmacy: 'node["amenity"="pharmacy"](around:{radius},{lat},{lon});way["amenity"="pharmacy"](around:{radius},{lat},{lon});',
  hospital: 'node["amenity"="hospital"](around:{radius},{lat},{lon});way["amenity"="hospital"](around:{radius},{lat},{lon});',
  park: 'node["leisure"="park"](around:{radius},{lat},{lon});way["leisure"="park"](around:{radius},{lat},{lon});',
  playground: 'node["leisure"="playground"](around:{radius},{lat},{lon});way["leisure"="playground"](around:{radius},{lat},{lon});',
  sports_facility: 'node["leisure"~"sports_centre|pitch"](around:{radius},{lat},{lon});way["leisure"~"sports_centre|pitch"](around:{radius},{lat},{lon});',
  restaurant: 'node["amenity"="restaurant"](around:{radius},{lat},{lon});way["amenity"="restaurant"](around:{radius},{lat},{lon});',
  cafe: 'node["amenity"="cafe"](around:{radius},{lat},{lon});way["amenity"="cafe"](around:{radius},{lat},{lon});',
  bank: 'node["amenity"="bank"](around:{radius},{lat},{lon});way["amenity"="bank"](around:{radius},{lat},{lon});',
  post_office: 'node["amenity"="post_office"](around:{radius},{lat},{lon});way["amenity"="post_office"](around:{radius},{lat},{lon});',
};

class OverpassPlacesProvider implements PlacesProvider {
  async searchNearby(latitude: number, longitude: number, category: PlaceCategory, radiusMeters: number) {
    const fragment = placeQueries[category];
    if (!fragment) return [];
    const query = `[out:json][timeout:15];(${fragment.replaceAll("{radius}", String(radiusMeters)).replaceAll("{lat}", String(latitude)).replaceAll("{lon}", String(longitude))});out center tags;`;
    const endpoint = process.env.PLACES_BASE_URL || "https://overpass-api.de/api/interpreter";
    const response = await fetch(endpoint, { method: "POST", headers: { Accept: "application/json", "Content-Type": "text/plain", "User-Agent": process.env.PLACES_USER_AGENT || "Vista/1.0 location resolver" }, body: query });
    if (!response.ok) throw new Error(`Places provider returned ${response.status}`);
    const body = (await response.json()) as { elements?: Array<{ id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> }> };
    return (body.elements || []).flatMap((element): Place[] => {
      const placeLatitude = element.lat ?? element.center?.lat;
      const placeLongitude = element.lon ?? element.center?.lon;
      if (!Number.isFinite(placeLatitude) || !Number.isFinite(placeLongitude)) return [];
      const resolvedLatitude = placeLatitude as number;
      const resolvedLongitude = placeLongitude as number;
      return [{
        id: `${category}-${element.id ?? `${placeLatitude}-${placeLongitude}`}`,
        name: element.tags?.name || categoryLabel(category),
        category,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        address: [element.tags?.["addr:street"], element.tags?.["addr:housenumber"], element.tags?.["addr:postcode"], element.tags?.["addr:city"]].filter(Boolean).join(" ") || undefined,
        distanceMeters: distanceMetersBetween(latitude, longitude, resolvedLatitude, resolvedLongitude),
        distanceType: "straight_line",
        source: "overpass",
      }];
    }).sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 10);
  }
}

class EmptyPlacesProvider implements PlacesProvider {
  searchNearby(): Promise<Place[]> { return Promise.resolve([]); }
}

export function getGeocodingProvider(): GeocodingProvider {
  return process.env.GEOCODING_PROVIDER?.toLowerCase() === "nominatim" ? new NominatimGeocodingProvider() : new UnconfiguredGeocodingProvider();
}

export function getPlacesProvider(): PlacesProvider {
  return process.env.PLACES_PROVIDER?.toLowerCase() === "overpass" ? new OverpassPlacesProvider() : new EmptyPlacesProvider();
}

export function distanceMetersBetween(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
  const earthRadius = 6371008.8;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(fromLatitude)) * Math.cos(radians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function categoryLabel(category: PlaceCategory) {
  const labels: Record<PlaceCategory, string> = {
    supermarket: "Supermarkt", grocery: "Lebensmittel", shopping_center: "Einkaufszentrum", kindergarten: "Kindergarten", school: "Schule", train_station: "Bahnhof", subway: "U-Bahn", tram: "Tram", bus_stop: "Bushaltestelle", doctor: "Arzt", pharmacy: "Apotheke", hospital: "Krankenhaus", park: "Park", playground: "Spielplatz", sports_facility: "Sportstätte", restaurant: "Restaurant", cafe: "Café", bank: "Bank", post_office: "Post", 
  };
  return labels[category];
}

export function categoryGroup(category: PlaceCategory): keyof LocationIntelligence["facilities"] {
  if (["supermarket", "grocery", "shopping_center"].includes(category)) return "shopping";
  if (["kindergarten", "school"].includes(category)) return "education";
  if (["train_station", "subway", "tram", "bus_stop"].includes(category)) return "transport";
  if (["doctor", "pharmacy", "hospital"].includes(category)) return "healthcare";
  if (["park", "playground", "sports_facility"].includes(category)) return "recreation";
  return "dailyLife";
}

function selectedCategories(): PlaceCategory[] {
  const configured = process.env.LOCATION_FACILITY_CATEGORIES?.split(",").map((item) => item.trim()).filter(Boolean) as PlaceCategory[] | undefined;
  return configured?.length ? configured : ["supermarket", "kindergarten", "school", "train_station", "bus_stop", "pharmacy", "park", "restaurant", "cafe"];
}

function emptyFacilities(): LocationIntelligence["facilities"] {
  return { shopping: [], education: [], transport: [], healthcare: [], recreation: [], dailyLife: [] };
}

export async function searchNearbyFacilities(center: Coordinates, radiusMeters: number, provider = getPlacesProvider()) {
  const facilities = emptyFacilities();
  // Overpass instances enforce request-rate limits; keep the provider calls serialized.
  const results: Place[][] = [];
  for (const category of selectedCategories()) {
    results.push(await provider.searchNearby(center.latitude, center.longitude, category, radiusMeters));
  }
  results.flat().forEach((place) => {
    place.distanceMeters = distanceMetersBetween(center.latitude, center.longitude, place.latitude, place.longitude);
    facilities[categoryGroup(place.category)].push(place);
  });
  for (const group of Object.keys(facilities) as Array<keyof LocationIntelligence["facilities"]>) {
    facilities[group] = facilities[group].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 10);
  }
  return facilities;
}

function escSvg(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

class LocalStaticMapProvider implements MapProvider {
  async createStaticMap(center: Coordinates, markers: MapMarker[], options: { width?: number; height?: number; radiusMeters?: number } = {}) {
    const width = options.width || 900;
    const height = options.height || 520;
    const radius = options.radiusMeters || 1000;
    const latitudeScale = 111320;
    const longitudeScale = Math.max(111320 * Math.cos(center.latitude * Math.PI / 180), 1);
    const project = (point: Coordinates) => ({
      x: width / 2 + ((point.longitude - center.longitude) * longitudeScale / radius) * width * 0.36,
      y: height / 2 - ((point.latitude - center.latitude) * latitudeScale / radius) * height * 0.36,
    });
    const safePoint = (point: { x: number; y: number }) => ({ x: Math.max(28, Math.min(width - 28, point.x)), y: Math.max(28, Math.min(height - 28, point.y)) });
    const roads = Array.from({ length: 7 }, (_, index) => {
      const y = ((index + 1) * height) / 8;
      return `<path d="M0 ${y} C ${width * .25} ${y - 36} ${width * .7} ${y + 36} ${width} ${y - 8}"/>`;
    }).join("");
    const markerSvg = markers.map((marker) => {
      const point = safePoint(project(marker));
      const property = marker.category === "property";
      const color = property ? "#26352b" : "#718b78";
      return `<g><circle cx="${point.x}" cy="${point.y}" r="${property ? 13 : 8}" fill="${color}" stroke="#f8f8f4" stroke-width="4"/><text x="${point.x + 14}" y="${point.y + 4}" class="label">${escSvg(marker.label)}</text></g>`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#e7eee8"/><g fill="none" stroke="#c1d0c4" stroke-width="14" opacity=".75">${roads}</g><g fill="none" stroke="#f8f8f4" stroke-width="4">${roads}</g><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * .33}" fill="none" stroke="#91aa97" stroke-dasharray="5 9"/><g font-family="Arial, sans-serif" font-size="16" fill="#26352b">${markerSvg}</g><text x="28" y="${height - 26}" font-family="Arial, sans-serif" font-size="12" fill="#718078">Standortübersicht · ${escSvg(process.env.MAP_ATTRIBUTION || "Vista")}</text></svg>`;
    return { assetId: "location-map", url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, mimeType: "image/svg+xml" as const, caption: "Lage und Umgebung" };
  }
}

export function getMapProvider(): MapProvider { return new LocalStaticMapProvider(); }

function nearest(facilities: LocationIntelligence["facilities"][keyof LocationIntelligence["facilities"]]) { return facilities[0]; }

export function locationSummary(location: Pick<LocationIntelligence, "facilities"> & { city?: string | null; district?: string | null }) {
  const placeGroups = [
    ["Einkaufsmöglichkeiten", nearest(location.facilities.shopping)],
    ["Bildungseinrichtungen", nearest(location.facilities.education)],
    ["öffentliche Verkehrsmittel", nearest(location.facilities.transport)],
    ["Gesundheitsversorgung", nearest(location.facilities.healthcare)],
    ["Parks", nearest(location.facilities.recreation)],
  ].filter(([, place]) => place);
  const city = [location.city, location.district].filter(Boolean).join(", ");
  if (!placeGroups.length) return city ? `Die Immobilie befindet sich in ${city}.` : "Zur Umgebung liegen derzeit keine geprüften Angaben vor.";
  return `${city ? `Die Immobilie befindet sich in ${city}. ` : ""}${placeGroups.map(([label]) => label).join(", ")} sind in der ausgewählten Umgebung vertreten.`;
}

export function locationAddressFromData(data: PropertyExposeData): StructuredAddress {
  return normalizeStructuredAddress(data.basicInformation.address);
}

export { UnconfiguredProviderError };
