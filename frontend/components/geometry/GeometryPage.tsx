'use client';

import { useCallback, useMemo, useState } from 'react';
import { Building2, Loader2, Shrink } from 'lucide-react';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { EmptyState } from '@/components/empty-state';
import { useI18n } from '@/lib/i18n';
import { mockGeometryProvider } from '@/lib/geometry/providers/mock-geometry-provider';
import { aiGeometryProvider, AIGeometryError } from '@/lib/geometry/providers/ai-geometry-provider';
import type { GeometryProvider, GeometryProviderType } from '@/lib/geometry/providers/geometry-provider';
import type { VistaGeometry } from '@/lib/geometry/models/geometry';
import { FloorPlanUploader, type FloorPlanImageUpload } from './FloorPlanUploader';
import { FloorPlanViewer } from './FloorPlanViewer';
import { GeometryJsonViewer } from './GeometryJsonViewer';

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
  const [view, setView] = useState<'normalized' | 'raw'>('normalized');
  const [providerType, setProviderType] = useState<GeometryProviderType>('mock');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectProvider = useCallback((type: GeometryProviderType) => {
    setProviderType(type);
    setUpload(null);
    setGeometry(null);
    setRawGeometry(null);
    setView('normalized');
    setError(null);
  }, []);

  const handleUpload = useCallback(
    async (next: FloorPlanImageUpload) => {
      setBusy(true);
      setError(null);
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
        setView('normalized');
      } catch (err) {
        setUpload(null);
        setGeometry(null);
        setRawGeometry(null);
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
    setView('normalized');
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Debug compare: the AI provider exposes the untouched raw geometry so the
  // playground can toggle between "AI raw" and "normalized" overlays.
  const displayGeometry = useMemo(() => {
    if (providerType === 'ai' && view === 'raw' && rawGeometry) {
      return rawGeometry;
    }
    return geometry;
  }, [providerType, view, rawGeometry, geometry]);
  const rawAvailable = providerType === 'ai' && rawGeometry !== null;

  const counts = useMemo(() => {
    if (!displayGeometry) return null;
    return [
      { key: 'wall' as const, count: displayGeometry.walls.length },
      { key: 'room' as const, count: displayGeometry.rooms.length },
      { key: 'door' as const, count: displayGeometry.doors.length },
      { key: 'window' as const, count: displayGeometry.windows.length },
    ];
  }, [displayGeometry]);

  const inspectorLabel: Record<NonNullable<typeof counts>[number]['key'], string> = {
    wall: t('geometry.inspector.walls'),
    room: t('geometry.inspector.rooms'),
    door: t('geometry.inspector.doors'),
    window: t('geometry.inspector.windows'),
  };

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
          {upload && displayGeometry ? (
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('geometry.inspector.floorPlan')}
                  </h2>
                  <div className="overflow-hidden rounded-xl border bg-muted/30">
                    <FloorPlanViewer
                      url={upload.url}
                      geometry={displayGeometry}
                      onReplace={handleReplace}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('geometry.inspector.title')}
                  </h2>
                  {rawAvailable && (
                    <div
                      role="group"
                      aria-label={t('geometry.debug.label')}
                      className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2"
                    >
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('geometry.debug.label')}
                      </span>
                      {(['normalized', 'raw'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={view === v}
                          onClick={() => setView(v)}
                          className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
                            view === v
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {t(v === 'raw' ? 'geometry.debug.raw' : 'geometry.debug.normalized')}
                        </button>
                      ))}
                      <span className="text-[11px] text-muted-foreground">
                        {t('geometry.debug.hint')}
                      </span>
                    </div>
                  )}
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
                  <div className="rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    {t('geometry.inspector.provider')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      {t(providerType === 'mock' ? 'geometry.provider.mock' : 'geometry.provider.ai')}
                    </code>
                    {typeof displayGeometry.confidence === 'number' && (
                      <>
                        {' · '}
                        {t('geometry.inspector.confidence')}{' '}
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          {Math.round(displayGeometry.confidence * 100)}%
                        </code>
                      </>
                    )}
                    <br />
                    {t('geometry.inspector.version')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5">{displayGeometry.version}</code>
                    {' · '}
                    {t('geometry.inspector.units')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5">{displayGeometry.units}</code>
                    {' · '}
                    {displayGeometry.source.width} × {displayGeometry.source.height}
                  </div>
                </div>
              </div>
              <div className="border-t pt-5">
                <GeometryJsonViewer geometry={displayGeometry} />
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