import type { DocumentUnderstandingProvider } from './types.js';
import { OpenAIDocumentUnderstandingProvider } from './openai-provider.js';

export * from './types.js';
export * from './schema.js';

/**
 * Returns the configured document understanding provider. Only OpenAI is
 * implemented for the MVP; the provider abstraction keeps this replaceable
 * later without touching the wizard or the routes.
 */
export function createDocumentUnderstandingProvider(): DocumentUnderstandingProvider {
  const provider = process.env.DOCUMENT_UNDERSTANDING_PROVIDER || 'openai';
  if (provider !== 'openai') {
    throw new Error(`Unknown document understanding provider: ${provider}`);
  }
  return new OpenAIDocumentUnderstandingProvider();
}
