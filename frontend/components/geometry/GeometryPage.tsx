'use client';

import { useCallback, useMemo, useState } from 'react';
import { Building2, Layers, Loader2, Shrink } from 'lucide-react';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { EmptyState } from '@/components/empty-state';
import { useI18n } from '@/lib/i18n';
import { mockGeometryProvider } from '@/lib/geometry/providers/mock-geometry-provider';
import { aiGeometryProvider, AIGeometryError } from '@/lib/geometry/providers/ai-geometry-provider';
import type { GeometryProvider, GeometryProviderType } from '@/lib/geometry/providers/geometry-provider';
import type { GeometryDebug } from '@/lib/geometry/geometry-debug';
import type { VistaGeometry } from '@/lib/geometry/models/geometry';
import { FloorPlanUploader, type FloorPlanImageUpload } from './FloorPlanUploader';
import { FloorPlanViewer } from './FloorPlanViewer';
import { GeometryJsonViewer } from './GeometryJsonViewer';
import { GeometryEntityInspector } from './GeometryEntityInspector';
import {
  DEFAULT_DEBUG_LAYERS,
  DEBUG_LAYER_ORDER,
  type GeometryDebugLayers,
  type InspectedEntity,
} from './geometry-debug';

const LEGEND_SWATCH: Record<string, string> = {
  wall: 'bg-[var(--foreground)]',
  room: 'bg-[var(--primary)]',
  door: 'bg-[var(--amber-600)]',
  window: 'bg-[var(--sky-600)]',
};

const PROVIDERS: Record<GeometryProviderType, GeometryProvider> = {
  mock: mockGeometryProvider,
  ai: aiGeometryProvider,
};

export function GeometryPage() {
  const { t } = useI18n();
  const [upload, setUpload] = useState<FloorPlanImageUpload | null>(null);
  const [geometry, setGeometry] = useState<VistaGeometry | null>(null);
  const [rawGeometry, setRawGeometry] = useState<VistaGeometry | null>(null);
  const [fusedGeometry, setFusedGeometry] = useState<VistaGeometry | null>(null);
  const [recoveredGeometry, setRecoveredGeometry] = useState<VistaGeometry | null>(null);
  const [debug, setDebug] = useState<GeometryDebug | null>(null);
  const [layers, setLayers] = useState<GeometryDebugLayers>(DEFAULT_DEBUG_LAYERS);
  const [selectedEntity, setSelectedEntity] = useState<InspectedEntity | null>(null);
  const [providerType, setProviderType] = useState<GeometryProviderType>('mock');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectProvider = useCallback((type: GeometryProviderType) => {
    setProviderType(type);
    setUpload(null);
    setGeometry(null);
    setRawGeometry(null);
    setFusedGeometry(null);
    setRecoveredGeometry(null);
    setDebug(null);
    setLayers(DEFAULT_DEBUG_LAYERS);
    setSelectedEntity(null);
    setError(null);
  }, []);

  const handleUpload = useCallback(
    async (next: FloorPlanImageUpload) => {
      setBusy(true);
      setError(null);
      setSelectedEntity(null);
      setLayers(DEFAULT_DEBUG_LAYERS);
      try {
        const provider = PROVIDERS[providerType];
        const extracted = await provider.extract({
          width: next.width,
          height: next.height,
          data: next.file,
        });
        setUpload(next);
        setGeometry(extracted.geometry);
        setRawGeometry(extracted.rawGeometry ?? null);
        setFusedGeometry(extracted.fusedGeometry ?? null);
        setRecoveredGeometry(extracted.recoveredGeometry ?? null);
        setDebug(extracted.debug ?? null);
      } catch (err) {
        setUpload(null);
        setGeometry(null);
        setRawGeometry(null);
        setFusedGeometry(null);
        setRecoveredGeometry(null);
        setDebug(null);
        setError(describeError(err));
      } finally {
        setBusy(false);
      }
    },
    [providerType],
  );

  const describeError = useCallback(
    (err: unknown) => {
      if (err instanceof AIGeometryError) {
        return t(`geometry.ai.error.${err.code}`);
      }
      return t('geometry.extractFailed');
    },
    [t],
  );

  const handleReplace = useCallback(() => {
    setUpload(null);
    setGeometry(null);
    setRawGeometry(null);
    setFusedGeometry(null);
    setRecoveredGeometry(null);
    setDebug(null);
    setLayers(DEFAULT_DEBUG_LAYERS);
    setSelectedEntity(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleLayer = useCallback((layer: keyof GeometryDebugLayers) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
    setSelectedEntity(null);
  }, []);

  const handleSelect = useCallback((entity: InspectedEntity | null) => {
    setSelectedEntity(entity);
  }, []);

  const hasDebug = providerType === 'ai' && debug !== null;

  const counts = useMemo(() => {
    if (!geometry) return null;
    return [
      { key: 'wall' as const, count: geometry.walls.length },
      { key: 'room' as const, count: geometry.rooms.length },
      { key: 'door' as const, count: geometry.doors.length },
      { key: 'window' as const, count: geometry.windows.length },
    ];
  }, [geometry]);

  const inspectorLabel: Record<NonNullable<typeof counts>[number]['key'], string> = {
    wall: t('geometry.inspector.walls'),
    room: t('geometry.inspector.rooms'),
    door: t('geometry.inspector.doors'),
    window: t('geometry.inspector.windows'),
  };

  const entityLabel: Record<keyof GeometryDebugLayers, string> = {
    original: t('geometry.debug.layers.original'),
    raw: t('geometry.debug.layers.raw'),
    normalized: t('geometry.debug.layers.normalized'),
    fused: t('geometry.debug.layers.fused'),
    recovered: t('geometry.debug.layers.recovered'),
    vlmSemantic: t('geometry.debug.layers.vlmSemantic'),
    roomCandidates: t('geometry.debug.layers.roomCandidates'),
    openingCandidates: t('geometry.debug.layers.openingCandidates'),
  };

  const hasFusion = hasDebug && debug?.fused != null && fusedGeometry !== null;
  const hasRecovery = hasDebug && debug?.recovered != null && recoveredGeometry !== null;

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <VistaLogoLink href="/" />
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Building2 className="size-3.5" /> {t('geometry.badge')}
            </span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <header className="mx-auto max-w-6xl px-5 pt-10 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {t('geometry.kicker')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t('geometry.title')}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t('geometry.intro')}
        </p>
      </header>

      <section className="mx-auto mt-8 max-w-6xl px-5 sm:px-8">
        <div className="rounded-xl border bg-card p-6">
          {upload && geometry ? (
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('geometry.inspector.floorPlan')}
                  </h2>
                  <div className="overflow-hidden rounded-xl border bg-muted/30">
                    {hasDebug ? (
                      <div className="flex flex-col gap-3 p-3">
                        <FloorPlanViewer
                          url={upload.url}
                          geometry={geometry}
                          rawGeometry={rawGeometry}
                          fusedGeometry={fusedGeometry}
                          recoveredGeometry={recoveredGeometry}
                          debug={debug}
                          layers={layers}
                          selectedKey={selectedEntity?.key ?? null}
                          onSelect={handleSelect}
                          showImage={layers.original}
                          onReplace={handleReplace}
                        />
                      </div>
                    ) : (
                      <FloorPlanViewer
                        url={upload.url}
                        geometry={geometry}
                        onReplace={handleReplace}
                      />
                    )}
                  </div>

                  {hasDebug && (
                    <div
                      role="group"
                      aria-label={t('geometry.debug.label')}
                      className="rounded-xl border bg-muted/30 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="size-3.5" aria-hidden />
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t('geometry.debug.label')}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {DEBUG_LAYER_ORDER.map((layer) => (
                          <button
                            key={layer}
                            type="button"
                            aria-pressed={layers[layer]}
                            onClick={() => toggleLayer(layer)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              layers[layer]
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {entityLabel[layer]}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {t('geometry.debug.hint')}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('geometry.inspector.title')}
                  </h2>
                  <ul className="grid grid-cols-2 gap-3">
                    {counts?.map(({ key, count }) => (
                      <li
                        key={key}
                        className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3"
                      >
                        <span
                          className={`h-3 w-3 shrink-0 rounded-full ${LEGEND_SWATCH[key]}`}
                          aria-hidden
                        />
                        <span className="text-sm text-muted-foreground">{inspectorLabel[key]}</span>
                        <span className="ml-auto text-sm font-semibold text-foreground">{count}</span>
                      </li>
                    ))}
                  </ul>
                  {hasFusion && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-foreground">
                      <p className="font-semibold text-emerald-700">
                        {t('geometry.debug.fusion.title')}
                      </p>
                      <ul className="mt-1.5 space-y-1 text-muted-foreground">
                        {fusedGeometry!.rooms.some((r) => r.name) && (
                          <li>
                            {t('geometry.debug.fusion.namedRooms')}{' '}
                            <code className="rounded bg-muted px-1 py-0.5">
                              {fusedGeometry!.rooms.filter((r) => r.name).length}/
                              {fusedGeometry!.rooms.length}
                            </code>
                          </li>
                        )}
                        {fusedGeometry!.stairs.length > 0 && (
                          <li>
                            {t('geometry.debug.fusion.stairs')}{' '}
                            <code className="rounded bg-muted px-1 py-0.5">
                              {fusedGeometry!.stairs.length}
                            </code>
                          </li>
                        )}
                        {debug?.fused?.unresolved && (
                          <li>
                            {t('geometry.debug.fusion.unresolved')}{' '}
                            <code className="rounded bg-muted px-1 py-0.5">
                              {debug.fused.unresolved.spaces.length} /{' '}
                              {debug.fused.unresolved.doors.length} /{' '}
                              {debug.fused.unresolved.windows.length}
                            </code>
                          </li>
                        )}
                        {debug?.fused?.suppressed_openings &&
                          debug.fused.suppressed_openings.length > 0 && (
                            <li>
                              {t('geometry.debug.fusion.suppressed')}{' '}
                              <code className="rounded bg-muted px-1 py-0.5">
                                {debug.fused.suppressed_openings.length}
                              </code>
                            </li>
                          )}
                      </ul>
                    </div>
                  )}
                  {hasRecovery && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-foreground">
                      <p className="font-semibold text-amber-700">
                        {t('geometry.debug.recovery.title')}
                      </p>
                      <ul className="mt-1.5 space-y-1 text-muted-foreground">
                        {debug?.recovered?.recovery?.counts && (
                          <li>
                            {t('geometry.debug.recovery.recoveredSum')}{' '}
                            <code className="rounded bg-muted px-1 py-0.5">
                              {t('geometry.debug.recovery.entitiesSummary', {
                                windows: debug.recovered.recovery.counts.recovered_windows,
                                doors: debug.recovered.recovery.counts.recovered_doors,
                                rooms: debug.recovered.recovery.counts.recovered_rooms,
                                stairs: debug.recovered.recovery.counts.recovered_stairs,
                              })}
                            </code>
                          </li>
                        )}
                        {(debug?.recovered?.unresolved.windows.length ??
                          0) +
                          (debug?.recovered?.unresolved.doors.length ?? 0) +
                          (debug?.recovered?.unresolved.spaces.length ?? 0) >
                          0 && (
                          <li>
                            {t('geometry.debug.recovery.unresolved')}{' '}
                            <code className="rounded bg-muted px-1 py-0.5">
                              {debug?.recovered?.unresolved.spaces.length ?? 0} /{' '}
                              {debug?.recovered?.unresolved.doors.length ?? 0} /{' '}
                              {debug?.recovered?.unresolved.windows.length ?? 0}
                            </code>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  {hasDebug && (
                    <>
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('geometry.debug.inspector.title')}
                      </h2>
                      <GeometryEntityInspector
                        entity={selectedEntity}
                        onClose={() => setSelectedEntity(null)}
                      />
                    </>
                  )}
                  <div className="rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    {t('geometry.inspector.provider')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      {t(providerType === 'mock' ? 'geometry.provider.mock' : 'geometry.provider.ai')}
                    </code>
                    {typeof geometry.confidence === 'number' && (
                      <>
                        {' · '}
                        {t('geometry.inspector.confidence')}{' '}
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          {Math.round(geometry.confidence * 100)}%
                        </code>
                      </>
                    )}
                    <br />
                    {t('geometry.inspector.version')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5">{geometry.version}</code>
                    {' · '}
                    {t('geometry.inspector.units')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5">{geometry.units}</code>
                    {' · '}
                    {geometry.source.width} × {geometry.source.height}
                    {debug?.refinementProvider && (
                      <>
                        <br />
                        {t('geometry.debug.refinement')}{' '}
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          {debug.refinementProvider}
                        </code>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="border-t pt-5">
                <GeometryJsonViewer geometry={geometry} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div role="group" aria-label={t('geometry.provider.label')} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('geometry.provider.label')}
                </span>
                {(['mock', 'ai'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={providerType === type}
                    disabled={busy}
                    onClick={() => handleSelectProvider(type)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                      providerType === type
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t(type === 'mock' ? 'geometry.provider.mock' : 'geometry.provider.ai')}
                  </button>
                ))}
                {providerType === 'ai' && (
                  <span className="text-xs text-muted-foreground">{t('geometry.provider.aiHint')}</span>
                )}
              </div>

              <FloorPlanUploader onUpload={(next) => void handleUpload(next)} />

              {busy && (
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> {t('geometry.extracting')}
                </p>
              )}

              {error && (
                <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <EmptyState
                icon={Shrink}
                title={t('geometry.emptyTitle')}
                description={t('geometry.emptyDescription')}
                className="border-0 bg-transparent"
              />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}