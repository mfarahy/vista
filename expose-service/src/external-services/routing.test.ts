import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OSRM_PROFILES,
  getRoutingProvider,
  osrmRouteUrl,
  parseOsrmRouteResponse,
} from './routing.js';

const from = { latitude: 52.52, longitude: 13.405 };
const to = { latitude: 52.521, longitude: 13.415 };

describe('osrm provider mapping', () => {
  it("builds OSRM route URLs in the provider's lon,lat order", () => {
    const url = osrmRouteUrl('https://routing.openstreetmap.de/routed-foot/route/v1', 'foot', from, to);
    assert.equal(
      url,
      'https://routing.openstreetmap.de/routed-foot/route/v1/foot/13.405,52.52;13.415,52.521?overview=false&alternatives=false&steps=false',
    );
  });

  it('trims trailing slashes from configured endpoints', () => {
    const url = osrmRouteUrl('https://example.com/route/v1/', 'bike', from, to);
    assert.ok(url.startsWith('https://example.com/route/v1/bike/'));
  });

  it('maps an OSRM response body to a RouteResult', () => {
    const result = parseOsrmRouteResponse(
      { code: 'Ok', routes: [{ distance: 654.3, duration: 478.2 }] },
      'foot',
    );
    assert.deepEqual(result, {
      distanceMeters: 654,
      durationSeconds: 478,
      travelMode: 'foot',
      provider: 'osrm',
    });
  });

  it('returns null when OSRM reports no route (never fabricates data)', () => {
    assert.equal(
      parseOsrmRouteResponse({ code: 'NoRoute', routes: [] }, 'car'),
      null,
    );
    assert.equal(parseOsrmRouteResponse({ code: 'Ok', routes: [] }, 'car'), null);
    assert.equal(parseOsrmRouteResponse(null, 'car'), null);
    assert.equal(parseOsrmRouteResponse({ code: 'Ok' }, 'car'), null);
    assert.equal(
      parseOsrmRouteResponse({ code: 'Ok', routes: [{ distance: -1, duration: 60 }] }, 'car'),
      null,
    );
  });

  it('uses the provider profile per travel mode', () => {
    assert.equal(OSRM_PROFILES.foot, 'foot');
    assert.equal(OSRM_PROFILES.bike, 'bike');
    assert.equal(OSRM_PROFILES.car, 'driving');
  });

  it('is opt-in via ROUTING_PROVIDER and rejects transit', async () => {
    const previous = process.env.ROUTING_PROVIDER;
    try {
      delete process.env.ROUTING_PROVIDER;
      const unconfigured = getRoutingProvider();
      assert.equal(unconfigured.supports('foot'), false);
      await assert.rejects(() => unconfigured.route(from, to, 'car'));

      process.env.ROUTING_PROVIDER = 'osrm';
      const osrm = getRoutingProvider();
      assert.equal(osrm.supports('foot'), true);
      assert.equal(osrm.supports('bike'), true);
      assert.equal(osrm.supports('car'), true);
      assert.equal(osrm.supports('transit'), false);
      await assert.rejects(() => osrm.route(from, to, 'transit'));
    } finally {
      if (previous === undefined) delete process.env.ROUTING_PROVIDER;
      else process.env.ROUTING_PROVIDER = previous;
    }
  });
});