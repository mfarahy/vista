import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { fetchBorisEnrichment, normalizeBorisFeature, borisCoversCoordinates } from "./boris.js";

const feature = {
  id: "DEBBBR001WQ0011z",
  properties: {
    bodenrichtwert: 420,
    stichtag: "2026-01-01",
    bodenrichtwertNummer: "00100001",
    bodenrichtwertzoneName: "Testzone",
    entwicklungszustand: "1000",
    nutzung: { art: "1130" },
    bauweise: "1100",
    beitragsrechtlicherZustand: "2000",
    bodenrichtwertKlassifikation: "1000",
    vollgeschosszahl: [2],
  },
};

describe("BORIS enrichment", () => {
  it("detects whether coordinates fall inside the BORIS bounding box", () => {
    assert.equal(borisCoversCoordinates({ latitude: 52.4349, longitude: 12.4983 }), true);
    assert.equal(borisCoversCoordinates({ latitude: 52.52, longitude: 13.405 }), true);
    assert.equal(borisCoversCoordinates({ latitude: 48.8566, longitude: 2.3522 }), false);
    assert.equal(borisCoversCoordinates({ latitude: Number.NaN, longitude: 13.4 }), false);
    assert.equal(borisCoversCoordinates({ latitude: 90, longitude: 13.4 }), false);
  });

  it("normalizes a BORIS feature into a useful enrichment object", () => {
    const enrichment = normalizeBorisFeature(feature as any);
    assert.equal(enrichment.available, true);
    assert.equal(enrichment.source, "BORIS Brandenburg");
    assert.equal(enrichment.referenceDate, "2026-01-01");
    assert.equal(enrichment.bodenrichtwert?.value, 420);
    assert.equal(enrichment.bodenrichtwert?.unit, "EUR/m²");
    assert.equal(enrichment.zone?.name, "Testzone");
    assert.equal(enrichment.zone?.id, "DEBBBR001WQ0011z");
    assert.equal(enrichment.landUse, "allgemeines Wohngebiet (WA)");
    assert.equal(enrichment.developmentState, "Baureifes Land (B)");
    assert.equal(enrichment.valueDeterminingCharacteristics.bauweise, "offene Bauweise (o)");
    assert.equal((enrichment.valueDeterminingCharacteristics.vollgeschosszahl as number[])?.[0], 2);
    assert.equal(enrichment.raw?.bodenrichtwert, 420);
    assert.ok(Date.parse(enrichment.retrievedAt));
  });

  it("does not invent a bodenrichtwert when the API omits it", () => {
    const enrichment = normalizeBorisFeature({ properties: { stichtag: "2026-01-01", bodenrichtwertzoneName: "Zone" } } as any);
    assert.equal(enrichment.bodenrichtwert, undefined);
    assert.equal(enrichment.zone?.name, "Zone");
  });

  it("returns null for coordinates outside coverage without calling the API", async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error("should not be called"); }) as any;
    const result = await fetchBorisEnrichment({ latitude: 48.85, longitude: 2.35 });
    assert.equal(result, null);
    assert.equal(calls, 0);
  });

  it("returns an enrichment for a covered point", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ features: [feature] }) })) as any;
    const result = await fetchBorisEnrichment({ latitude: 52.4349, longitude: 12.4983 });
    assert.equal(result?.available, true);
    assert.equal(result?.bodenrichtwert?.value, 420);
  });

  it("returns null when the API has no matching zone", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ features: [] }) })) as any;
    assert.equal(await fetchBorisEnrichment({ latitude: 52.52, longitude: 13.405 }), null);
  });

  it("returns null on API failure or malformed payload", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 500 })) as any;
    assert.equal(await fetchBorisEnrichment({ latitude: 52.4349, longitude: 12.4983 }), null);
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ nope: true }) })) as any;
    assert.equal(await fetchBorisEnrichment({ latitude: 52.4349, longitude: 12.4983 }), null);
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });
});
