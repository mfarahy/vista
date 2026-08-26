'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import type { VistaGeometry } from '@/lib/geometry/models/geometry';
import { GeometryOverlay } from './GeometryOverlay';

export function FloorPlanViewer({
  url,
  geometry,
  onReplace,
}: {
  url: string;
  geometry: VistaGeometry;
  onReplace: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-fit max-w-full rounded-xl border bg-muted/30 p-2">
        <img
          src={url}
          alt={t('geometry.viewer.imageAlt')}
          className="block h-auto w-full rounded-lg object-contain"
          draggable={false}
        />
        {geometry && <GeometryOverlay geometry={geometry} />}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onReplace}>
        <RefreshCw className="size-4" /> {t('geometry.viewer.replace')}
      </Button>
    </div>
  );
}
