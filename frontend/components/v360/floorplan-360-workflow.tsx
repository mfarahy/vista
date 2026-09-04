'use client';

import { useCallback, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Orbit, RotateCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiAssetUrl, apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ThreeSixtyPreview } from '@/components/preview/three-sixty/ThreeSixtyPreview';
import { FloorplanCanvas, type CameraState } from './floorplan-canvas';

type FloorplanStatus = 'pending' | 'analyzing' | 'analyzed' | 'failed';

type PanoramaRecord = {
  id: string;
  floorplanId: string;
  imageUrl: string;
  mimeType: string;
  size: number;
  cameraX: number | null;
  cameraY: number | null;
  cameraYaw: number | null;
  createdAt: string;
  updatedAt: string;
};

type FloorplanRecord = {
  id: string;
  imageUrl: string;
  status: FloorplanStatus;
  error: string | null;
  analysisResult: unknown;
  floorBoundary: number[][] | null;
  cameraX: number | null;
  cameraY: number | null;
  cameraYaw: number | null;
  panoramas: PanoramaRecord[];
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
};

type Step = 'floorplan' | 'camera' | 'panorama' | 'preview';

type ApiErrorBody = { error?: string; code?: string };

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

export function Floorplan360Workflow() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('floorplan');
  const [floorplan, setFloorplan] = useState<FloorplanRecord | null>(null);
  const [panorama, setPanorama] = useState<PanoramaRecord | null>(null);
  const [camera, setCamera] = useState<CameraState>({ x: 0.5, y: 0.5, yaw: 0 });
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingCamera, setSavingCamera] = useState(false);
  const floorplanInputRef = useRef<HTMLInputElement>(null);
  const panoramaInputRef = useRef<HTMLInputElement>(null);

  const errorMessage = useCallback(
    (
      body: ApiErrorBody | null,
      fallbackKey: 'analysisFailed' | 'uploadFailed' | 'panoramaUploadFailed' | 'loadFailed',
    ): string => {
      switch (body?.code) {
        case 'INVALID_IMAGE':
          return t('v360.errors.invalidImage');
        case 'RASTER2SEQ_NOT_CONFIGURED':
        case 'RASTER2SEQ_UNAVAILABLE':
          return t('v360.errors.raster2seqUnavailable');
        case 'RASTER2SEQ_TIMEOUT':
          return t('v360.errors.raster2seqTimeout');
        case 'RASTER2SEQ_FAILED':
        case 'ANALYSIS_FAILED':
          return t('v360.analysisFailed');
        case 'STORAGE_FAILED':
        case 'UPLOAD_FAILED':
          return t('v360.errors.storageFailed');
        case 'NOT_FOUND':
          return t('v360.errors.notFound');
        default:
          return t(`v360.${fallbackKey}`);
      }
    },
    [t],
  );

  const analyzeFloorplan = useCallback(
    async (id: string) => {
      setAnalyzing(true);
      try {
        const res = await apiFetch(`/api/v360/floorplans/${id}/analyze`, { method: 'POST' });
        const body = (await res.json().catch(() => ({}))) as {
          floorplan?: FloorplanRecord;
          code?: string;
        };
        if (res.ok && body.floorplan) {
          setFloorplan(body.floorplan);
          if (body.floorplan.cameraX !== null && body.floorplan.cameraY !== null) {
            setCamera((prev) => ({
              x: body.floorplan!.cameraX ?? prev.x,
              y: body.floorplan!.cameraY ?? prev.y,
              yaw: body.floorplan!.cameraYaw ?? prev.yaw,
            }));
          }
          setStep('camera');
        } else {
          if (body.floorplan) setFloorplan(body.floorplan);
          toast.error(errorMessage(body, 'analysisFailed'));
        }
      } catch (error) {
        toast.error(
          /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(String(error))
            ? t('v360.errors.network')
            : t('v360.errors.generic'),
        );
      } finally {
        setAnalyzing(false);
      }
    },
    [errorMessage, t],
  );

  const handleFloorplanFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploading(true);
      try {
        let width = 0;
        let height = 0;
        try {
          const size = await readImageSize(file);
          width = size.width;
          height = size.height;
        } catch {
          // Non-image dimensions are best-effort; upload proceeds without them.
        }
        const form = new FormData();
        form.append('image', file);
        form.append('width', String(width));
        form.append('height', String(height));
        const res = await apiFetch('/api/v360/floorplans', { method: 'POST', body: form });
        const body = (await res.json().catch(() => ({}))) as {
          floorplan?: FloorplanRecord;
          code?: string;
        };
        if (!res.ok || !body.floorplan) {
          toast.error(errorMessage(body, 'uploadFailed'));
          return;
        }
        setFloorplan(body.floorplan);
        setCamera({
          x: body.floorplan.cameraX ?? 0.5,
          y: body.floorplan.cameraY ?? 0.5,
          yaw: body.floorplan.cameraYaw ?? 0,
        });
        await analyzeFloorplan(body.floorplan.id);
      } catch (error) {
        toast.error(
          /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(String(error))
            ? t('v360.errors.network')
            : t('v360.errors.generic'),
        );
      } finally {
        setUploading(false);
      }
    },
    [analyzeFloorplan, errorMessage, t],
  );

  const handleSaveCameraAndContinue = useCallback(async () => {
    if (!floorplan) return;
    setSavingCamera(true);
    try {
      const res = await apiFetch(`/api/v360/floorplans/${floorplan.id}/camera`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraX: camera.x, cameraY: camera.y, cameraYaw: camera.yaw }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        floorplan?: FloorplanRecord;
        code?: string;
      };
      if (!res.ok || !body.floorplan) {
        toast.error(errorMessage(body, 'uploadFailed'));
        return;
      }
      setFloorplan(body.floorplan);
      setStep('panorama');
    } catch (error) {
      toast.error(
        /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(String(error))
          ? t('v360.errors.network')
          : t('v360.errors.generic'),
      );
    } finally {
      setSavingCamera(false);
    }
  }, [camera, errorMessage, floorplan, t]);

  const handlePanoramaFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !floorplan) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append('image', file);
        const res = await apiFetch(`/api/v360/floorplans/${floorplan.id}/panoramas`, {
          method: 'POST',
          body: form,
        });
        const body = (await res.json().catch(() => ({}))) as {
          panorama?: PanoramaRecord;
          code?: string;
        };
        if (!res.ok || !body.panorama) {
          toast.error(errorMessage(body, 'panoramaUploadFailed'));
          return;
        }
        setPanorama(body.panorama);
        setStep('preview');
      } catch (error) {
        toast.error(
          /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(String(error))
            ? t('v360.errors.network')
            : t('v360.errors.generic'),
        );
      } finally {
        setUploading(false);
      }
    },
    [errorMessage, floorplan, t],
  );

  const steps: { id: Step; label: string }[] = [
    { id: 'floorplan', label: t('v360.stepFloorplan') },
    { id: 'camera', label: t('v360.stepCamera') },
    { id: 'panorama', label: t('v360.stepPanorama') },
    { id: 'preview', label: t('v360.stepPreview') },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          <Orbit className="size-3.5" aria-hidden /> {t('v360.badge')}
        </span>
        <h1 className="text-sm font-semibold">{t('v360.title')}</h1>
        <nav className="ml-auto flex flex-wrap items-center gap-1" aria-label={t('v360.title')}>
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={
                i === stepIndex
                  ? 'rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground'
                  : i < stepIndex
                    ? 'rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary'
                    : 'rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground'
              }
            >
              {s.label}
            </span>
          ))}
        </nav>
      </header>

      {/* Body */}
      <main className="flex flex-1 items-center justify-center p-6">
        {step === 'floorplan' && (
          <Card className="w-full max-w-3xl">
            <CardHeader>
              <CardTitle>{t('v360.floorplanUploadTitle')}</CardTitle>
              <CardDescription>{t('v360.floorplanUploadHint')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!floorplan ? (
                <button
                  type="button"
                  onClick={() => floorplanInputRef.current?.click()}
                  disabled={uploading}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-muted-foreground transition-colors hover:border-primary hover:bg-muted/40 disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="size-8 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-8" aria-hidden />
                  )}
                  <span className="text-sm font-medium">{t('v360.floorplanUploadTitle')}</span>
                  <span className="text-xs">{t('v360.floorplanUploadHint')}</span>
                </button>
              ) : (
                <>
                  <FloorplanCanvas
                    imageUrl={apiAssetUrl(floorplan.imageUrl)}
                    boundary={floorplan.floorBoundary ?? undefined}
                    className="max-h-[50vh]"
                  />
                  {floorplan.status === 'analyzed' && (
                    <p className="text-xs text-muted-foreground">{t('v360.analysisCompleted')}</p>
                  )}
                  {analyzing && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden /> {t('v360.analyzing')}
                    </div>
                  )}
                  {floorplan.status === 'failed' && (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 p-3">
                      <p className="text-sm text-destructive">{t('v360.analysisFailed')}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => analyzeFloorplan(floorplan.id)}
                        disabled={analyzing}
                      >
                        <RotateCw className="size-3.5" aria-hidden /> {t('v360.retryAnalysis')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                onClick={() => setStep('camera')}
                disabled={!floorplan || floorplan.status !== 'analyzed' || analyzing}
              >
                {t('v360.continue')}
              </Button>
            </CardFooter>
            <input
              ref={floorplanInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                void handleFloorplanFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </Card>
        )}

        {step === 'camera' && floorplan && (
          <Card className="w-full max-w-4xl">
            <CardHeader>
              <CardTitle>
                <Camera className="mr-1.5 inline size-4" aria-hidden /> {t('v360.cameraTitle')}
              </CardTitle>
              <CardDescription>{t('v360.cameraHint')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <FloorplanCanvas
                imageUrl={apiAssetUrl(floorplan.imageUrl)}
                boundary={floorplan.floorBoundary ?? undefined}
                camera={camera}
                interactive
                onCameraChange={setCamera}
                className="max-h-[55vh] w-full"
              />
              <div className="flex w-full max-w-md flex-col gap-1.5">
                <label
                  htmlFor="camera-yaw"
                  className="flex items-center justify-between text-xs font-medium"
                >
                  <span>{t('v360.cameraYawLabel')}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {t('v360.cameraYawDegrees', { deg: String(Math.round(camera.yaw)) })}
                  </span>
                </label>
                <input
                  id="camera-yaw"
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={Math.round(camera.yaw)}
                  onChange={(event) =>
                    setCamera((prev) => ({ ...prev, yaw: Number(event.target.value) }))
                  }
                  className="w-full"
                />
                <p className="text-[11px] text-muted-foreground">{t('v360.cameraYawHint')}</p>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="ghost" onClick={() => setStep('floorplan')}>
                {t('v360.back')}
              </Button>
              <Button onClick={() => void handleSaveCameraAndContinue()} disabled={savingCamera}>
                {savingCamera && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t('v360.continue')}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 'panorama' && floorplan && (
          <Card className="w-full max-w-3xl">
            <CardHeader>
              <CardTitle>{t('v360.panoramaUploadTitle')}</CardTitle>
              <CardDescription>{t('v360.panoramaUploadHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                onClick={() => panoramaInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-muted-foreground transition-colors hover:border-primary hover:bg-muted/40 disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="size-8 animate-spin" aria-hidden />
                ) : (
                  <ImagePlus className="size-8" aria-hidden />
                )}
                <span className="text-sm font-medium">{t('v360.panoramaUploadTitle')}</span>
                <span className="text-xs">{t('v360.panoramaUploadHint')}</span>
              </button>
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="ghost" onClick={() => setStep('camera')}>
                {t('v360.back')}
              </Button>
            </CardFooter>
            <input
              ref={panoramaInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                void handlePanoramaFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </Card>
        )}

        {step === 'preview' && panorama && floorplan && (
          <div className="absolute inset-0">
            <ThreeSixtyPreview
              panorama={{
                imageUrl: apiAssetUrl(panorama.imageUrl),
                yaw: floorplan.cameraYaw ?? 0,
                floorBoundary: floorplan.floorBoundary ?? undefined,
                camera: { x: floorplan.cameraX ?? 0.5, y: floorplan.cameraY ?? 0.5 },
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
