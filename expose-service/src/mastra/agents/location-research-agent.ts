import { Agent } from '@mastra/core/agent';
import { createTavilyExtractTool, createTavilySearchTool } from '@mastra/tavily';
import {
  locationResearchCacheKey,
  getCachedLocationResearch,
  setCachedLocationResearch,
} from '../../lib/location-research-cache.js';
import {
  locationResearchSchema,
  locationResearchInputSchema,
  type LocationResearch,
  type LocationResearchInput,
  type ResearchClaim,
  type ResearchSource,
} from '../schemas/location-research.js';

export const locationResearchSearchTool = createTavilySearchTool({
  apiKey: process.env.TAVILY_API_KEY,
});
export const locationResearchExtractTool = createTavilyExtractTool({
  apiKey: process.env.TAVILY_API_KEY,
});

export const locationResearchAgent = new Agent({
  id: 'location-research-agent',
  name: 'location-research-agent',
  description: "Researches a property's local area and returns source-aware structured facts.",
  instructions:
    'Research only the requested geographic area. Prefer authoritative German sources, use focused queries, preserve URLs, never invent facts or distances, and return structured claims with supporting sources. Deterministic coordinates and facility distances are authoritative and must never be changed.',
  model: 'openai/gpt-4o-mini',
  tools: { tavilySearch: locationResearchSearchTool, tavilyExtract: locationResearchExtractTool },
});

type SearchResult = { title: string; url: string; content: string; score: number };
type SearchOutput = { results: SearchResult[] };
type ExtractOutput = { results: { url: string; rawContent: string }[] };
export interface LocationResearchProvider {
  search(input: {
    query: string;
    searchDepth: 'basic' | 'advanced';
    maxResults: number;
    includeDomains?: string[];
    excludeDomains?: string[];
  }): Promise<SearchOutput>;
  extract(input: {
    urls: string[];
    extractDepth: 'basic' | 'advanced';
    format: 'text';
  }): Promise<ExtractOutput>;
}

const officialDomains = [
  'berlin.de',
  'bvg.de',
  'sbahn.berlin',
  'db.de',
  'senbjf.berlin.de',
  'service.berlin.de',
];
const queries = [
  [
    'mikrolage',
    (area: string, city: string) => `"${area}" ${city} Lage Wohnumfeld Infrastruktur`,
    'advanced',
  ],
  [
    'makrolage',
    (_area: string, city: string) => `${city} Stadtteil Bezirk Regionalentwicklung Infrastruktur`,
    'basic',
  ],
  [
    'transport',
    (area: string, city: string) =>
      `"${area}" ${city} öffentliche Verkehrsmittel S-Bahn U-Bahn Tram Bus`,
    'basic',
  ],
  [
    'education',
    (area: string, city: string) => `"${area}" ${city} Schulen Kindergärten Bildung`,
    'basic',
  ],
  [
    'shopping',
    (area: string, city: string) =>
      `"${area}" ${city} Einkaufsmöglichkeiten Supermarkt Einzelhandel`,
    'basic',
  ],
  [
    'recreation',
    (area: string, city: string) => `"${area}" ${city} Parks Freizeit Sport Kultur`,
    'basic',
  ],
] as const;

export function buildLocationResearchQueries(input: LocationResearchInput) {
  const area = input.neighborhood || input.district || input.city;
  return queries.map(([category, build, searchDepth]) => ({
    category,
    query: build(area, input.city),
    searchDepth,
  }));
}

function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}
function sourceAuthority(url: string) {
  const host = domain(url);
  return officialDomains.some((item) => host === item || host.endsWith(`.${item}`)) ? 1 : 0.55;
}
function sourceFromResult(result: SearchResult, retrievedAt: string): ResearchSource {
  return {
    url: result.url,
    title: result.title,
    domain: domain(result.url),
    retrievedAt,
    relevanceScore: Math.max(0, Math.min(1, result.score)),
    authorityScore: sourceAuthority(result.url),
    excerpt: result.content.slice(0, 1200) || undefined,
  };
}
function claimFromResult(
  category: string,
  result: SearchResult,
  source: ResearchSource,
): ResearchClaim {
  const mapped =
    category === 'transport' ||
    category === 'education' ||
    category === 'shopping' ||
    category === 'recreation'
      ? category
      : category === 'makrolage'
        ? 'makrolage'
        : category === 'mikrolage'
          ? 'mikrolage'
          : 'infrastructure';
  return {
    statement: result.content.trim().slice(0, 1200),
    category: mapped,
    factType: source.authorityScore === 1 ? 'hard_fact' : 'contextual_fact',
    confidence: Math.min(
      1,
      0.5 * (source.relevanceScore || 0) + 0.5 * (source.authorityScore || 0),
    ),
    sources: [source],
  };
}
function dedupeSources(sources: ResearchSource[]) {
  const unique = new Map<string, ResearchSource>();
  for (const source of sources) {
    const key = new URL(source.url).toString().replace(/\/$/, '').toLowerCase();
    const previous = unique.get(key);
    if (!previous || (source.relevanceScore || 0) > (previous.relevanceScore || 0))
      unique.set(key, source);
  }
  return [...unique.values()].sort(
    (a, b) =>
      (b.authorityScore || 0) +
      (b.relevanceScore || 0) -
      ((a.authorityScore || 0) + (a.relevanceScore || 0)),
  );
}

const defaultProvider: LocationResearchProvider = {
  async search(input) {
    if (!locationResearchSearchTool.execute) throw new Error('Tavily search tool is unavailable');
    return (await locationResearchSearchTool.execute(input, {} as never)) as SearchOutput;
  },
  async extract(input) {
    if (!locationResearchExtractTool.execute) throw new Error('Tavily extract tool is unavailable');
    return (await locationResearchExtractTool.execute(input, {} as never)) as ExtractOutput;
  },
};

export async function researchLocation(
  input: LocationResearchInput,
  options: { provider?: LocationResearchProvider; refresh?: boolean } = {},
): Promise<LocationResearch> {
  const validated = locationResearchInputSchema.parse(input);
  const cached = !options.refresh ? getCachedLocationResearch(validated) : null;
  if (cached) return cached;
  if (!process.env.TAVILY_API_KEY && !options.provider)
    throw new Error('TAVILY_API_KEY is not configured');
  const provider = options.provider || defaultProvider;
  const researchedAt = new Date().toISOString();
  const results = await Promise.all(
    buildLocationResearchQueries(validated).map(async (query) => ({
      query,
      output: await provider.search({
        query: query.query,
        searchDepth: query.searchDepth,
        maxResults: query.searchDepth === 'advanced' ? 5 : 4,
        includeDomains: officialDomains,
      }),
    })),
  );
  const selected = results.flatMap(({ query, output }) =>
    output.results.slice(0, 3).map((result) => ({ category: query.category, result })),
  );
  const topUrls = [
    ...new Set(
      selected
        .filter(({ result }) => sourceAuthority(result.url) === 1)
        .slice(0, 2)
        .map(({ result }) => result.url),
    ),
  ];
  const extracted = topUrls.length
    ? await provider
        .extract({ urls: topUrls, extractDepth: 'basic', format: 'text' })
        .catch(() => ({ results: [] }))
    : { results: [] };
  const extractedByUrl = new Map(extracted.results.map((item) => [item.url, item.rawContent]));
  const sources = dedupeSources(
    selected.map(({ result }) =>
      sourceFromResult(
        { ...result, content: extractedByUrl.get(result.url) || result.content },
        researchedAt,
      ),
    ),
  );
  const claims = selected
    .map(({ category, result }) => {
      const source =
        sources.find((item) => item.url === result.url) || sourceFromResult(result, researchedAt);
      return claimFromResult(
        category,
        { ...result, content: extractedByUrl.get(result.url) || result.content },
        source,
      );
    })
    .filter((claim) => claim.statement.length > 20 && claim.sources.length > 0);
  const section = (category: ResearchClaim['category']) => ({
    claims: claims.filter((claim) => claim.category === category),
    summary: claims.filter((claim) => claim.category === category).length
      ? `${claims.filter((claim) => claim.category === category).length} belegte Rechercheaussage(n).`
      : undefined,
  });
  const research = locationResearchSchema.parse({
    researchedAt,
    mikrolage: section('mikrolage'),
    makrolage: section('makrolage'),
    infrastructure: {
      transport: claims.filter((claim) => claim.category === 'transport'),
      education: claims.filter((claim) => claim.category === 'education'),
      shopping: claims.filter((claim) => claim.category === 'shopping'),
      healthcare: claims.filter((claim) => claim.category === 'healthcare'),
      recreation: claims.filter((claim) => claim.category === 'recreation'),
    },
    sources,
    confidence: claims.length
      ? claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length
      : 0,
  });
  console.info('[location-research] completed', {
    propertyId: validated.propertyId,
    cacheKey: locationResearchCacheKey(validated),
    searches: results.length,
    sources: sources.length,
    claims: claims.length,
  });
  return setCachedLocationResearch(validated, research);
}

export function validateLocationResearch(value: unknown) {
  const parsed = locationResearchSchema.parse(value);
  for (const claim of [
    ...parsed.mikrolage.claims,
    ...parsed.makrolage.claims,
    ...Object.values(parsed.infrastructure).flat(),
  ]) {
    if (!claim.sources.length) throw new Error(`Research claim has no source: ${claim.statement}`);
  }
  return parsed;
}
