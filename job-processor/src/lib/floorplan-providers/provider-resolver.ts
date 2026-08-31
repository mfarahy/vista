import type { FloorPlanProvider, FloorPlanProviderName } from './types.js';
import { FloorplanRecognitionProvider } from './floorplan-recognition-provider.js';
import { MeltFlexProvider } from './meltflex-provider.js';

/**
 * Returns the configured default provider name.
 * Set via FLOORPLAN_3D_PROVIDER env var (default: 'floorplan-recognition').
 */
export function getDefaultProviderName(): FloorPlanProviderName {
  const raw = (process.env.FLOORPLAN_3D_PROVIDER || 'floorplan-recognition').toLowerCase();
  if (raw === 'floorplan-recognition' || raw === 'meltflex') return raw;
  return 'floorplan-recognition';
}

/**
 * Resolves a provider instance by name, or returns the default.
 * Returns null if the provider is not available (missing config/keys).
 */
export function resolveProvider(name?: FloorPlanProviderName | string | null): FloorPlanProvider | null {
  const providerName = (name ?? getDefaultProviderName()) as FloorPlanProviderName;

  let provider: FloorPlanProvider;
  switch (providerName) {
    case 'floorplan-recognition':
      provider = new FloorplanRecognitionProvider();
      break;
    case 'meltflex':
      provider = new MeltFlexProvider();
      break;
    default:
      return null;
  }

  if (!provider.isAvailable()) return null;
  return provider;
}
