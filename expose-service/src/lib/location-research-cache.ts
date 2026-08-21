import type {
  LocationResearch,
  LocationResearchInput,
} from '../mastra/schemas/location-research.js';

const cache = new Map<string, { value: LocationResearch; expiresAt: number }>();

export function locationResearchCacheKey(input: LocationResearchInput) {
  return [input.city, input.district, input.neighborhood, input.postalCode, input.country]
    .filter(Boolean)
    .join('|')
    .toLowerCase();
}

export function getCachedLocationResearch(input: LocationResearchInput, now = Date.now()) {
  const item = cache.get(locationResearchCacheKey(input));
  if (!item || item.expiresAt <= now) {
    if (item) cache.delete(locationResearchCacheKey(input));
    return null;
  }
  return item.value;
}

export function setCachedLocationResearch(
  input: LocationResearchInput,
  value: LocationResearch,
  ttlMs = Number(process.env.LOCATION_RESEARCH_TTL_MS || 7 * 24 * 60 * 60 * 1000),
) {
  cache.set(locationResearchCacheKey(input), { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function clearLocationResearchCache() {
  cache.clear();
}
