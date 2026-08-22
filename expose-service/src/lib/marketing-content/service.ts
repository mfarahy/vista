import type { Property } from '../types.js';
import type { MarketingContentProvider, MarketingContentRecord } from './types.js';
import type { MarketingContentStructured } from './schema.js';
import { buildMarketingContentInput, hasSufficientPropertyInfo } from './prompt.js';
import { OpenAIMarketingContentProvider } from './openai-provider.js';
import { saveMarketingContent } from '../store.js';

/**
 * Small orchestration service for marketing content generation. The AI never
 * modifies the Property model: generation reads the reviewed facts, produces a
 * new draft and persists it separately.
 *
 * User-edit protection: regeneration replaces only fields whose source is
 * still "ai". Fields explicitly edited by the user (source "user") keep their
 * value, so an explicit "Regenerate" action can never silently overwrite user
 * edits.
 */

export class InsufficientPropertyInfoError extends Error {
  constructor() {
    super('Fügen Sie vor der Erzeugung des Exposés noch etwas mehr Objektinformationen hinzu.');
    this.name = 'InsufficientPropertyInfoError';
  }
}

export interface GenerateMarketingContentDeps {
  provider?: MarketingContentProvider;
  persist?: (id: string, content: MarketingContentRecord) => Promise<unknown>;
}

function keepText(
  current: MarketingContentRecord['title'] | null | undefined,
  fresh: string,
): MarketingContentRecord['title'] {
  return current?.source === 'user' && current.value
    ? current
    : { value: fresh, source: 'ai' as const };
}

/**
 * Merges a freshly generated draft with existing content. User-edited fields
 * are preserved field-by-field; AI-generated fields are replaced.
 */
export function mergeGeneratedContent(
  existing: MarketingContentRecord | null | undefined,
  generated: MarketingContentStructured,
): MarketingContentRecord {
  const current = existing ?? undefined;
  return {
    title: keepText(current?.title, generated.title),
    subtitle: keepText(current?.subtitle, generated.subtitle),
    highlights:
      current?.highlights?.source === 'user' && current.highlights.value.length
        ? current.highlights
        : { value: [...generated.highlights], source: 'ai' as const },
    propertyDescription: keepText(current?.propertyDescription, generated.propertyDescription),
    equipmentDescription: keepText(current?.equipmentDescription, generated.equipmentDescription),
    locationDescription:
      current?.locationDescription?.source === 'user' && current.locationDescription.value
        ? current.locationDescription
        : generated.locationDescription
          ? { value: generated.locationDescription, source: 'ai' as const }
          : null,
  };
}

/**
 * Generates a new marketing content draft from the reviewed Property data and
 * persists it. Generation is an explicit user action; it never runs
 * automatically on property changes.
 *
 * On AI failure nothing is persisted: existing content (if any) stays
 * unchanged and the error propagates to the caller.
 */
export async function generateMarketingContent(
  property: Property,
  deps: GenerateMarketingContentDeps = {},
): Promise<MarketingContentRecord> {
  if (!hasSufficientPropertyInfo(property)) {
    throw new InsufficientPropertyInfoError();
  }
  const provider = deps.provider ?? new OpenAIMarketingContentProvider();
  const generated = await provider.generateContent(buildMarketingContentInput(property));
  const record = mergeGeneratedContent(property.marketingContent, generated);
  await (deps.persist ?? ((id, content) => saveMarketingContent(id, content)))(property.id, record);
  return record;
}
