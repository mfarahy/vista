import { apiFetch } from '@/lib/api';
import { frontendLogger } from '@/lib/logger';
import { LandingContent, type LandingProperty } from '@/components/landing-content';

async function getProperties(): Promise<LandingProperty[]> {
  try {
    const response = await apiFetch('/api/properties');
    if (!response.ok) return [];
    return (await response.json()) as LandingProperty[];
  } catch (error) {
    frontendLogger.warn('Failed to load properties for the landing page', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export default async function Home() {
  const properties = await getProperties();

  return <LandingContent properties={properties} />;
}
