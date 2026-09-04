'use client';

import { useCallback, useRef, useState } from 'react';
import { Camera, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

export type CameraState = { x: number; y: number; yaw: number };

type FloorplanCanvasProps = {
  imageUrl: string;
  /** Derived floor-boundary polygon in normalized [0,1] coordinates. */
  boundary?: number[][];
  camera?: CameraState;
  onCameraChange?: (camera: CameraState) => void;
  interactive?: boolean;
  className?: string;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Displays the floor plan with the analyzed floor-boundary overlay and an
 * interactive camera marker. Clicking/dragging places the camera; the marker
 * position is always reported in normalized [0,1] coordinates so it stays
 * valid at any render size.
 */
export function FloorplanCanvas({
  imageUrl,
  boundary,
  camera,
  onCameraChange,
  interactive = false,
  className,
}: FloorplanCanvasProps) {
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const setCameraFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = wrapperRef.current;
      if (!el || !onCameraChange) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = clamp01((clientX - rect.left) / rect.width);
      const y = clamp01((clientY - rect.top) / rect.height);
      onCameraChange({ x, y, yaw: camera?.yaw ?? 0 });
    },
    [camera?.yaw, onCameraChange],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onCameraChange) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCameraFromPointer(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setCameraFromPointer(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const aspectRatio =
    naturalSize && naturalSize.height > 0 ? naturalSize.width / naturalSize.height : undefined;

  const points = boundary
    ? boundary.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(' ')
    : '';

  return (
    <div
      ref={wrapperRef}
      className={cn('relative overflow-hidden rounded-lg', className)}
      style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="img"
      aria-label={t('v360.floorplanAria')}
    >
      {/* The image defines the coordinate space; the overlay maps 1:1. */}
      <img
        src={imageUrl}
        alt=""
        className={cn(
          'block h-full w-full select-none object-contain',
          interactive && 'cursor-crosshair',
        )}
        draggable={false}
        onLoad={(event) => {
          const img = event.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
          }
        }}
      />

      {boundary && boundary.length >= 3 && (
        <>
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polygon
              points={points}
              className="fill-cyan-500/10 stroke-cyan-500"
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
            {t('v360.floorplanGeometryLegend')}
          </span>
        </>
      )}

      {camera && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${camera.x * 100}%`, top: `${camera.y * 100}%` }}
          aria-hidden
        >
          <div className="relative flex items-center justify-center">
            {/* Direction arrow, rotated to the camera yaw (0 = image right). */}
            <Navigation
              className="absolute text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              style={{ transform: `rotate(${camera.yaw + 90}deg)`, width: 34, height: 34 }}
              strokeWidth={2.5}
            />
            <Camera
              className="size-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              strokeWidth={2.5}
            />
            <span className="absolute -bottom-6 whitespace-nowrap rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {t('v360.cameraMarker')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
