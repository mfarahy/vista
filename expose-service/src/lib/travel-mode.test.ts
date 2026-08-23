import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RouteResult, RoutingProvider, TravelMode } from '../external-services/routing.js';
import {
  BIKING_MAX_METERS,
  TRANSIT_ADVANTAGE_RATIO,
  TRANSIT_MAX_METERS,
  WALKING_MAX_METERS,
  preferredModes,
  routeWithTravelMode,
} from './travel-mode.js';

const from = { latitude: 52.52, longitude: 13.405 };

function route(mode: TravelMode, distanceMeters: number, durationSeconds: number): RouteResult {
  return { distanceMeters, durationSeconds, travelMode: mode, provider: 'test' };
}

function providerWith(
  routes: Partial<Record<TravelMode, RouteResult | Error>>,
  transitSupported = false,
): RoutingProvider {
  return {
    supports: (mode) => transitSupported || mode !== 'transit',
    route: async (_from, _to, mode) => {
      const result = routes[mode];
      if (result instanceof Error) throw result;
      if (!result) throw new Error(`unexpected mode ${mode}`);
      return result;
    },
  };
}

describe('preferredModes', () => {
  it('prefers walking for short distances', () => {
    assert.deepEqual(preferredModes(650), ['foot', 'bike', 'car']);
  });

  it('prefers cycling in the medium band', () => {
    assert.deepEqual(preferredModes(3000), ['bike', 'car']);
  });

  it('prefers driving beyond cycling distance', () => {
    assert.deepEqual(preferredModes(6000), ['car']);
    assert.deepEqual(preferredModes(BIKING_MAX_METERS), ['bike', 'car']);
    assert.deepEqual(preferredModes(WALKING_MAX_METERS), ['foot', 'bike', 'car']);
  });

  it('considers public transport only in its band and when supported', () => {
    assert.deepEqual(preferredModes(8000, true), ['transit', 'car']);
    assert.deepEqual(preferredModes(8000, false), ['car']);
    assert.deepEqual(preferredModes(2000, true), ['bike', 'car']);
    assert.deepEqual(preferredModes(20000, true), ['car']);
  });
});

describe('routeWithTravelMode', () => {
  it('returns the walking route for a short destination', async () => {
    const provider = providerWith({ foot: route('foot', 700, 540) });
    const result = await routeWithTravelMode(provider, from, from, 650);
    assert.deepEqual(result, route('foot', 700, 540));
  });

  it('falls back to cycling when walking fails', async () => {
    const provider = providerWith({
      foot: new Error('no foot path'),
      bike: route('bike', 3100, 720),
    });
    const result = await routeWithTravelMode(provider, from, from, 3000);
    assert.equal(result?.travelMode, 'bike');
  });

  it('falls back through all modes and returns null when routing fails entirely', async () => {
    const provider = providerWith({
      foot: new Error('fail'),
      bike: new Error('fail'),
      car: new Error('fail'),
    });
    const result = await routeWithTravelMode(provider, from, from, 6000);
    assert.equal(result, null);
  });

  it('does not call modes the provider does not support', async () => {
    let calls = 0;
    const provider: RoutingProvider = {
      supports: () => false,
      route: async () => {
        calls += 1;
        return route('car', 100, 60);
      },
    };
    const result = await routeWithTravelMode(provider, from, from, 6000);
    assert.equal(result, null);
    assert.equal(calls, 0);
  });

  it('uses driving for far destinations', async () => {
    const provider = providerWith({ car: route('car', 7200, 660) });
    const result = await routeWithTravelMode(provider, from, from, 6000);
    assert.equal(result?.travelMode, 'car');
  });

  it('prefers public transport only when it beats driving by a meaningful margin', async () => {
    const transit = route('transit', 9000, 700);
    const car = route('car', 8000, 900);
    const provider = providerWith({ transit, car }, true);
    const result = await routeWithTravelMode(provider, from, from, 8000);
    assert.equal(result?.travelMode, 'transit');
  });

  it('keeps driving when public transport has no meaningful advantage', async () => {
    const transit = route('transit', 9000, 880);
    const car = route('car', 8000, 900);
    const provider = providerWith({ transit, car }, true);
    const result = await routeWithTravelMode(provider, from, from, 8000);
    assert.equal(result?.travelMode, 'car');
  });

  it('accepts public transport when driving is unavailable', async () => {
    const transit = route('transit', 9000, 700);
    const provider = providerWith({ transit, car: new Error('no car route') }, true);
    const result = await routeWithTravelMode(provider, from, from, 8000);
    assert.equal(result?.travelMode, 'transit');
  });

  it('requires a strictly meaningful advantage at the ratio boundary', async () => {
    const transit = route('transit', 9000, Math.round(1000 * TRANSIT_ADVANTAGE_RATIO));
    const car = route('car', 8000, 1000);
    const provider = providerWith({ transit, car }, true);
    const result = await routeWithTravelMode(provider, from, from, 8000);
    assert.equal(result?.travelMode, 'car');
    const faster = route('transit', 9000, Math.round(1000 * TRANSIT_ADVANTAGE_RATIO) - 1);
    const providerFaster = providerWith({ transit: faster, car }, true);
    const resultFaster = await routeWithTravelMode(providerFaster, from, from, 8000);
    assert.equal(resultFaster?.travelMode, 'transit');
  });

  it('returns the nearest-facility distance band even beyond the transit maximum', async () => {
    const transit = route('transit', 20000, 1200);
    const car = route('car', 19000, 1300);
    const provider = providerWith({ transit, car }, true);
    const result = await routeWithTravelMode(provider, from, from, TRANSIT_MAX_METERS + 5000);
    assert.equal(result?.travelMode, 'car');
  });
});