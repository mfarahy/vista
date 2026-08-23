import type { Coordinates, RouteResult, RoutingProvider, TravelMode } from '../external-services/routing.js';

/**
 * Deterministic travel-mode selection for nearby facilities.
 *
 * The Exposé must never invent travel times, so this module only decides
 * *which* travel mode to ask the routing provider for, in which order, and
 * under which conditions a mode's result is kept. All distances and durations
 * come from the provider.
 *
 * Rules (simple, deterministic):
 *
 *   - up to WALKING_MAX_METERS        -> walking, fallback cycling, driving
 *   - up to BIKING_MAX_METERS         -> cycling, fallback walking, driving
 *   - beyond                          -> driving, fallback cycling, walking
 *   - public transport (when the provider supports it, band
 *     TRANSIT_MIN..TRANSIT_MAX) is only chosen when it beats driving by a
 *     meaningful margin (TRANSIT_ADVANTAGE_RATIO), otherwise driving wins.
 */

export const WALKING_MAX_METERS = 1500;
export const BIKING_MAX_METERS = 5000;
export const TRANSIT_MIN_METERS = 3000;
export const TRANSIT_MAX_METERS = 15000;
export const TRANSIT_ADVANTAGE_RATIO = 0.8;

/**
 * Ordered list of travel modes to try for a given straight-line distance.
 * `transitSupported` comes from the provider so the same rule set works with
 * and without public-transport coverage.
 */
export function preferredModes(distanceMeters: number, transitSupported = false): TravelMode[] {
  const modes: TravelMode[] = [];
  if (transitSupported && distanceMeters > BIKING_MAX_METERS && distanceMeters <= TRANSIT_MAX_METERS) {
    modes.push('transit');
  }
  if (distanceMeters <= WALKING_MAX_METERS) modes.push('foot');
  if (distanceMeters <= BIKING_MAX_METERS) modes.push('bike');
  modes.push('car');
  return modes;
}

async function safeRoute(
  provider: RoutingProvider,
  from: Coordinates,
  to: Coordinates,
  mode: TravelMode,
): Promise<RouteResult | null> {
  if (!provider.supports(mode)) return null;
  try {
    return await provider.route(from, to, mode);
  } catch {
    // Routing failures are recoverable per facility: the next mode is tried
    // and the facility is skipped entirely when nothing works.
    return null;
  }
}

/**
 * Routes from the property to a facility, trying the preferred modes in
 * order. Returns null when no mode produced a route (the caller then skips
 * the facility). Public transport is only kept when it beats driving by a
 * meaningful margin; otherwise the driving result is used.
 */
export async function routeWithTravelMode(
  provider: RoutingProvider,
  from: Coordinates,
  to: Coordinates,
  distanceMeters: number,
): Promise<RouteResult | null> {
  const modes = preferredModes(distanceMeters, provider.supports('transit'));
  let carRoute: RouteResult | null = null;
  for (const mode of modes) {
    if (mode === 'transit') {
      const transitRoute = await safeRoute(provider, from, to, 'transit');
      if (!transitRoute) continue;
      if (!carRoute) carRoute = await safeRoute(provider, from, to, 'car');
      if (carRoute && transitRoute.durationSeconds < carRoute.durationSeconds * TRANSIT_ADVANTAGE_RATIO) {
        return transitRoute;
      }
      return carRoute ?? transitRoute;
    }
    const route = await safeRoute(provider, from, to, mode);
    if (route) {
      if (mode === 'car') carRoute = route;
      return route;
    }
  }
  return carRoute;
}