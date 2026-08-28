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
import './styles.css';

type SelectedElement = {
  type: 'floor' | 'room' | 'wall' | 'door' | 'window';
  id: string;
  floorId: string;
};

const buildingModel = generateBuildingModel(demoBuilding);
const totalFloorArea = buildingModel.floors.reduce((total, floor) => total + floor.area, 0);

function floorNameId(floorId: string): string {
  return `viewers.threeD.floorNames.${floorId}`;
}

type MeltflexState = {
  file: File | null;
  previewUrl: string | null;
  status: 'idle' | 'generating' | 'done' | 'error';
  stage: 'analyzing' | 'building';
  modelUrl: string | null;
  modelBase64: string | null;
  errorKey: string | null;
};

export function ThreeDPreview() {
  const { t } = useI18n();
  const [selectedFloorId, setSelectedFloorId] = useState('all');
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [meltflex, setMeltflex] = useState<MeltflexState>({
    file: null,
    previewUrl: null,
    status: 'idle',
    stage: 'analyzing',
    modelUrl: null,
    modelBase64: null,
    errorKey: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!allowed.includes(file.type) && file.type !== '') {
        setMeltflex((s) => ({ ...s, errorKey: 'floorplan3d.meltflex.unsupportedType', status: 'error' }));
        toast.error(t('floorplan3d.meltflex.unsupportedType'));
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setMeltflex((s) => ({ ...s, errorKey: 'floorplan3d.meltflex.tooLarge', status: 'error' }));
        toast.error(t('floorplan3d.meltflex.tooLarge'));
        return;
      }
      const url = URL.createObjectURL(file);
      setMeltflex((prev) => {
        if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return {
          file,
          previewUrl: url,
          status: 'idle',
          stage: 'analyzing',
          modelUrl: null,
          modelBase64: null,
          errorKey: null,
        };
      });
    },
    [t],
  );

  useEffect(() => {
    return () => {
      if (meltflex.previewUrl) URL.revokeObjectURL(meltflex.previewUrl);
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    };
  }, [meltflex.previewUrl]);

  const handleGenerate = useCallback(async () => {
    if (!meltflex.file) {
      setMeltflex((s) => ({ ...s, errorKey: 'floorplan3d.meltflex.missingFile', status: 'error' }));
      toast.error(t('floorplan3d.meltflex.missingFile'));
      return;
    }
    setMeltflex((s) => ({ ...s, status: 'generating', stage: 'analyzing', errorKey: null }));
    stageTimerRef.current = setTimeout(() => {
      setMeltflex((s) => (s.status === 'generating' ? { ...s, stage: 'building' } : s));
    }, 7000);

    try {
      const form = new FormData();
      form.append('file', meltflex.file);
      const res = await fetch('/api/floorplan-to-3d', { method: 'POST', body: form });
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const key = typeof body.error === 'string' ? body.error : 'floorplan3d.meltflex.conversionFailed';
        setMeltflex((s) => ({ ...s, status: 'error', errorKey: key }));
        toast.error(t(key));
        return;
      }
      const data = (await res.json()) as { modelUrl?: string | null; modelBase64?: string | null };
      if (!data.modelUrl && !data.modelBase64) {
        setMeltflex((s) => ({ ...s, status: 'error', errorKey: 'floorplan3d.meltflex.malformedResponse' }));
        toast.error(t('floorplan3d.meltflex.malformedResponse'));
        return;
      }
      setMeltflex((s) => ({
        ...s,
        status: 'done',
        modelUrl: data.modelUrl ?? null,
        modelBase64: data.modelBase64 ?? null,
      }));
    } catch {
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
      setMeltflex((s) => ({ ...s, status: 'error', errorKey: 'floorplan3d.meltflex.serverError' }));
      toast.error(t('floorplan3d.meltflex.serverError'));
    }
  }, [meltflex.file, t]);

  const clearMeltflex = useCallback(() => {
    if (meltflex.previewUrl) URL.revokeObjectURL(meltflex.previewUrl);
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    setMeltflex({ file: null, previewUrl: null, status: 'idle', stage: 'analyzing', modelUrl: null, modelBase64: null, errorKey: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [meltflex.previewUrl]);

  const selectedInfo = useMemo(() => {
    if (!selectedElement) return null;

    if (selectedElement.type === 'floor') {
      const floor = buildingModel.spatialElements.floors.find(
        (entry) => entry.id === selectedElement.id,
      );
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
      const room = buildingModel.spatialElements.rooms.find(
        (entry) => entry.id === selectedElement.id,
      );
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
      const wall = buildingModel.spatialElements.walls.find(
        (entry) => entry.id === selectedElement.id,
      );
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
      const door = buildingModel.spatialElements.doors.find(
        (entry) => entry.id === selectedElement.id,
      );
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

    const window = buildingModel.spatialElements.windows.find(
      (entry) => entry.id === selectedElement.id,
    );
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

  const isGenerating = meltflex.status === 'generating';
  const isDone = meltflex.status === 'done' && (meltflex.modelUrl || meltflex.modelBase64);
  const hasError = meltflex.status === 'error' && meltflex.errorKey;

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
          <h2 className="text-sm font-semibold">{t('floorplan3d.meltflex.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('floorplan3d.meltflex.intro')}</p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          {!meltflex.previewUrl ? (
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
              <span className="mt-2 text-sm font-medium">{t('floorplan3d.meltflex.dropzone')}</span>
              <span className="text-xs text-muted-foreground">{t('floorplan3d.meltflex.dropzoneHint')}</span>
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="relative overflow-hidden rounded-lg border">
                <img src={meltflex.previewUrl} alt={t('floorplan3d.meltflex.previewAlt')} className="max-h-48 w-full object-contain bg-muted" />
                <button
                  type="button"
                  onClick={clearMeltflex}
                  aria-label={t('floorplan3d.meltflex.replaceImage')}
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
                  {t('floorplan3d.meltflex.replaceImage')}
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isGenerating ? t('floorplan3d.meltflex.generating') : t('floorplan3d.meltflex.generate')}
                </button>
              </div>
              {isGenerating && (
                <p className="text-center text-sm font-medium text-primary" aria-live="polite">
                  {meltflex.stage === 'analyzing' ? t('floorplan3d.meltflex.analyzing') : t('floorplan3d.meltflex.building')}
                </p>
              )}
              {hasError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {t(meltflex.errorKey!)}
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
            <dd>{demoBuilding.floors.length}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.wallBoxes')}</dt>
            <dd>{buildingModel.wallBoxes.length}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.rooms')}</dt>
            <dd>{buildingModel.floors.length}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.stairTreads')}</dt>
            <dd>{buildingModel.stairs.length}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.doors')}</dt>
            <dd>
              {buildingModel.openings.filter((opening) => opening.type === 'door').length}
            </dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.windows')}</dt>
            <dd>
              {buildingModel.openings.filter((opening) => opening.type === 'window').length}
            </dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.openings')}</dt>
            <dd>{buildingModel.openings.length}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.roof')}</dt>
            <dd>{t('viewers.threeD.valueMeter', { value: buildingModel.roof.height.toFixed(2) })}</dd>
          </div>
          <div>
            <dt>{t('viewers.threeD.metrics.floorArea')}</dt>
            <dd>{t('viewers.threeD.valueSqm', { value: totalFloorArea.toFixed(2) })}</dd>
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
            </>
          ) : (
            <div className="vista-3d-preview__selection--empty">
              <h2>{t('viewers.threeD.selection.title')}</h2>
              <p>{t('viewers.threeD.selection.emptyHint')}</p>
            </div>
          )}
        </div>
      </aside>

      <div className="vista-3d-preview__viewer-wrap flex-1 relative">
        {isGenerating ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-muted/30">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
            <p className="text-sm font-medium" aria-live="polite">
              {meltflex.stage === 'analyzing' ? t('floorplan3d.meltflex.analyzing') : t('floorplan3d.meltflex.building')}
            </p>
          </div>
        ) : isDone ? (
          <GlbViewer modelUrl={meltflex.modelUrl} modelBase64={meltflex.modelBase64} ariaLabel={t('floorplan3d.ariaLabel')} />
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
    </div>
  );
}