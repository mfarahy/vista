'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Box, Grid2x2, LoaderCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { FloorPlan3DScene } from '@/components/floorplan-3d-scene';
import { FloorplanDebug2D, type DebugNormalized } from '@/components/floorplan-debug-2d';
import type { FloorPlan3DModel } from '@/app/create/[id]/types';

type DebugResult = {
  normalized?: DebugNormalized;
  model3d?: FloorPlan3DModel;
  provider?: string;
  geometry?: Record<string, unknown>;
};

type JobPayload = {
  status?: string;
  error?: string | null;
  message?: string | null;
  payload?: { result?: DebugResult };
};

export default function FloorplanDebugJobPage() {
  const { t } = useI18n();
  const params = useParams<{ jobId: string }>();
  const jobId = decodeURIComponent(params.jobId);
  const [job, setJob] = useState<JobPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'2d' | '3d'>('2d');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`)
      .then(async (res) => {
        if (!res.ok) {
          setError(res.status === 404 ? t('floorplanDebug.notFound') : t('floorplanDebug.loadFailed'));
          return;
        }
        const body = (await res.json()) as JobPayload;
        if (active) setJob(body);
      })
      .catch(() => {
        if (active) setError(t('floorplanDebug.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jobId, t]);

  const result = job?.payload?.result;
  const hasData = Boolean(result?.normalized && result?.model3d);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <VistaLogoLink href="/" />
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {t('floorplanDebug.badge')}
            </span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/debug/floorplan"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden /> {t('floorplanDebug.back')}
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">{t('floorplanDebug.title')}</h1>
          </div>
          {hasData && (
            <div className="flex items-center gap-2">
              <Button variant={view === '2d' ? 'default' : 'outline'} size="sm" onClick={() => setView('2d')}>
                <Grid2x2 className="size-4" aria-hidden /> {t('floorplanDebug.view2d')}
              </Button>
              <Button variant={view === '3d' ? 'default' : 'outline'} size="sm" onClick={() => setView('3d')}>
                <Box className="size-4" aria-hidden /> {t('floorplanDebug.view3d')}
              </Button>
            </div>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {t('floorplanDebug.jobId')} <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{jobId}</code>
          {result?.provider ? ` · ${t('floorplanDebug.provider')} ${result.provider}` : ''}
        </p>

        {loading && (
          <div className="mt-16 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
            {t('floorplanDebug.loading')}
          </div>
        )}

        {!loading && error && (
          <div className="mt-16 flex flex-col items-center gap-3 text-sm text-destructive">
            <p role="alert">{error}</p>
            <Button variant="outline" asChild>
              <Link href="/debug/floorplan">{t('floorplanDebug.back')}</Link>
            </Button>
          </div>
        )}

        {!loading && !error && job && !hasData && (
          <div className="mt-16 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <p role="status">
              {job.status === 'failed'
                ? t('floorplanDebug.jobFailed')
                : job.status === 'completed'
                  ? t('floorplanDebug.noDebugData')
                  : t('floorplanDebug.jobPending', { status: job.status ?? 'unknown' })}
            </p>
            {job.message && <p className="max-w-xl break-all text-center text-xs">{job.message}</p>}
          </div>
        )}

        {!loading && !error && hasData && (
          <>
            <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <span className="block text-[11px] uppercase tracking-wide">{t('floorplanDebug.rooms')}</span>
                <span className="mt-1 block text-lg font-semibold text-foreground">
                  {result?.normalized?.rooms?.filter((r) => !r.exterior).length ?? 0}
                </span>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="block text-[11px] uppercase tracking-wide">{t('floorplanDebug.walls')}</span>
                <span className="mt-1 block text-lg font-semibold text-foreground">
                  {result?.normalized?.walls?.length ?? 0}
                </span>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="block text-[11px] uppercase tracking-wide">{t('floorplanDebug.openings')}</span>
                <span className="mt-1 block text-lg font-semibold text-foreground">
                  {result?.normalized?.openings?.length ?? 0}
                </span>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="block text-[11px] uppercase tracking-wide">{t('floorplanDebug.area')}</span>
                <span className="mt-1 block text-lg font-semibold text-foreground">
                  {t('floorplanDebug.areaValue', {
                    value: (
                      result?.normalized?.rooms?.filter((r) => !r.exterior).reduce((sum, r) => sum + r.areaM2, 0) ??
                      0
                    ).toFixed(1),
                  })}
                </span>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border bg-card">
              {view === '2d' && result?.normalized && <FloorplanDebug2D normalized={result.normalized} />}
              {view === '3d' && result?.model3d && (
                <div className="floorplan-3d-scene h-[70vh] w-full">
                  <FloorPlan3DScene model={result.model3d} />
                </div>
              )}
            </div>

            {view === '2d' && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('floorplanDebug.hintToggle')}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}