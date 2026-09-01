'use client';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { useI18n } from '@/lib/i18n';
import type { FloorPlan3DModel } from '@/app/create/[id]/types';

/**
 * Entry point for the interactive 3D floor plan viewer. The heavy three.js
 * scene is loaded lazily in the browser only, so server rendering (including
 * the PDF print route and node-based template tests) never evaluates WebGL
 * code and simply renders the placeholder.
 */
export default function FloorPlan3DViewer({ model, topView = false }: { model: FloorPlan3DModel; topView?: boolean }) {
  const { t } = useI18n();
  const [Scene, setScene] = useState<ComponentType<{ model: FloorPlan3DModel; topView?: boolean }> | null>(null);

  useEffect(() => {
    let active = true;
    void import('./floorplan-3d-scene').then((module) => {
      if (active) setScene(() => module.FloorPlan3DScene);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!Scene) {
    return (
      <div className="floorplan-3d-loading" aria-label={t('floorplan3d.loading')}>
        <span className="floorplan-3d-loading-spinner" aria-hidden="true" />
        <span>{t('floorplan3d.loading')}</span>
      </div>
    );
  }
  return <Scene model={model} topView={topView} />;
}
