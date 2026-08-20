import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { describe, it } from "node:test";
import { exposeHTML } from "./lib/expose-template.js";
import { getGeocodingProvider, getPlacesProvider, distanceMetersBetween, type GeocodingProvider, type PlacesProvider } from "./external-services/location.js";
import { createManualLocation, resolveLocation } from "./lib/location-service.js";
import type { Property, StructuredExposeContent } from "./lib/types.js";

const enabled = process.env.RUN_LOCATION_INTEGRATION === "1";
const providersConfigured = process.env.GEOCODING_PROVIDER?.toLowerCase() === "nominatim" && process.env.PLACES_PROVIDER?.toLowerCase() === "overpass";
const skipReason = !enabled ? "Set RUN_LOCATION_INTEGRATION=1 to enable network integration tests" : !providersConfigured ? "Set GEOCODING_PROVIDER=nominatim and PLACES_PROVIDER=overpass to enable real providers" : undefined;

const property: Property = {
  id: "phase4-real-location",
  propertyType: "apartment",
  transactionType: "sale",
  address: "Weserstraße 42",
  zipCode: "12045",
  city: "Berlin",
  district: "Neukölln",
  selectedFeatures: [],
  surroundings: {},
  tone: "professional",
  language: "de",
  images: [],
  roomsData: [],
  exposeData: {
    basicInformation: { propertyType: "apartment", propertySubtype: null, title: "Phase 4 Integration", address: { street: "Weserstraße", houseNumber: "42", postalCode: "12045", city: "Berlin", district: "Neukölln", country: "Deutschland" } },
    location: { address: { street: "Weserstraße", houseNumber: "42", postalCode: "12045", city: "Berlin", district: "Neukölln", country: "Deutschland" } },
  } as Property["exposeData"],
};

function content(location: NonNullable<Awaited<ReturnType<typeof resolveLocation>>["intelligence"]>): StructuredExposeContent {
  return {
    version: 2,
    cover: { title: "Phase 4 Integration", location: "12045 Berlin · Neukölln" },
    overview: { facts: [{ label: "Standort", value: location.formattedAddress || "Weserstraße 42, Berlin" }] },
    objectInformation: { address: location.address },
    location: { description: location.summary, intelligence: location },
    vistaSection: { heading: "Vista", subtitle: "Integration", description: "Real location pipeline", steps: ["Adresse", "Koordinaten", "Umgebung"] },
  };
}

describe("real location pipeline", { skip: skipReason }, () => {
  it("runs geocoding, real POI search, cache, correction, map, and PDF", async () => {
    const previousCategories = process.env.LOCATION_FACILITY_CATEGORIES;
    process.env.LOCATION_FACILITY_CATEGORIES = "supermarket";
    try {
      const realGeocoder = getGeocodingProvider();
      const realPlaces = getPlacesProvider();
      let geocodeCalls = 0;
      let placesCalls = 0;
      const geocoder: GeocodingProvider = { geocode: async (address) => { geocodeCalls += 1; return realGeocoder.geocode(address); } };
      const places: PlacesProvider = { searchNearby: async (latitude, longitude, category, radiusMeters) => { placesCalls += 1; return realPlaces.searchNearby(latitude, longitude, category, radiusMeters); } };

      const first = await resolveLocation(property, { geocoder, places, radiusMeters: 1000 });
      assert.ok(first.intelligence, first.error);
      const location = first.intelligence!;
      assert.equal(location.geocodingProvider, "nominatim");
      assert.ok(geocodeCalls > 0, "real geocoder was not called");
      assert.ok(placesCalls > 0, "real POI provider was not called");
      const facilities = Object.values(location.facilities).flat();
      assert.ok(facilities.length > 0, "real POI provider returned no facilities for the test address");
      assert.ok(facilities.every((place) => place.source === "overpass"));
      assert.ok(facilities.every((place) => place.distanceMeters === distanceMetersBetween(location.coordinates.latitude, location.coordinates.longitude, place.latitude, place.longitude)));
      assert.ok(location.mapAsset?.url.startsWith("data:image/svg+xml;base64,"));

      const cachedProperty = { ...property, exposeData: { ...property.exposeData!, location: { ...property.exposeData!.location, intelligence: location } } };
      geocodeCalls = 0;
      placesCalls = 0;
      const cached = await resolveLocation(cachedProperty, { geocoder, places, radiusMeters: 1000 });
      assert.equal(cached.intelligence?.generatedAt, location.generatedAt);
      assert.equal(geocodeCalls, 0, "cached request called geocoder");
      assert.equal(placesCalls, 0, "cached request called POI provider");

      const changedProperty = { ...cachedProperty, exposeData: { ...cachedProperty.exposeData!, basicInformation: { ...cachedProperty.exposeData!.basicInformation, address: { ...cachedProperty.exposeData!.basicInformation.address, city: "Hamburg" } } } };
      let invalidationCalls = 0;
      await resolveLocation(changedProperty, {
        geocoder: { geocode: async () => { invalidationCalls += 1; return { ...location.coordinates, formattedAddress: "Changed address", provider: "nominatim" }; } },
        places: { searchNearby: async () => [] },
        radiusMeters: 1000,
      });
      assert.equal(invalidationCalls, 1, "changed address did not invalidate geocoding cache");

      const corrected = { latitude: location.coordinates.latitude + 0.001, longitude: location.coordinates.longitude + 0.001 };
      let correctedCenter: { latitude: number; longitude: number } | undefined;
      const manual = await createManualLocation(property, corrected, {
        places: {
          searchNearby: async (latitude, longitude, category) => [{ id: category, name: "Corrected test place", category, latitude: latitude + 0.001, longitude, distanceMeters: 0, distanceType: "straight_line" as const, source: "integration" }],
        },
        mapProvider: { createStaticMap: async (center) => { correctedCenter = center; return { assetId: "corrected-map", url: "data:image/svg+xml;base64,PHN2Zy8+", mimeType: "image/svg+xml" as const, caption: "Corrected map" }; } },
      });
      assert.equal(manual.source, "manual");
      assert.deepEqual(manual.coordinates, corrected);
      assert.deepEqual(correctedCenter, corrected);
      const correctedFacilities = Object.values(manual.facilities).flat();
      assert.ok(correctedFacilities.every((place) => place.distanceMeters === distanceMetersBetween(corrected.latitude, corrected.longitude, place.latitude, place.longitude)));

      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent(await exposeHTML(property, content(location)), { waitUntil: "networkidle" });
        const pdf = await page.pdf({ path: path.join(os.tmpdir(), "vista-phase4-location-integration.pdf"), format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
        assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
        assert.match(await page.locator("body").innerText(), /Lage|Umgebung/);
        assert.match(await page.locator("body").innerText(), new RegExp(facilities[0].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      } finally {
        await browser.close();
      }
    } finally {
      if (previousCategories === undefined) delete process.env.LOCATION_FACILITY_CATEGORIES;
      else process.env.LOCATION_FACILITY_CATEGORIES = previousCategories;
    }
  });
});
