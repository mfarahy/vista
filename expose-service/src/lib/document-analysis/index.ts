import type { DocumentAnalysisProvider } from './types.js';
import { GoogleDocumentAIProvider } from './google-document-ai.js';

export * from './types.js';

/**
 * Returns the configured document analysis provider. Only the Google provider
 * is implemented for the MVP; additional providers can be added here later
 * without changing the wizard or the business logic.
 */
export function createDocumentAnalysisProvider(): DocumentAnalysisProvider {
  const provider = process.env.DOCUMENT_ANALYSIS_PROVIDER || 'google';
  if (provider !== 'google') {
    throw new Error(`Unknown document analysis provider: ${provider}`);
  }
  return new GoogleDocumentAIProvider();
}
