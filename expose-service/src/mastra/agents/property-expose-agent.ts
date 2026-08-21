import type { PropertyExposeData } from '../../lib/expose-data.js';
import {
  prepareExposeDataOutputSchema,
  generateExposeContentOutputSchema,
  validateExposeContentReferences,
} from '../schemas/index.js';
import { generateExposeContent } from '../content/generate-expose-content.js';
import { Agent } from '@mastra/core/agent';

export const propertyExposeAgent = new Agent({
  id: 'property-expose-agent',
  name: 'property-expose-agent',
  description: 'Coordinates AI-powered property exposé generation from validated structured data.',
  instructions:
    'Coordinate section-based German exposé generation from validated PropertyExposeData. Use only supplied facts, omit unavailable sections, and never invent property or location information.',
  model: 'openai/gpt-4o-mini',
});

export async function preparePropertyExposeData(property: PropertyExposeData) {
  return prepareExposeDataOutputSchema.parse({ property, ready: true });
}

export async function generatePropertyExposeContent(property: PropertyExposeData) {
  const prepared = await preparePropertyExposeData(property);
  const content = await generateExposeContent(prepared.property);
  return generateExposeContentOutputSchema.parse({
    property: prepared.property,
    content: validateExposeContentReferences(prepared.property, content),
  });
}
