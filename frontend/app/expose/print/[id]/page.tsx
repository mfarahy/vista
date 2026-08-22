import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { frontendLogger } from '@/lib/logger';
import type { DocumentRecord, Property } from '../../../create/[id]/types';
import {
  defaultExposeConfiguration,
  effectiveMarketingContent,
  isExposeConfiguration,
} from '../../../builder/[id]/expose-model';
import ExposePrintClient from './print-client';

/**
 * Print route for the PDF export (Phase 5B). Loads the same property,
 * configuration, and MarketingContent as the Builder and renders the same
 * `ModernExposeTemplate` without any Builder UI. The backend Playwright
 * renderer navigates here and waits for `window.__EXPOSE_READY__`.
 */
async function getProperty(id: string): Promise<Property | null> {
  try {
    const response = await apiFetch(`/api/properties/${id}`);
    if (!response.ok) return null;
    return (await response.json()) as Property;
  } catch (error) {
    frontendLogger.warn('Failed to load property for the print route', {
      propertyId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function getDocuments(id: string): Promise<DocumentRecord[]> {
  try {
    const response = await apiFetch(`/api/properties/${id}/documents`);
    if (!response.ok) return [];
    return (await response.json()) as DocumentRecord[];
  } catch (error) {
    frontendLogger.warn('Failed to load documents for the print route', {
      propertyId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export default async function ExposePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [property, documents] = await Promise.all([getProperty(id), getDocuments(id)]);
  if (!property) notFound();

  const configuration = isExposeConfiguration(property.expose?.configuration)
    ? (property.expose?.configuration ?? defaultExposeConfiguration())
    : defaultExposeConfiguration();
  const marketingContent = effectiveMarketingContent(
    property.marketingContent ?? null,
    configuration.contentOverrides,
  );

  return (
    <ExposePrintClient
      property={property}
      marketingContent={marketingContent}
      expose={configuration}
      documents={documents}
    />
  );
}
