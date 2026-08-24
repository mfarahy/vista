import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { frontendLogger } from '@/lib/logger';
import { loadBrokerProfile } from '@/lib/broker-profile';
import type { DocumentRecord, Property } from '../../create/[id]/types';
import type { ExposeConfiguration } from './expose-model';
import { isExposeConfiguration } from './expose-model';
import ExposeBuilderClient from './builder-client';

async function getProperty(id: string): Promise<Property | null> {
  try {
    const response = await apiFetch(`/api/properties/${id}`);
    if (!response.ok) return null;
    return (await response.json()) as Property;
  } catch (error) {
    frontendLogger.warn('Failed to load property for the expose builder', {
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
    frontendLogger.warn('Failed to load documents for the expose builder', {
      propertyId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export default async function ExposeBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [property, documents, brokerProfile] = await Promise.all([
    getProperty(id),
    getDocuments(id),
    loadBrokerProfile(),
  ]);
  if (!property) notFound();

  const configuration: ExposeConfiguration | null = isExposeConfiguration(
    property.expose?.configuration,
  )
    ? property.expose.configuration
    : null;

  return (
    <ExposeBuilderClient
      property={property}
      marketingContent={property.marketingContent ?? null}
      initialConfiguration={configuration}
      documents={documents}
      brokerProfile={brokerProfile}
    />
  );
}
