import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { generateExposeContent } from "./ai.ts";

describe("generateExposeContent", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });

  it("falls back to demo content when the AI provider rejects the request", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    global.fetch = async () =>
      new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json" },
      });

    const property = {
      id: "property-1",
      propertyType: "apartment",
      transactionType: "sale",
      city: "Berlin",
      district: "Prenzlauer Berg",
      livingArea: 86,
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      selectedFeatures: ["balcony"],
      surroundings: { transport: "U2 nearby" },
      tone: "professional",
      language: "en",
      images: [],
      roomsData: [{
        id: "room-1",
        name: "Living room",
        type: "Living",
        size: 31,
        floor: "3rd floor",
        description: "Bright and airy",
        sequence: 0,
      }],
    } as any;

    const content = await generateExposeContent(property);

    assert.ok(content.title.length > 0);
    assert.ok(content.mainDescription.length > 0);
    assert.equal(content.title.includes("Berlin"), true);
  });
});
