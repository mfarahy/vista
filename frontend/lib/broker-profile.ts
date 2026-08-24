import { apiFetch } from '@/lib/api';
import { frontendLogger } from '@/lib/logger';
import type { BrokerProfile } from '@/app/create/[id]/types';

/**
 * Loads the persisted Broker Profile for server components (print route,
 * preview, builder). The profile is the single source of truth for broker
 * information; a failed load returns null so the templates fall back to the
 * property's legacy agent data and existing Exposés keep rendering.
 */
export async function loadBrokerProfile(): Promise<BrokerProfile | null> {
  try {
    const response = await apiFetch('/api/broker-profile');
    if (!response.ok) return null;
    return (await response.json()) as BrokerProfile;
  } catch (error) {
    frontendLogger.warn('Failed to load the broker profile for the exposé', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}