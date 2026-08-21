import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { frontendLogger } from '@/lib/logger';
import type { Property } from './types';
import WizardClient from './wizard-client';

async function getProperty(id: string) {
  try {
    const response = await apiFetch(`/api/properties/${id}`);
    if (!response.ok) return null;
    return (await response.json()) as Property;
  } catch (error) {
    frontendLogger.warn('Failed to load property during SSR', {
      propertyId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export default async function CreatePropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  return <WizardClient initialProperty={property} />;
}
