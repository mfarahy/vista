/**
 * Phase 3 lightweight browser persistence.
 *
 * Persists the semantic FloorPlan (canonical JSON) to localStorage —
 * never the editor/UI state. Corrupted entries are reported, never
 * thrown, so the editor always stays usable.
 *
 * No React. The `store` parameter exists for unit tests (jsdom-less
 * node environment); in the browser the default is window.localStorage.
 *
 * No DOM, no React.
 */
import { emptyFloorPlan, type FloorPlan } from './model';
import { importFloorPlanJson, serializeFloorPlan } from './serialization';
import type { FloorPlanIssue } from './validation';

export const FLOORPLAN_STORAGE_KEY = 'vista.floorplan.v1';

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function defaultStore(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

export type RestoreResult =
  | { status: 'empty' }
  | { status: 'ok'; plan: FloorPlan }
  | { status: 'corrupt'; errors: FloorPlanIssue[] };

/** Save the semantic plan. Returns false when storage is unavailable. */
export function saveFloorPlan(plan: FloorPlan, store: StorageLike | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(FLOORPLAN_STORAGE_KEY, serializeFloorPlan(plan));
    return true;
  } catch {
    return false;
  }
}

/** Restore the persisted plan. Corrupt data yields `corrupt`, never throws. */
export function restoreFloorPlan(store: StorageLike | null = defaultStore()): RestoreResult {
  if (!store) return { status: 'empty' };
  let raw: string | null = null;
  try {
    raw = store.getItem(FLOORPLAN_STORAGE_KEY);
  } catch {
    return { status: 'empty' };
  }
  if (!raw) return { status: 'empty' };
  const result = importFloorPlanJson(raw);
  if (result.ok) return { status: 'ok', plan: result.plan };
  return { status: 'corrupt', errors: result.errors };
}

/** Remove the persisted draft (used when the user clears to a new plan). */
export function clearStoredFloorPlan(store: StorageLike | null = defaultStore()): void {
  try {
    store?.removeItem(FLOORPLAN_STORAGE_KEY);
  } catch {
    // Storage failures must never break the editor.
  }
}

/** Canonical empty plan serialized form (handy for tests/debugging). */
export function serializedEmptyPlan(): string {
  return serializeFloorPlan(emptyFloorPlan());
}
