import { trackExternalCall } from '../lib/logger.js';

/**
 * Routing provider boundary for the Location & Nearby Facilities feature.
 *
 * The rest of Vista depends only on `RoutingProvider`; provider-specific
 * response formats (OSRM JSON, ...) never leave this module. Routing is
 * opt-in like the other location providers: it is active only when
 * `ROUTING_PROVIDER=osrm` is set. When no provider is configured, facilities
 * simply carry no route and the Exposé degrades gracefully (no fabricated
 * distances or travel times are ever shown).
 */

export type TravelMode = 'foot' | 'bike' | 'car' | 'transit';

export interface RouteResult {
  /** Route distance in meters, as returned by the routing provider. */
  distanceMeters: number;
  /** Route duration in seconds, as returned by the routing provider. */
  durationSeconds: number;
  travelMode: TravelMode;
  /** Provider name for provenance, e.g. `osrm`. */
  provider: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RoutingProvider {
  /** Whether the provider can compute routes for the given travel mode. */
  supports(mode: TravelMode): boolean;
  route(from: Coordinates, to: Coordinates, mode: TravelMode): Promise<RouteResult>;
}

export const OSRM_PROFILES: Record<Exclude<TravelMode, 'transit'>, string> = {
  foot: 'foot',
  bike: 'bike',
  car: 'driving',
};

const DEFAULT_OSRM_ENDPOINTS: Record<Exclude<TravelMode, 'transit'>, string> = {
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1',
  car: 'https://router.project-osrm.org/route/v1',
};

function osrmEndpoint(mode: Exclude<TravelMode, 'transit'>): string {
  const envKey = (
    { foot: 'ROUTING_FOOT_BASE_URL', bike: 'ROUTING_BIKE_BASE_URL', car: 'ROUTING_CAR_BASE_URL' } as const
  )[mode];
  return process.env[envKey]?.replace(/\/+$/, '') || DEFAULT_OSRM_ENDPOINTS[mode];
}

/** Builds the OSRM route URL for a profile and coordinate pair. */
export function osrmRouteUrl(
  endpoint: string,
  profile: string,
  from: Coordinates,
  to: Coordinates,
): string {
  return `${endpoint.replace(/\/+$/, '')}/${profile}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false&alternatives=false&steps=false`;
}

/**
 * Maps an OSRM `route/v1` response body to a `RouteResult`. Returns null when
 * the response contains no usable route (no fabrication happens here).
 */
export function parseOsrmRouteResponse(
  body: unknown,
  mode: Exclude<TravelMode, 'transit'>,
): RouteResult | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as {
    code?: string;
    routes?: Array<{ distance?: number; duration?: number }>;
  };
  const route = candidate.routes?.[0];
  if (!route) return null;
  const distanceMeters = route.distance;
  const durationSeconds = route.duration;
  if (
    candidate.code !== 'Ok' ||
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationSeconds) ||
    (distanceMeters as number) < 0 ||
    (durationSeconds as number) < 0
  )
    return null;
  return {
    distanceMeters: Math.round(distanceMeters as number),
    durationSeconds: Math.round(durationSeconds as number),
    travelMode: mode,
    provider: 'osrm',
  };
}

function endpointPath(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

class OsrmRoutingProvider implements RoutingProvider {
  supports(mode: TravelMode): boolean {
    return mode !== 'transit';
  }

  async route(from: Coordinates, to: Coordinates, mode: TravelMode): Promise<RouteResult> {
    if (mode === 'transit') {
      const error = new Error('OSRM does not provide public-transport routing');
      (error as { status?: number }).status = 501;
      throw error;
    }
    const endpoint = osrmEndpoint(mode);
    const profile = OSRM_PROFILES[mode];
    const url = osrmRouteUrl(endpoint, profile, from, to);
    const response = await trackExternalCall(
      {
        service: 'osrm',
        operation: 'route',
        method: 'GET',
        path: endpointPath(url),
        props: { travelMode: mode },
        status: (result) => (result as Response).status,
      },
      () =>
        fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': process.env.PLACES_USER_AGENT || 'Vista/1.0 location resolver',
          },
        }),
    );
    if (!response.ok) {
      const error = new Error(`Routing provider returned ${response.status}`);
      (error as { status?: number }).status = response.status;
      throw error;
    }
    const route = parseOsrmRouteResponse(await response.json(), mode);
    if (!route) throw new Error('Routing provider returned no route for the requested coordinates');
    return route;
  }
}

class UnconfiguredRoutingProvider implements RoutingProvider {
  supports(): boolean {
    return false;
  }
  route(): Promise<RouteResult> {
    return Promise.reject(new Error('Routing provider is not configured'));
  }
}

export function getRoutingProvider(): RoutingProvider {
  return process.env.ROUTING_PROVIDER?.toLowerCase() === 'osrm'
    ? new OsrmRoutingProvider()
    : new UnconfiguredRoutingProvider();
}