'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import type { VistaGeometry } from '@/lib/geometry/models/geometry';
import type { GeometryDebug } from '@/lib/geometry/geometry-debug';
import { GeometryOverlay } from './GeometryOverlay';
import { GeometryDebugOverlay } from './GeometryDebugOverlay';
import type {
  GeometryDebugLayers,
  InspectedEntity,
} from './geometry-debug';

export function FloorPlanViewer({
  url,
  geometry,
  onReplace,
  rawGeometry,
  debug,
  layers,
  selectedKey,
  onSelect,
  showImage = true,
}: {
  url: string;
  geometry: VistaGeometry;
  onReplace: () => void;
  rawGeometry?: VistaGeometry | null;
  debug?: GeometryDebug | null;
  layers?: GeometryDebugLayers;
  selectedKey?: string | null;
  onSelect?: (entity: InspectedEntity | null) => void;
  showImage?: boolean;
}) {
  const { t } = useI18n();
  const hasDebug = Boolean(debug && layers && onSelect);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-fit max-w-full rounded-xl border bg-muted/30 p-2">
        {showImage && (
          <img
            src={url}
            alt={t('geometry.viewer.imageAlt')}
            className="block h-auto w-full rounded-lg object-contain"
            draggable={false}
          />
        )}
        {hasDebug && layers && onSelect ? (
          <GeometryDebugOverlay
            geometry={geometry}
            raw={rawGeometry ?? null}
            debug={debug ?? null}
            layers={layers}
            selectedKey={selectedKey ?? null}
            onSelect={onSelect}
          />
        ) : (
          geometry && <GeometryOverlay geometry={geometry} />
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onReplace}>
        <RefreshCw className="size-4" /> {t('geometry.viewer.replace')}
      </Button>
    </div>
  );
}