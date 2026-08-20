import { exposeContentSchema } from "../lib/validation.js";
import type { ExposeContent, Property } from "../lib/types.js";

export interface AIInput {
  propertyType: string;
  transactionType: string;
  location: { city?: string | null; district?: string | null };
  metrics: Record<string, string | number | null | undefined>;
  features: string[];
  rooms: {
    id: string;
    name: string;
    type: string;
    size?: number | null;
    floor?: string | null;
    description?: string | null;
  }[];
  locationInformation: Record<string, string>;
  locationNote?: string | null;
  additionalInformation?: string | null;
  tone: string;
  language: string;
}

export function buildAIInput(property: Property): AIInput {
  return {
    propertyType: property.propertyType,
    transactionType: property.transactionType,
    location: { city: property.city, district: property.district },
    metrics: {
      livingArea: property.livingArea,
      plotArea: property.plotArea,
      rooms: property.rooms,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      floor: property.floor,
      constructionYear: property.constructionYear,
      condition: property.condition,
      askingPrice: property.askingPrice,
    },
    features: [...property.selectedFeatures, ...(property.additionalFeatures ? [property.additionalFeatures] : [])],
    rooms: property.roomsData.map(({ id, name, type, size, floor, description }) => ({ id, name, type, size, floor, description })),
    locationInformation: Object.fromEntries(Object.entries(property.surroundings ?? {}).filter(([, value]) => value)),
    locationNote: property.locationNote,
    additionalInformation: [property.sellerDescription, property.specialNotes].filter(Boolean).join("\n"),
    tone: property.tone,
    language: property.language,
  };
}

function label(value: string | undefined | null) {
  return value?.replaceAll("-", " ").replace(/\b\w/g, (char) => char.toUpperCase()) ?? "Property";
}

function demoContent(property: Property): ExposeContent {
  const city = property.city || "your city";
  const district = property.district ? ` in ${property.district}` : "";
  const type = label(property.propertyType);
  const features = property.selectedFeatures.slice(0, 6).map(label);
  const title = `${type}${property.rooms ? ` mit ${property.rooms}-Zimmern` : ""}${features[0] ? ` und ${features[0]}` : ""}${district ? ` in ${city}` : ` in ${city}`}`;
  const roomDescriptions = property.roomsData.map((room) => ({
    roomId: room.id,
    name: room.name,
    description:
      room.description || `${room.name}${room.size ? ` with approx. ${room.size} m²` : ""} offers a versatile space that fits naturally into the overall layout.`,
  }));
  const locationDescription =
    property.locationNote ||
    Object.entries(property.surroundings ?? {})
      .filter(([, value]) => value)
      .map(([key, value]) => `${label(key)}: ${value}`)
      .join("\n") ||
    `The location in ${city}${property.district ? `, ${property.district}` : ""} combines everyday convenience with a pleasant residential atmosphere.`;

  return {
    title,
    portalTitle: `${type} in ${city}${property.livingArea ? ` | ${property.livingArea} m²` : ""}`,
    shortDescription: `${type} in ${city}${property.livingArea ? ` with approx. ${property.livingArea} m² of living space` : ""}. A home with clear qualities and room for your personal touch.`,
    mainDescription: `${type} in ${city}${district} is a versatile property for people who value a good balance between everyday life and home. ${property.sellerDescription || "The rooms offer a welcoming foundation for individual living ideas and can adapt to different lifestyles."}\n\nHighlights include ${features.length ? features.join(", ") : "the well-proportioned rooms and versatile possibilities"}. All statements in this text are based on the information provided by the seller.`,
    highlights: (features.length ? features : ["Well-proportioned rooms", "Versatile possibilities", "Room for personal design", "Attractive residential location"]).slice(0, 8),
    roomDescriptions,
    locationDescription,
    targetAudience: property.targetAudience || `Couples, families, and discerning owner-occupiers looking for a well-structured home in ${city}.`,
    factualSnapshot: [
      property.livingArea && `${property.livingArea} m² living area`,
      property.rooms && `${property.rooms} rooms`,
      property.bedrooms && `${property.bedrooms} bedrooms`,
      property.bathrooms && `${property.bathrooms} bathrooms`,
      property.constructionYear && `Built in ${property.constructionYear}`,
    ].filter(Boolean) as string[],
  };
}

export async function generateExposeContent(property: Property, instruction = "") {
  const input = buildAIInput(property);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return demoContent(property);

  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const prompt = `You are a careful English real estate copywriter. Return only valid JSON matching the required schema. Use only facts from the input. Do not invent distances, features, energy, construction, or location details. Write persuasive but transparent copy. Location information may be improved stylistically but must not be expanded. ${instruction}\nInput: ${JSON.stringify(input)}`;

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Respond in English. The JSON must contain title, portalTitle, shortDescription, mainDescription, highlights, roomDescriptions, locationDescription, targetAudience, and factualSnapshot.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) return demoContent(property);

    const result = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    const parsed = exposeContentSchema.parse(content);
    return parsed;
  } catch {
    return demoContent(property);
  }
}
