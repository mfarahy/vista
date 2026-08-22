import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, LoaderCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { PropertyPayload, StructuredAddress } from '../types';

// Leaflet touches the DOM at module evaluation time, so it must never be
// evaluated on the server. Loading the map client-side only keeps the
// /create/[id] page from crashing during SSR.
const DebugMap = dynamic(() => import('./map').then((m) => m.DebugMap), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full rounded-lg border border-[#e4d9b8] bg-[#eef1ec]" />
  ),
});

type GeocodingResult = {
  coordinates?: { latitude: number; longitude: number } | null;
  address?: StructuredAddress;
  summary?: string;
  facilities?: Record<
    string,
    Array<{ id?: string; name?: string; distanceMeters?: number; category?: string }>
  >;
  radiusMeters?: number;
  mapAsset?: { url?: string; caption?: string };
};

type ResearchResult = {
  mikrolage?: { summary?: string; claims?: unknown[] };
  makrolage?: { summary?: string; claims?: unknown[] };
  infrastructure?: Record<string, { summary?: string; claims?: unknown[] }>;
  sources?: Array<{ title?: string; url?: string }>;
};

function facilityCount(facilities: GeocodingResult['facilities']): number {
  if (!facilities) return 0;
  return Object.values(facilities).reduce((total, items) => total + (items?.length ?? 0), 0);
}

/**
 * Location & surroundings panel for the Lage step. Product-facing summary of
 * the geocoding/research results — never raw service JSON. Runs at most once
 * per address; persisted and cached results are reused (no forced refresh).
 */
export function AddressIntelligencePanel({
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
  const [resolved, setResolved] = useState(false);
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
      setResolved(false);
      const results: Record<string, unknown> = {};
      try {
        const saveRes = await apiFetch(`/api/properties/${propertyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(property),
        });
        results.saved = saveRes.ok ? { ok: true } : { ok: false, status: saveRes.status };
      } catch {
        results.saved = { ok: false };
      }
      // Reuse persisted intelligence; only resolve when nothing is stored yet.
      // No forced refresh: the services cache geocoding (30 days) and research
      // (7 days) themselves, so revisits stay cheap.
      const existing = await apiFetch(`/api/properties/${propertyId}/location`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
      if (!existing?.coordinates && !existing?.summary && !existing?.facilities) {
        try {
          const res = await apiFetch(`/api/properties/${propertyId}/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          results.geocoding = res.ok ? await res.json() : null;
        } catch {
          results.geocoding = null;
        }
      } else {
        results.geocoding = existing;
      }
      const existingResearch = await apiFetch(`/api/properties/${propertyId}/location/research`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
      if (existingResearch?.mikrolage || existingResearch?.makrolage) {
        results.research = existingResearch;
      } else {
        try {
          const res = await apiFetch(`/api/properties/${propertyId}/location/research`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          results.research = res.ok ? await res.json() : null;
        } catch {
          results.research = null;
        }
      }
      if (!cancelled) {
        setData(results);
        setLoading(false);
        setResolved(true);
        onData?.(results);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [propertyId, addressKey]);

  const geocoding = data?.geocoding as GeocodingResult | null | undefined;
  const research = data?.research as ResearchResult | null | undefined;
  const coordinates = geocoding?.coordinates;
  const hasGeocoding = Boolean(geocoding?.coordinates || geocoding?.summary || geocoding?.facilities);
  const claimCount = [
    research?.mikrolage?.claims ?? [],
    research?.makrolage?.claims ?? [],
  ].reduce((total, claims) => total + claims.length, 0);
  const sourceCount = research?.sources?.length ?? 0;
  const facilityCountValue = facilityCount(geocoding?.facilities);
  const hasAnyResult = hasGeocoding || Boolean(research?.mikrolage || research?.makrolage);

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm font-semibold text-foreground">Standort &amp; Umgebung</p>
        {loading && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />}
      </div>

      {!resolved && (
        <p className="mt-2 text-xs text-muted-foreground">
          Wir prüfen die Lage der Adresse und ergänzen die Umgebungsangaben automatisch.
        </p>
      )}

      {resolved && !hasAnyResult && (
        <p className="mt-2 text-xs text-muted-foreground">
          Für diese Adresse konnten derzeit keine automatischen Umgebungsangaben ermittelt werden.
          Sie können die Felder oben auch selbst ergänzen.
        </p>
      )}

      {resolved && hasAnyResult && (
        <div className="mt-3 space-y-3">
          <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
            {hasGeocoding && coordinates ? (
              <li>
                <span className="font-medium text-foreground">Koordinaten</span> — Adresse wurde
                eindeutig verortet.
              </li>
            ) : null}
            {facilityCountValue > 0 ? (
              <li>
                <span className="font-medium text-foreground">{facilityCountValue} Orte</span> in der
                Umgebung (z.&nbsp;B. Nahverkehr, Einkauf, Schulen) für die Umgebungsangaben
                übernommen.
              </li>
            ) : null}
            {claimCount > 0 ? (
              <li>
                <span className="font-medium text-foreground">{claimCount} recherchierte Aussagen</span>{' '}
                zur Lage mit {sourceCount} Quellen.
              </li>
            ) : null}
          </ul>

          {coordinates ? (
            <div>
              <DebugMap
                intelligence={{
                  coordinates,
                  mapAsset: geocoding?.mapAsset,
                  facilities: geocoding?.facilities,
                  radiusMeters: geocoding?.radiusMeters,
                }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Kartenausschnitt mit der Position der Immobilie und ausgewählten Orten in der
                Umgebung.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}