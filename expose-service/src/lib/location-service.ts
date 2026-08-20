import type { LocationIntelligence, PropertyExposeData } from "./expose-data.js";

/**
 * Mastra's deterministic hand-off. The operational provider service lives at
 * the application boundary; this adapter keeps the workflow provider-agnostic
 * until the repository is moved behind the same service boundary.
 */
export async function resolveLocation(property: PropertyExposeData): Promise<PropertyExposeData> {
  const intelligence = property.location.intelligence as LocationIntelligence | undefined;
  if (!intelligence) return property;
  return {
    ...property,
    location: {
      ...property.location,
      latitude: intelligence.coordinates.latitude,
      longitude: intelligence.coordinates.longitude,
      description: intelligence.summary,
    },
  };
}
