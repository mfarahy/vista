import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { frontendLogger } from '@/lib/logger';
import { loadBrokerProfile } from '@/lib/broker-profile';
import type { DocumentRecord, Property } from '../../create/[id]/types';
import {
  defaultExposeConfiguration,
  effectiveMarketingContent,
  isExposeConfiguration,
} from '../../builder/[id]/expose-model';
import PreviewClient from './preview-client';

/**
 * Review preview (Phase 6): shows the Exposé after generation. It renders the
 * exact same `ModernExposeTemplate` the Builder previews and the PDF print
 * route uses — there is only one Exposé implementation. This page adds only
 * the surrounding app chrome (back to Builder, PDF download).
 */
async function getProperty(id: string): Promise<Property | null> {
  try {
    const response = await apiFetch(`/api/properties/${id}`);
    if (!response.ok) return null;
    return (await response.json()) as Property;
  } catch (error) {
    frontendLogger.warn('Failed to load property for the review preview', {
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
    frontendLogger.warn('Failed to load documents for the review preview', {
      propertyId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [property, documents, brokerProfile] = await Promise.all([
    getProperty(id),
    getDocuments(id),
    loadBrokerProfile(),
  ]);
  if (!property) notFound();

  const configuration = isExposeConfiguration(property.expose?.configuration)
    ? (property.expose?.configuration ?? defaultExposeConfiguration())
    : defaultExposeConfiguration();
  const marketingContent = effectiveMarketingContent(
    property.marketingContent ?? null,
    configuration.contentOverrides,
  );

  return (
    <PreviewClient
      id={property.id}
      title={marketingContent.title ?? undefined}
      property={property}
      marketingContent={marketingContent}
      expose={configuration}
      documents={documents}
      brokerProfile={brokerProfile}
    />
  );
}
