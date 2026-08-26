'use client';

import { useCallback, useMemo, useState } from 'react';
import { Building2, Shrink } from 'lucide-react';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { EmptyState } from '@/components/empty-state';
import { useI18n } from '@/lib/i18n';
import { mockGeometryProvider } from '@/lib/geometry/providers/mock-geometry-provider';
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

export function GeometryPage() {
  const { t } = useI18n();
  const [upload, setUpload] = useState<FloorPlanImageUpload | null>(null);
  const [geometry, setGeometry] = useState<VistaGeometry | null>(null);

  const handleUpload = useCallback((next: FloorPlanImageUpload) => {
    setUpload(next);
    setGeometry(mockGeometryProvider.extract({ width: next.width, height: next.height }));
  }, []);

  const handleReplace = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
                    <FloorPlanViewer url={upload.url} geometry={geometry} onReplace={handleReplace} />
                  </div>
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
                  <div className="rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    {t('geometry.inspector.version')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5">{geometry.version}</code>
                    {' · '}
                    {t('geometry.inspector.units')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5">{geometry.units}</code>
                    {' · '}
                    {geometry.source.width} × {geometry.source.height}
                  </div>
                </div>
              </div>
              <div className="border-t pt-5">
                <GeometryJsonViewer geometry={geometry} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <FloorPlanUploader onUpload={handleUpload} />
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
