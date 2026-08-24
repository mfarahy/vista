import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { frontendLogger } from '@/lib/logger';
import type { BrokerProfile } from '../create/[id]/types';
import BrokerProfileClient from './broker-profile-client';

/**
 * Broker Profile page (server shell). Loads the persisted broker profile —
 * the single source of truth for all broker/agent information rendered in
 * every Exposé — and hands it to the client form.
 */
async function getBrokerProfile(): Promise<BrokerProfile | null> {
  try {
    const response = await apiFetch('/api/broker-profile');
    if (!response.ok) return null;
    return (await response.json()) as BrokerProfile;
  } catch (error) {
    frontendLogger.warn('Failed to load the broker profile', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export default async function BrokerProfilePage() {
  const profile = await getBrokerProfile();
  if (!profile) notFound();
  return <BrokerProfileClient initialProfile={profile} />;
}