'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Upload, X } from 'lucide-react';
import { BuildingViewer } from './BuildingViewer';
import { demoBuilding } from './floorPlan';
import { generateBuildingModel } from './geometryGenerator';
import { useI18n } from '@/lib/i18n';
import { PreviewNav } from '@/components/preview/preview-nav';
import { LanguageSwitcher } from '@/components/language-switcher';
import { GlbViewer } from '@/components/glb-viewer';
import { toast } from 'sonner';
import { apiAssetUrl, apiFetch } from '@/lib/api';
import { useJobProgress } from '@/lib/use-job-progress';
import './styles.css';

type GlbDebugInfo = {
  provider?: string;
  assetId?: string;
  format?: string;
  modelUrl?: string | null;
  sourceImageUrl?: string | null;
  sourceType: 'url' | 'base64' | 'data-url';
  byteLength: number;
  glbMagic?: string;
  glbVersion?: number;
  glbTotalLength?: number;
  geometry?: {
    walls?: number[][][];
    doors?: number[][][];
    entryDoors?: number[][][];
    windows?: number[][][];
    kitchens?: number[][][];
  };
};

type SelectedElement = {
  type: 'floor' | 'room' | 'wall' | 'door' | 'window';
  id: string;
  floorId: string;
};

const buildingModel = generateBuildingModel(demoBuilding);
const totalFloorArea = buildingModel.floors.reduce((total, floor) => total + floor.area, 0);

type PanelMetrics = {
  floors: number | null;
  wallBoxes: number | null;
  rooms: number | null;
  stairTreads: number | null;
  doors: number | null;
  windows: number | null;
  openings: number | null;
  roof: number | null;
  floorArea: number | null;
};

const demoMetrics: PanelMetrics = {
  floors: demoBuilding.floors.length,
  wallBoxes: buildingModel.wallBoxes.length,
  rooms: buildingModel.floors.length,
  stairTreads: buildingModel.stairs.length,
  doors: buildingModel.openings.filter((opening) => opening.type === 'door').length,
  windows: buildingModel.openings.filter((opening) => opening.type === 'window').length,
  openings: buildingModel.openings.length,
  roof: buildingModel.roof.height,
  floorArea: totalFloorArea,
};

/** Footprint area (m²) of the recognized geometry, from the union bounding box. */
function floorAreaFromGeometry(geometry: NonNullable<GlbDebugInfo['geometry']>): number | null {
  const groups = [geometry.walls, geometry.doors, geometry.entryDoors, geometry.windows, geometry.kitchens];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let hasPoint = false;
  for (const group of groups) {
    for (const polygon of group ?? []) {
      for (const [x, y] of polygon) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasPoint = true;
      }
    }
  }
  if (!hasPoint) return null;
  return (maxX - minX) * (maxY - minY);
}

/** Derives panel metrics from a completed geometry result. */
function metricsFromGeometry(geometry: NonNullable<GlbDebugInfo['geometry']>): PanelMetrics {
  const walls = geometry.walls?.length ?? 0;
  const doors = (geometry.doors?.length ?? 0) + (geometry.entryDoors?.length ?? 0);
  const windows = geometry.windows?.length ?? 0;
  return {
    floors: 1,
    wallBoxes: walls,
    rooms: null,
    stairTreads: null,
    doors,
    windows,
    openings: doors + windows,
    roof: null,
    floorArea: floorAreaFromGeometry(geometry),
  };
}

function floorNameId(floorId: string): string {
  return `viewers.threeD.floorNames.${floorId}`;
}

export function ThreeDPreview() {
  const { t } = useI18n();
  const [selectedFloorId, setSelectedFloorId] = useState('all');
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelBase64, setModelBase64] = useState<string | null>(null);
  const [glbDebugInfo, setGlbDebugInfo] = useState<GlbDebugInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localErrorKey, setLocalErrorKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { state: jobState } = useJobProgress(jobId);

  const handleFile = useCallback(
    (nextFile: File | null) => {
      if (!nextFile) return;
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!allowed.includes(nextFile.type) && nextFile.type !== '') {
        setLocalErrorKey('floorplan3d.errors.unsupportedType');
        toast.error(t('floorplan3d.errors.unsupportedType'));
        return;
      }
      if (nextFile.size > 15 * 1024 * 1024) {
        setLocalErrorKey('floorplan3d.errors.tooLarge');
        toast.error(t('floorplan3d.errors.tooLarge'));
        return;
      }
      const url = URL.createObjectURL(nextFile);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setFile(nextFile);
      setJobId(null);
      setModelUrl(null);
      setModelBase64(null);
      setGlbDebugInfo(null);
      setLocalErrorKey(null);
    },
    [t],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // When job completes, fetch the result payload to resolve GLB URL/base64
  useEffect(() => {
    if (!jobState) return;
    if (jobState.status === 'failed') {
      const msg = jobState.error ?? '';
      // Map known error substrings to i18n keys (provider-agnostic)
      let key = 'floorplan3d.errors.conversionFailed';
      if (/unauthorized|401/i.test(msg)) key = 'floorplan3d.errors.authFailed';
      else if (/insufficient|402|credits/i.test(msg)) key = 'floorplan3d.errors.insufficientCredits';
      else if (/rate.?limited|429/i.test(msg)) key = 'floorplan3d.errors.rateLimited';
      else if (/timeout|504/i.test(msg)) key = 'floorplan3d.errors.timeout';
      else if (/malformed/i.test(msg)) key = 'floorplan3d.errors.malformedResponse';
      else if (/invalid.?image|400/i.test(msg)) key = 'floorplan3d.errors.invalidImage';
      setLocalErrorKey(key);
      toast.error(t(key));
      return;
    }
    if (jobState.status === 'completed') {
      void (async () => {
        try {
          const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId!)}`);
          if (!res.ok) return;
          const job = (await res.json()) as {
            message?: string;
            payload?: { result?: { modelUrl?: string | null; modelBase64?: string | null; provider?: string; assetId?: string; format?: string; geometry?: Record<string, unknown> } };
          };
          const result = job.payload?.result;
          const url = result?.modelUrl ?? job.message ?? null;
          const b64 = result?.modelBase64 ?? null;
          if (url) setModelUrl(url.startsWith('/') || url.startsWith('http') || url.startsWith('data:') ? url : apiAssetUrl(url));
          else if (b64) setModelBase64(b64);
          else if (job.message && job.message.startsWith('http')) setModelUrl(job.message);

          // Build debug info from the job result
          const sourceAssetId = result?.assetId;
          const geom = result?.geometry;
          const debug: GlbDebugInfo = {
            provider: result?.provider,
            assetId: sourceAssetId,
            format: result?.format ?? 'glb',
            modelUrl: url,
            sourceImageUrl: sourceAssetId ? `/api/floorplan3d/image/${sourceAssetId}` : null,
            sourceType: b64 ? (b64.startsWith('data:') ? 'data-url' : 'base64') : 'url',
            byteLength: 0,
            geometry: geom ? {
              walls: geom.wall as number[][][] | undefined,
              doors: geom.door as number[][][] | undefined,
              entryDoors: geom.entry_door as number[][][] | undefined,
              windows: geom.window as number[][][] | undefined,
              kitchens: geom.kitchen as number[][][] | undefined,
            } : undefined,
          };

          // Try to parse GLB header from base64
          if (b64) {
            try {
              const raw = b64.startsWith('data:') ? b64.split(',')[1] : b64;
              const bin = atob(raw);
              debug.byteLength = bin.length;
              if (bin.length >= 12) {
                debug.glbMagic = bin.slice(0, 4);
                const bytes = Array.from(bin, (c) => c.charCodeAt(0) & 0xff);
                debug.glbVersion = new DataView(new Uint8Array(bytes.slice(4, 8)).buffer).getUint32(0, true);
                debug.glbTotalLength = new DataView(new Uint8Array(bytes.slice(8, 12)).buffer).getUint32(0, true);
              }
            } catch { /* ignore parse errors */ }
          } else if (url && !url.startsWith('data:')) {
            // Fetch first 12 bytes to read GLB header
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 5000);
              const res = await fetch(url, { signal: controller.signal });
              clearTimeout(timer);
              if (res.ok) {
                const contentType = res.headers.get('content-type') ?? '';
                const contentLength = res.headers.get('content-length');
                if (contentLength) debug.byteLength = Number(contentLength);
                const reader = res.body?.getReader();
                if (reader) {
                  const { value, done } = await reader.read();
                  if (!done && value && value.length >= 12) {
                    debug.glbMagic = new TextDecoder().decode(value.slice(0, 4));
                    debug.glbVersion = new DataView(value.buffer, value.byteOffset + 4, 4).getUint32(0, true);
                    debug.glbTotalLength = new DataView(value.buffer, value.byteOffset + 8, 4).getUint32(0, true);
                    if (!debug.byteLength) debug.byteLength = value.length;
                  }
                  reader.cancel();
                }
              }
            } catch { /* ignore fetch errors */ }
          }
          setGlbDebugInfo(debug);
        } catch {
          // ignore fetch error
        }
      })();
    }
  }, [jobState, jobId, t]);

  const handleGenerate = useCallback(async () => {
    if (!file) {
      setLocalErrorKey('floorplan3d.errors.missingFile');
      toast.error(t('floorplan3d.errors.missingFile'));
      return;
    }
    setUploading(true);
    setLocalErrorKey(null);
    setModelUrl(null);
    setModelBase64(null);
    setJobId(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await apiFetch('/api/floorplan3d/jobs', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok || !body.jobId) {
        const key = typeof body.error === 'string' && body.error ? body.error : 'floorplan3d.errors.conversionFailed';
        setLocalErrorKey(key.startsWith('floorplan3d.') ? key : 'floorplan3d.errors.conversionFailed');
        toast.error(t(key.startsWith('floorplan3d.') ? key : 'floorplan3d.errors.conversionFailed'));
        return;
      }
      setJobId(body.jobId);
    } catch {
      setLocalErrorKey('floorplan3d.errors.serverError');
      toast.error(t('floorplan3d.errors.serverError'));
    } finally {
      setUploading(false);
    }
  }, [file, t]);

  const clearAll = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setJobId(null);
    setModelUrl(null);
    setModelBase64(null);
    setGlbDebugInfo(null);
    setLocalErrorKey(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [previewUrl]);

  const selectedInfo = useMemo(() => {
    if (!selectedElement) return null;

    if (selectedElement.type === 'floor') {
      const floor = buildingModel.spatialElements.floors.find((entry) => entry.id === selectedElement.id);
      if (!floor) return null;
      return {
        title: t('viewers.threeD.element.floor'),
        rows: [
          [t('viewers.threeD.field.name'), t(floorNameId(floor.id))],
          [t('viewers.threeD.field.elevation'), t('viewers.threeD.valueMeter', { value: floor.elevation.toFixed(2) })],
          [t('viewers.threeD.field.floorToFloor'), t('viewers.threeD.valueMeter', { value: floor.floorToFloorHeight.toFixed(2) })],
        ] as const,
      };
    }

    if (selectedElement.type === 'room') {
      const room = buildingModel.spatialElements.rooms.find((entry) => entry.id === selectedElement.id);
      if (!room) return null;
      return {
        title: t('viewers.threeD.element.room'),
        rows: [
          [t('viewers.threeD.field.area'), t('viewers.threeD.valueSqm', { value: room.area.toFixed(2) })],
          [t('viewers.threeD.field.width'), t('viewers.threeD.valueMeter', { value: room.dimensions.width.toFixed(2) })],
          [t('viewers.threeD.field.length'), t('viewers.threeD.valueMeter', { value: room.dimensions.length.toFixed(2) })],
          [t('viewers.threeD.field.floor'), t(floorNameId(room.floorId))],
        ] as const,
      };
    }

    if (selectedElement.type === 'wall') {
      const wall = buildingModel.spatialElements.walls.find((entry) => entry.id === selectedElement.id);
      if (!wall) return null;
      return {
        title: t('viewers.threeD.element.wall'),
        rows: [
          [t('viewers.threeD.field.length'), t('viewers.threeD.valueMeter', { value: wall.length.toFixed(2) })],
          [t('viewers.threeD.field.thickness'), t('viewers.threeD.valueMeter', { value: wall.thickness.toFixed(2) })],
          [t('viewers.threeD.field.height'), t('viewers.threeD.valueMeter', { value: wall.height.toFixed(2) })],
          [t('viewers.threeD.field.floor'), t(floorNameId(wall.floorId))],
        ] as const,
      };
    }

    if (selectedElement.type === 'door') {
      const door = buildingModel.spatialElements.doors.find((entry) => entry.id === selectedElement.id);
      if (!door) return null;
      return {
        title: t('viewers.threeD.element.door'),
        rows: [
          [t('viewers.threeD.field.width'), t('viewers.threeD.valueMeter', { value: door.width.toFixed(2) })],
          [t('viewers.threeD.field.height'), t('viewers.threeD.valueMeter', { value: door.height.toFixed(2) })],
          [t('viewers.threeD.field.hostWall'), door.hostWallId],
          [t('viewers.threeD.field.floor'), t(floorNameId(door.floorId))],
        ] as const,
      };
    }

    const window = buildingModel.spatialElements.windows.find((entry) => entry.id === selectedElement.id);
    if (!window) return null;
    return {
      title: t('viewers.threeD.element.window'),
      rows: [
        [t('viewers.threeD.field.width'), t('viewers.threeD.valueMeter', { value: window.width.toFixed(2) })],
        [t('viewers.threeD.field.height'), t('viewers.threeD.valueMeter', { value: window.height.toFixed(2) })],
        [t('viewers.threeD.field.sillHeight'), t('viewers.threeD.valueMeter', { value: window.sillHeight.toFixed(2) })],
        [t('viewers.threeD.field.floor'), t(floorNameId(window.floorId))],
      ] as const,
    };
  }, [selectedElement, t]);

  const jobStatus = jobState?.status ?? null;
  const isProcessing = jobStatus === 'queued' || jobStatus === 'processing' || uploading;
  const isDone = !isProcessing && (modelUrl || modelBase64);
  const hasError = localErrorKey || jobStatus === 'failed';
  const processingMessage =
    jobState?.message ??
    (jobState?.currentStep === 'calling_provider' ? t('floorplan3d.building') : t('floorplan3d.analyzing'));

  const metrics = useMemo<PanelMetrics>(
    () => (glbDebugInfo?.geometry ? metricsFromGeometry(glbDebugInfo.geometry) : demoMetrics),
    [glbDebugInfo],
  );

  const resolvedModelUrl = modelUrl ? apiAssetUrl(modelUrl) : null;

  return (
    <div className="vista-3d-preview">
      <aside className="vista-3d-preview__intro">
        <div className="vista-3d-preview__toolbar">
          <span className="vista-3d-preview__badge">
            <Building2 className="size-3.5" aria-hidden /> {t('viewers.threeD.badge')}
          </span>
          <PreviewNav current="3d" />
          <LanguageSwitcher />
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">{t('floorplan3d.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('floorplan3d.intro')}</p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          {!previewUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className="mt-3 flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center hover:bg-accent"
            >
              <Upload className="size-6 text-muted-foreground" aria-hidden />
              <span className="mt-2 text-sm font-medium">{t('floorplan3d.dropzone')}</span>
              <span className="text-xs text-muted-foreground">{t('floorplan3d.dropzoneHint')}</span>
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="relative overflow-hidden rounded-lg border">
                <img src={previewUrl} alt={t('floorplan3d.previewAlt')} className="max-h-48 w-full object-contain bg-muted" />
                <button
                  type="button"
                  onClick={clearAll}
                  aria-label={t('floorplan3d.replaceImage')}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  {t('floorplan3d.replaceImage')}
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isProcessing ? t('floorplan3d.generating') : t('floorplan3d.generate')}
                </button>
              </div>
              {isProcessing && (
                <p className="text-center text-sm font-medium text-primary" aria-live="polite">
                  {processingMessage}
                </p>
              )}
              {hasError && localErrorKey && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {t(localErrorKey)}
                </p>
              )}
              {jobState && (
                <p className="text-center text-xs text-muted-foreground">
                  {jobStatus === 'queued' ? t('documentsStep.processingRunning') : jobState.currentStep ?? jobStatus}
                  {typeof jobState.progress === 'number' ? ` · ${jobState.progress}%` : ''}
                </p>
              )}
            </div>
          )}
        </div>

        <label className="vista-3d-preview__floor-selector" htmlFor="vista-3d-floor-select">
          {t('viewers.threeD.inspectFloor')}
          <select
            id="vista-3d-floor-select"
            value={selectedFloorId}
            onChange={(event) => setSelectedFloorId(event.target.value)}
          >
            <option value="all">{t('viewers.threeD.allFloors')}</option>
            {demoBuilding.floors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {t(floorNameId(floor.id))}
              </option>
            ))}
          </select>
        </label>

        <dl className="vista-3d-preview__metrics">
          <div>
            <dt>{t('viewers.threeD.metrics.floors')}</dt>
            <dd>{metrics.floors ?? t('viewers.threeD.metrics.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.wallBoxes')}</dt>
            <dd>{metrics.wallBoxes ?? t('viewers.threeD.metrics.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.rooms')}</dt>
            <dd>{metrics.rooms ?? t('viewers.threeD.metrics.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.stairTreads')}</dt>
            <dd>{metrics.stairTreads ?? t('viewers.threeD.metrics.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.doors')}</dt>
            <dd>{metrics.doors ?? t('viewers.threeD.metrics.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.windows')}</dt>
            <dd>{metrics.windows ?? t('viewers.threeD.metrics.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.openings')}</dt>
            <dd>{metrics.openings ?? t('viewers.threeD.metrics.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.roof')}</dt>
            <dd>
              {metrics.roof === null
                ? t('viewers.threeD.metrics.notAvailable')
                : t('viewers.threeD.valueMeter', { value: metrics.roof.toFixed(2) })}
            </dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.floorArea')}</dt>
            <dd>
              {metrics.floorArea === null
                ? t('viewers.threeD.metrics.notAvailable')
                : t('viewers.threeD.valueSqm', { value: metrics.floorArea.toFixed(2) })}
            </dd>
          </div>
        </dl>

        <div className="vista-3d-preview__legend" aria-label={t('viewers.threeD.legend.ariaLabel')}>
          <p>
            <span className="vista-3d-preview__swatch vista-3d-preview__swatch--exterior" />
            {t('viewers.threeD.legend.exteriorWalls')}
          </p>
          <p>
            <span className="vista-3d-preview__swatch vista-3d-preview__swatch--interior" />
            {t('viewers.threeD.legend.interiorWalls')}
          </p>
          <p>
            <span className="vista-3d-preview__swatch vista-3d-preview__swatch--door" />
            {t('viewers.threeD.legend.doorOpenings')}
          </p>
          <p>
            <span className="vista-3d-preview__swatch vista-3d-preview__swatch--window" />
            {t('viewers.threeD.legend.windowOpenings')}
          </p>
          <p>
            <span className="vista-3d-preview__swatch vista-3d-preview__swatch--floor" />
            {t('viewers.threeD.legend.floorSurfaces')}
          </p>
        </div>

        <div className="vista-3d-preview__selection" aria-live="polite">
          {selectedInfo ? (
            <>
              <h2>{selectedInfo.title}</h2>
              <dl>
                {selectedInfo.rows.map(([label, value]) => (
                  <div key={`${selectedInfo.title}-${label}`}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
          </dl>
          {glbDebugInfo?.geometry && (
            <div className="mt-3 border-t pt-3">
              <h3 className="text-xs font-semibold mb-1">Geometry</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Walls</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.walls?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Doors</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.doors?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Entry Doors</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.entryDoors?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Windows</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.windows?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Kitchens</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.kitchens?.length ?? 0}</dd>
                </div>
              </dl>
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Show raw geometry JSON</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] leading-tight">
                  {JSON.stringify(glbDebugInfo.geometry, null, 2)}
                </pre>
              </details>
            </div>
          )}
            </>
          ) : (
            <div className="vista-3d-preview__selection--empty">
              <h2>{t('viewers.threeD.selection.title')}</h2>
              <p>{t('viewers.threeD.selection.emptyHint')}</p>
            </div>
          )}
        </div>
      </aside>

      <div className="vista-3d-preview__viewer-wrap flex-1 relative flex flex-col">
        <div className="flex-1 relative min-h-0">
          {isProcessing ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-muted/30">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
              <p className="text-sm font-medium" aria-live="polite">
                {processingMessage}
              </p>
            </div>
          ) : isDone ? (
            <GlbViewer modelUrl={resolvedModelUrl} modelBase64={modelBase64} ariaLabel={t('floorplan3d.ariaLabel')} />
          ) : (
            <BuildingViewer
              model={buildingModel}
              selectedFloorId={selectedFloorId}
              selectedElement={selectedElement}
              onSelectElement={setSelectedElement}
              ariaLabel={t('viewers.threeD.viewerAriaLabel')}
            />
          )}
        </div>
        <div className="border-t bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">GLB Debug Info</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Provider</dt>
              <dd className="font-mono">{glbDebugInfo?.provider ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Asset ID</dt>
              <dd className="font-mono break-all" title={glbDebugInfo?.assetId ?? ''}>{glbDebugInfo?.assetId ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Source Image</dt>
              <dd className="font-mono break-all" title={glbDebugInfo?.sourceImageUrl ?? ''}>{glbDebugInfo?.sourceImageUrl ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Format</dt>
              <dd className="font-mono">{glbDebugInfo?.format ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="font-mono">{glbDebugInfo?.sourceType ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Size</dt>
              <dd className="font-mono">{glbDebugInfo && glbDebugInfo.byteLength > 0 ? `${(glbDebugInfo.byteLength / 1024).toFixed(1)} KB` : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">GLB Magic</dt>
              <dd className="font-mono">{glbDebugInfo?.glbMagic ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">GLB Version</dt>
              <dd className="font-mono">{glbDebugInfo?.glbVersion ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">GLB Length</dt>
              <dd className="font-mono">{glbDebugInfo?.glbTotalLength ? `${(glbDebugInfo.glbTotalLength / 1024).toFixed(1)} KB` : '—'}</dd>
            </div>
          </dl>
          {glbDebugInfo?.geometry && (
            <div className="mt-3 border-t pt-3">
              <h3 className="text-xs font-semibold mb-1">Geometry</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Walls</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.walls?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Doors</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.doors?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Entry Doors</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.entryDoors?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Windows</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.windows?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Kitchens</dt>
                  <dd className="font-mono">{glbDebugInfo.geometry.kitchens?.length ?? 0}</dd>
                </div>
              </dl>
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Show raw geometry JSON</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] leading-tight">
                  {JSON.stringify(glbDebugInfo.geometry, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
