'use client';

import { useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { BuildingViewer } from './BuildingViewer';
import { demoBuilding } from './floorPlan';
import { generateBuildingModel } from './geometryGenerator';
import { useI18n } from '@/lib/i18n';
import { PreviewNav } from '@/components/preview/preview-nav';
import { LanguageSwitcher } from '@/components/language-switcher';
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

export function ThreeDPreview() {
  const { t } = useI18n();
  const [selectedFloorId, setSelectedFloorId] = useState('all');
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);

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

      <BuildingViewer
        model={buildingModel}
        selectedFloorId={selectedFloorId}
        selectedElement={selectedElement}
        onSelectElement={setSelectedElement}
        ariaLabel={t('viewers.threeD.viewerAriaLabel')}
      />
    </div>
  );
}