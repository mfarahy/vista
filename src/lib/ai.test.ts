import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { generateExposeContent } from "./ai.ts";
import { exposeHTML } from "./expose-template";

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

  it("renders actual image assets instead of uploaded filenames", async () => {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    const filePath = path.join(uploadsDir, "Screenshot_1.png");
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAF" +
      "A1yA7AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJ0UkG" +
      "AAAAAAgIY4QAAAAAASUVORK5CYII=",
      "base64",
    );
    await fs.writeFile(filePath, tinyPng);

    const property = {
      id: "property-2",
      propertyType: "apartment",
      transactionType: "sale",
      city: "Berlin",
      district: "Friedrichshain",
      askingPrice: 420000,
      selectedFeatures: ["balcony"],
      additionalFeatures: "modern kitchen",
      surroundings: { transport: "nearby subway" },
      tone: "professional",
      language: "de",
      images: [{
        id: "image-1",
        url: "/uploads/Screenshot_1.png",
        fileName: "Screenshot_1.png",
        mimeType: "image/png",
        size: 100,
        sequence: 0,
        isCover: true,
      }],
      roomsData: [],
    } as any;

    const html = await exposeHTML(property, {
      title: "Apartment Berlin",
      portalTitle: "Apartment Berlin",
      shortDescription: "Modern apartment in Berlin",
      mainDescription: "A well-balanced home with a flexible layout.",
      highlights: ["Balcony", "Modern kitchen"],
      roomDescriptions: [],
      locationDescription: "A lively district close to transport.",
      targetAudience: "Owner-occupiers",
      factualSnapshot: ["86 m² living area"],
    });

    assert.ok(html.includes("data:image/png;base64,"));
    assert.ok(!html.includes("Screenshot_1.png"));
    assert.ok(!html.includes("/uploads/Screenshot_1.png"));
  });
});
