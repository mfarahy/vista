import type { LocationIntelligence, Place, StructuredAddress } from './expose-data.js';
import type { Property } from './types.js';
import {
  DEFAULT_LOCATION_RADIUS_METERS,
  LOCATION_CACHE_TTL_MS,
  addressFromLegacy,
  addressKey,
  categoryLabel,
  distanceMetersBetween,
  formatAddress,
  getGeocodingProvider,
  getMapProvider,
  getRoutingProvider,
  locationSummary,
  normalizeStructuredAddress,
  searchNearbyFacilities,
  type Coordinates,
  type GeocodingProvider,
  type MapProvider,
  type PlacesProvider,
  type RoutingProvider,
} from '../external-services/location.js';
import { routeWithTravelMode } from './travel-mode.js';
import { getLogger } from './logger.js';

export interface LocationResolution {
  intelligence: LocationIntelligence | null;
  error?: string;
}

export function propertyAddress(property: Property): StructuredAddress {
  const canonical = property.exposeData?.basicInformation.address;
  if (
    canonical &&
    Object.values(canonical).some((value) => typeof value === 'string' && value.trim())
  )
    return normalizeStructuredAddress(canonical);
  return addressFromLegacy(property.address, property.zipCode, property.city, property.district);
}

function validAddress(address: StructuredAddress) {
  return Boolean(address.street || address.postalCode || address.city);
}

function cachedLocation(property: Property, address: StructuredAddress, radiusMeters: number) {
  const intelligence = property.exposeData?.location.intelligence;
  if (
    !intelligence ||
    addressKey(intelligence.address) !== addressKey(address) ||
    intelligence.radiusMeters !== radiusMeters
  )
    return null;
  if (Date.parse(intelligence.expiresAt) <= Date.now()) return null;
  return intelligence;
}

function mapMarkers(center: Coordinates, facilities: LocationIntelligence['facilities']) {
  const markers: Array<{
    latitude: number;
    longitude: number;
    label: string;
    category: 'property' | Place['category'];
  }> = [
    {
      latitude: center.latitude,
      longitude: center.longitude,
      label: 'Immobilie',
      category: 'property',
    },
  ];
  const seen = new Set<string>();
  for (const group of Object.values(facilities)) {
    // Only facilities with a verified route are selected for the map, so the
    // map never shows places that the Exposé cannot present with real
    // distances and travel times.
    const place = group.find((item) => item.route);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    markers.push({
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.name || categoryLabel(place.category),
      category: place.category,
    });
  }
  return markers;
}

/**
 * Requests a verified route for the nearest facility of each category and
 * attaches it to the place. Routing failures are per-facility: the facility
 * is simply skipped (no route), it never fails the resolution.
 */
async function attachRoutes(
  facilities: LocationIntelligence['facilities'],
  center: Coordinates,
  routingProvider: RoutingProvider,
) {
  const seen = new Set<string>();
  for (const group of Object.values(facilities)) {
    for (const place of group) {
      if (place.route || seen.has(place.id)) continue;
      // Only the closest candidate of each category is routed; the rest of
      // the list stays available in the data but is not presented.
      const isNearestOfCategory = !group.some(
        (other) => other.category === place.category && other.distanceMeters < place.distanceMeters,
      );
      if (!isNearestOfCategory) continue;
      seen.add(place.id);
      const route = await routeWithTravelMode(
        routingProvider,
        center,
        { latitude: place.latitude, longitude: place.longitude },
        place.distanceMeters,
      );
      if (route) place.route = route;
      else
        getLogger().warn(
          { propertyCategory: place.category, placeId: place.id },
          'No verified route for nearby facility {placeId}; facility will be skipped',
        );
    }
  }
}

export async function resolveLocation(
  property: Property,
  options: {
    refresh?: boolean;
    radiusMeters?: number;
    geocoder?: GeocodingProvider;
    places?: PlacesProvider;
    routing?: RoutingProvider;
    mapProvider?: MapProvider;
  } = {},
): Promise<LocationResolution> {
  const address = propertyAddress(property);
  const radiusMeters =
    options.radiusMeters ||
    Number(process.env.LOCATION_SEARCH_RADIUS_METERS) ||
    DEFAULT_LOCATION_RADIUS_METERS;
  if (!validAddress(address))
    return {
      intelligence: null,
      error: 'Der Standort konnte nicht ermittelt werden. Bitte geben Sie eine Adresse an.',
    };
  if (!options.refresh) {
    const cached = cachedLocation(property, address, radiusMeters);
    if (cached) return { intelligence: cached };
  }

  let geocoding;
  try {
    geocoding = await (options.geocoder || getGeocodingProvider()).geocode(address);
  } catch {
    return {
      intelligence: null,
      error: 'Der Standort konnte nicht ermittelt werden.',
    };
  }
  if (
    geocoding.ambiguous ||
    (geocoding.confidence != null && geocoding.confidence < 0.25 && geocoding.matchType !== 'house')
  ) {
    return {
      intelligence: null,
      error: 'Address could not be confidently resolved. Please verify the property location.',
    };
  }
  const center = { latitude: geocoding.latitude, longitude: geocoding.longitude };
  const facilities = await searchNearbyFacilities(center, radiusMeters, options.places);
  await attachRoutes(facilities, center, options.routing || getRoutingProvider());
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCATION_CACHE_TTL_MS);
  // A map failure never fails the location resolution: the Exposé section
  // degrades to the facility list without a map.
  let mapAsset: LocationIntelligence['mapAsset'];
  try {
    mapAsset = await (options.mapProvider || getMapProvider()).createStaticMap(
      center,
      mapMarkers(center, facilities),
      { radiusMeters },
    );
  } catch (error) {
    getLogger().warn({ err: error }, 'Static map generation failed; Exposé continues without a map');
  }
  const intelligence: LocationIntelligence = {
    address,
    coordinates: center,
    formattedAddress: geocoding.formattedAddress || formatAddress(address),
    source: 'geocoded',
    geocodingProvider: geocoding.provider,
    ...(geocoding.confidence != null ? { confidence: geocoding.confidence } : {}),
    ...(geocoding.matchType ? { matchType: geocoding.matchType } : {}),
    verificationRequired: false,
    facilities,
    radiusMeters,
    mapAsset,
    summary: locationSummary({ facilities, city: address.city, district: address.district }),
    generatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return { intelligence };
}

export async function createManualLocation(
  property: Property,
  coordinates: Coordinates,
  options: {
    radiusMeters?: number;
    places?: PlacesProvider;
    routing?: RoutingProvider;
    mapProvider?: MapProvider;
  } = {},
) {
  const address = propertyAddress(property);
  const radiusMeters =
    options.radiusMeters ||
    Number(process.env.LOCATION_SEARCH_RADIUS_METERS) ||
    DEFAULT_LOCATION_RADIUS_METERS;
  const facilities = await searchNearbyFacilities(coordinates, radiusMeters, options.places);
  await attachRoutes(facilities, coordinates, options.routing || getRoutingProvider());
  const now = new Date();
  let mapAsset: LocationIntelligence['mapAsset'];
  try {
    mapAsset = await (options.mapProvider || getMapProvider()).createStaticMap(
      coordinates,
      mapMarkers(coordinates, facilities),
      { radiusMeters },
    );
  } catch (error) {
    getLogger().warn({ err: error }, 'Static map generation failed; Exposé continues without a map');
  }
  const intelligence: LocationIntelligence = {
    address,
    coordinates,
    source: 'manual',
    verificationRequired: false,
    facilities,
    radiusMeters,
    mapAsset,
    summary: locationSummary({ facilities, city: address.city, district: address.district }),
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LOCATION_CACHE_TTL_MS).toISOString(),
  };
  return intelligence;
}

export function flattenFacilities(facilities: LocationIntelligence['facilities']) {
  return Object.values(facilities)
    .flat()
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function nearestFacility(
  facilities: LocationIntelligence['facilities'],
  category: Place['category'],
) {
  return flattenFacilities(facilities).find((place) => place.category === category);
}

export { addressKey, distanceMetersBetween, formatAddress };
