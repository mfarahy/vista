import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { ExposeData, PropertyPayload, StructuredAddress } from '../types';

// Leaflet touches the DOM at module evaluation time, so it must never be
// evaluated on the server. Loading the map client-side only keeps the
// /create/[id] page from crashing during SSR.
const DebugMap = dynamic(() => import('./map').then((m) => m.DebugMap), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full rounded-lg border border-[#e4d9b8] bg-[#eef1ec]" />
  ),
});

export function AddressDebugPanel({
  propertyId,
  property,
  address,
  onData,
}: {
  propertyId: string;
  property: PropertyPayload;
  address: StructuredAddress;
  onData?: (results: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  // Only re-query when the parts of the address that affect external lookups change.
  const addressKey = [
    address.street,
    address.houseNumber,
    address.postalCode,
    address.city,
  ]
    .map((part) => (part ?? '').trim().toLocaleLowerCase())
    .join('|');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const results: Record<string, unknown> = {};
      try {
        const saveRes = await apiFetch(`/api/properties/${propertyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(property),
        });
        results.saved = saveRes.ok ? { ok: true } : { ok: false, status: saveRes.status };
      } catch (saveError) {
        results.saved = { error: saveError instanceof Error ? saveError.message : 'Save failed' };
      }
      for (const [key, path] of [
        ['geocoding', '/location'],
        ['research', '/location/research'],
      ] as const) {
        try {
          const res = await apiFetch(`/api/properties/${propertyId}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: true }),
          });
          results[key] = res.ok
            ? await res.json()
            : { error: `HTTP ${res.status}`, body: await res.text() };
        } catch (queryError) {
          results[key] = {
            error: queryError instanceof Error ? queryError.message : 'Query failed',
          };
        }
      }
      if (!cancelled) {
        setData(results);
        setLoading(false);
        onData?.(results);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [propertyId, addressKey]);

  return (
    <div className="mt-6 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Debug · External services (remove later)
        </p>
        <button
          type="button"
          onClick={() => setData(null)}
          className="text-xs text-amber-700 underline"
        >
          Clear
        </button>
      </div>
      {onData && (
        <p className="mt-2 text-xs text-amber-600">
          The wizard is pre-filled automatically from these results wherever a field is still empty.
        </p>
      )}
      {loading && (
        <p className="mt-3 text-sm text-amber-700">Querying external services…</p>
      )}
      {(() => {
        const geocoding = data?.geocoding as
          | {
              coordinates?: { latitude: number; longitude: number };
              mapAsset?: { url?: string; caption?: string };
              facilities?: Record<
                string,
                Array<{
                  id?: string;
                  name?: string;
                  latitude?: number;
                  longitude?: number;
                  category?: string;
                  distanceMeters?: number;
                }>
              >;
              radiusMeters?: number;
            }
          | undefined;
        const coordinates = geocoding?.coordinates;
        if (!coordinates) return null;
        return (
          <div className="mt-3">
            <DebugMap
              intelligence={{
                coordinates,
                mapAsset: geocoding?.mapAsset,
                facilities: geocoding?.facilities,
                radiusMeters: geocoding?.radiusMeters,
              }}
            />
            <p className="mt-1 text-[11px] text-[#8a7a4a]">
              OSM map centered on coordinates · SVG mapAsset overlaid on the real map
            </p>
          </div>
        );
      })()}
      {data && (
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5 text-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AgentDebugPanel({ agent }: { agent: ExposeData['agent'] }) {
  const query = [agent?.name, agent?.company, agent?.address?.city, 'real estate']
    .filter(Boolean)
    .join(' ');
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return (
    <div className="mt-6 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Debug · Agent lookup (remove later)
        </p>
        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-amber-700 underline"
        >
          <Search className="size-3" /> Search the web
        </a>
      </div>
      <p className="mt-2 text-xs text-amber-600">
        Opens a web search for this agent. Replace this panel with real online research later.
      </p>
      <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5 text-foreground">
        {JSON.stringify(agent ?? {}, null, 2)}
      </pre>
    </div>
  );
}
