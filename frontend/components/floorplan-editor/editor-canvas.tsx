'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  formatLengthM,
  snapPoint,
  snapToleranceForScale,
  type SnapKind,
} from '@/lib/floorplan/geometry';
import { wallsBoundingBox, type Vec2, type Wall } from '@/lib/floorplan/model';
import type { EditorTool } from '@/lib/floorplan/use-floorplan-editor';

export type EditorCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
  resetView: () => void;
};

type EditorCanvasProps = {
  walls: Wall[];
  selectedIds: string[];
  tool: EditorTool;
  pendingStart: Vec2 | null;
  spacePanActive: boolean;
  snapLabel: (kind: Exclude<SnapKind, null>) => string;
  canvasAriaLabel: string;
  onDrawClick: (point: Vec2) => void;
  onSelectWall: (id: string | null, additive: boolean) => void;
  onFinishChain: () => void;
  onViewChange?: (scale: number) => void;
};

type Camera = { x: number; y: number; scale: number };

const DEFAULT_SCALE = 60;
const MIN_SCALE = 8;
const MAX_SCALE = 500;
const GRID_MINOR_M = 0.5;
const GRID_MAJOR_M = 2;

const SNAP_COLORS: Record<Exclude<SnapKind, null>, string> = {
  endpoint: '#16a34a',
  horizontal: '#2563eb',
  vertical: '#2563eb',
  angle: '#d97706',
};

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function endpointKey(p: Vec2): string {
  return `${p.x.toFixed(3)}|${p.y.toFixed(3)}`;
}

const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  {
    walls,
    selectedIds,
    tool,
    pendingStart,
    spacePanActive,
    snapLabel,
    canvasAriaLabel,
    onDrawClick,
    onSelectWall,
    onFinishChain,
    onViewChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: DEFAULT_SCALE });
  const [hover, setHover] = useState<{ snapped: Vec2; kind: SnapKind } | null>(null);
  const [panning, setPanning] = useState(false);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const pendingRef = useRef(pendingStart);
  pendingRef.current = pendingStart;
  const wallsRef = useRef(walls);
  wallsRef.current = walls;
  const spaceRef = useRef(spacePanActive);
  spaceRef.current = spacePanActive;
  const panState = useRef<{
    active: boolean;
    moved: boolean;
    startSX: number;
    startSY: number;
    camX: number;
    camY: number;
    button: number;
  } | null>(null);

  useEffect(() => {
    onViewChange?.(camera.scale);
  }, [camera.scale, onViewChange]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toScreen = useCallback(
    (p: Vec2): Vec2 => ({
      x: (p.x - camera.x) * camera.scale + size.width / 2,
      y: (p.y - camera.y) * camera.scale + size.height / 2,
    }),
    [camera, size],
  );

  const toWorld = useCallback(
    (sx: number, sy: number): Vec2 => ({
      x: (sx - size.width / 2) / camera.scale + camera.x,
      y: (sy - size.height / 2) / camera.scale + camera.y,
    }),
    [camera, size],
  );

  const zoomAt = useCallback(
    (sx: number, sy: number, factor: number) => {
      const cam = cameraRef.current;
      const nextScale = clampScale(cam.scale * factor);
      if (nextScale === cam.scale) return;
      const wx = (sx - size.width / 2) / cam.scale + cam.x;
      const wy = (sy - size.height / 2) / cam.scale + cam.y;
      const next = {
        scale: nextScale,
        x: wx - (sx - size.width / 2) / nextScale,
        y: wy - (sy - size.height / 2) / nextScale,
      };
      cameraRef.current = next;
      setCamera(next);
    },
    [size],
  );

  const fitView = useCallback(() => {
    const box = wallsBoundingBox(wallsRef.current);
    if (!box) {
      const next = { x: 0, y: 0, scale: DEFAULT_SCALE };
      cameraRef.current = next;
      setCamera(next);
      return;
    }
    const padM = 2;
    const bw = Math.max(1, box.maxX - box.minX + padM * 2);
    const bh = Math.max(1, box.maxY - box.minY + padM * 2);
    const nextScale = clampScale(Math.min(size.width / bw, size.height / bh));
    const next = {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      scale: nextScale,
    };
    cameraRef.current = next;
    setCamera(next);
  }, [size]);

  const resetView = useCallback(() => {
    const next = { x: 0, y: 0, scale: DEFAULT_SCALE };
    cameraRef.current = next;
    setCamera(next);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomAt(size.width / 2, size.height / 2, 1.25),
      zoomOut: () => zoomAt(size.width / 2, size.height / 2, 1 / 1.25),
      fitView,
      resetView,
    }),
    [fitView, resetView, size, zoomAt],
  );

  // Wheel zoom (non-passive so we can prevent page scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      const cam = cameraRef.current;
      const nextScale = clampScale(cam.scale * factor);
      if (nextScale === cam.scale) return;
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const wx = (sx - rect.width / 2) / cam.scale + cam.x;
      const wy = (sy - rect.height / 2) / cam.scale + cam.y;
      const next = {
        scale: nextScale,
        x: wx - (sx - rect.width / 2) / nextScale,
        y: wy - (sy - rect.height / 2) / nextScale,
      };
      cameraRef.current = next;
      setCamera(next);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const updateHover = useCallback(
    (sx: number, sy: number) => {
      const raw = toWorld(sx, sy);
      const tolerance = snapToleranceForScale(cameraRef.current.scale);
      const snapped = snapPoint(raw, wallsRef.current, tolerance, pendingRef.current);
      setHover({ snapped: snapped.point, kind: snapped.kind });
    },
    [toWorld],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const isMiddle = event.button === 1;
      const forcePan = spaceRef.current || isMiddle;
      if (event.button === 0 && !forcePan && toolRef.current === 'wall') {
        // Direct manipulation: click draws immediately on mousedown for speed.
        const raw = toWorld(sx, sy);
        const tolerance = snapToleranceForScale(cameraRef.current.scale);
        const snapped = snapPoint(raw, wallsRef.current, tolerance, pendingRef.current);
        onDrawClick(snapped.point);
        return;
      }
      if (event.button === 0 || isMiddle) {
        panState.current = {
          active: true,
          moved: false,
          startSX: sx,
          startSY: sy,
          camX: cameraRef.current.x,
          camY: cameraRef.current.y,
          button: event.button,
        };
        if (forcePan) setPanning(true);
      }
    },
    [onDrawClick, toWorld],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const pan = panState.current;
      if (pan?.active) {
        const dx = sx - pan.startSX;
        const dy = sy - pan.startSY;
        if (Math.hypot(dx, dy) > 4) pan.moved = true;
        const mustPan =
          spaceRef.current || pan.button === 1 || (toolRef.current === 'select' && pan.moved);
        if (mustPan) {
          if (!pan.moved && (spaceRef.current || pan.button === 1)) pan.moved = true;
          setPanning(true);
          const scale = cameraRef.current.scale;
          const next = { ...cameraRef.current, x: pan.camX - dx / scale, y: pan.camY - dy / scale };
          cameraRef.current = next;
          setCamera(next);
        }
      }
      updateHover(sx, sy);
    },
    [updateHover],
  );

  const handleMouseUp = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const pan = panState.current;
      panState.current = null;
      setPanning(false);
      if (pan?.moved) return;
      if (toolRef.current !== 'select' || event.button !== 0) return;
      if (spaceRef.current) return;
      // Clicked without dragging on the select tool: background click handled
      // by the rect below; wall hits stop propagation before reaching here.
      onSelectWall(null, event.shiftKey);
    },
    [onSelectWall],
  );

  const handleMouseLeave = useCallback(() => {
    panState.current = null;
    setPanning(false);
    setHover(null);
  }, []);

  const grid = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
    const labels: Array<{ x: number; y: number; text: string }> = [];
    const left = camera.x - size.width / 2 / camera.scale;
    const right = camera.x + size.width / 2 / camera.scale;
    const top = camera.y - size.height / 2 / camera.scale;
    const bottom = camera.y + size.height / 2 / camera.scale;
    const showMinor = camera.scale > 12;
    const step = showMinor ? GRID_MINOR_M : GRID_MAJOR_M;
    for (let gx = Math.floor(left / step) * step; gx <= right; gx += step) {
      const major = Math.abs(gx / GRID_MAJOR_M - Math.round(gx / GRID_MAJOR_M)) < 1e-9;
      if (!showMinor && !major) continue;
      const s1 = toScreen({ x: gx, y: top });
      const s2 = toScreen({ x: gx, y: bottom });
      lines.push({ x1: s1.x, y1: 0, x2: s2.x, y2: size.height, major });
    }
    for (let gy = Math.floor(top / step) * step; gy <= bottom; gy += step) {
      const major = Math.abs(gy / GRID_MAJOR_M - Math.round(gy / GRID_MAJOR_M)) < 1e-9;
      if (!showMinor && !major) continue;
      const s1 = toScreen({ x: left, y: gy });
      const s2 = toScreen({ x: right, y: gy });
      lines.push({ x1: 0, y1: s1.y, x2: size.width, y2: s2.y, major });
      if (major && camera.scale > 28 && Math.round(gy / GRID_MAJOR_M) % 1 === 0) {
        labels.push({ x: 6, y: s1.y - 4, text: `${Number(gy.toFixed(1))}` });
      }
    }
    return { lines, labels };
  }, [camera, size, toScreen]);

  const joints = useMemo(() => {
    const counts = new Map<string, { point: Vec2; thickness: number; selected: boolean }>();
    for (const wall of walls) {
      const isSelected = selectedIds.includes(wall.id);
      for (const endpoint of [wall.start, wall.end]) {
        const key = endpointKey(endpoint);
        const existing = counts.get(key);
        if (!existing) {
          counts.set(key, { point: endpoint, thickness: wall.thickness, selected: isSelected });
        } else {
          existing.thickness = Math.max(existing.thickness, wall.thickness);
          existing.selected = existing.selected || isSelected;
        }
      }
    }
    return [...counts.values()].filter((joint) => {
      // Only shared endpoints need a corner dot to keep joins clean.
      return walls.some(
        (w) =>
          endpointKey(w.start) === endpointKey(joint.point) ||
          endpointKey(w.end) === endpointKey(joint.point),
      );
    });
  }, [walls, selectedIds]);

  const sharedKeys = useMemo(() => {
    const seen = new Map<string, number>();
    for (const wall of walls) {
      for (const endpoint of [wall.start, wall.end]) {
        const key = endpointKey(endpoint);
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [walls]);

  const previewLength =
    pendingStart && hover ? Math.hypot(hover.snapped.x - pendingStart.x, hover.snapped.y - pendingStart.y) : 0;
  const previewMid =
    pendingStart && hover
      ? { x: (pendingStart.x + hover.snapped.x) / 2, y: (pendingStart.y + hover.snapped.y) / 2 }
      : null;
  const previewMidScreen = previewMid ? toScreen(previewMid) : null;

  const cursor = panning
    ? 'grabbing'
    : spacePanActive
      ? 'grab'
      : tool === 'wall'
        ? 'crosshair'
        : 'default';

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-muted/20">
      <svg
        ref={svgRef}
        role="application"
        aria-label={canvasAriaLabel}
        width={size.width}
        height={size.height}
        className="block touch-none"
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={onFinishChain}
      >
        {/* Pan/zoom grid */}
        <g>
          {grid.lines.map((line, index) => (
            <line
              key={index}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.major ? '#d4d4d8' : '#e9e9ec'}
              strokeWidth={1}
            />
          ))}
          {/* World origin */}
          {(() => {
            const origin = toScreen({ x: 0, y: 0 });
            return (
              <g>
                <line
                  x1={0}
                  y1={origin.y}
                  x2={size.width}
                  y2={origin.y}
                  stroke="#c4c4cc"
                  strokeWidth={1}
                />
                <line
                  x1={origin.x}
                  y1={0}
                  x2={origin.x}
                  y2={size.height}
                  stroke="#c4c4cc"
                  strokeWidth={1}
                />
              </g>
            );
          })()}
          {grid.labels.map((label, index) => (
            <text key={index} x={label.x} y={label.y} fontSize={10} fill="#a1a1aa">
              {label.text}
            </text>
          ))}
        </g>

        {/* Background click target (below walls) */}
        <rect
          x={0}
          y={0}
          width={size.width}
          height={size.height}
          fill="transparent"
          onMouseUp={(event) => {
            event.stopPropagation();
            // Wall drawing is handled on mousedown for speed; this target only
            // deselects in the select tool (wall hits stop propagation above).
            if (tool === 'select' && !spacePanActive) onSelectWall(null, event.shiftKey);
          }}
        />

        {/* Clean corner joints for connected walls */}
        {joints
          .filter((joint) => sharedKeys.has(endpointKey(joint.point)))
          .map((joint) => {
            const screen = toScreen(joint.point);
            return (
              <circle
                key={`joint-${endpointKey(joint.point)}`}
                cx={screen.x}
                cy={screen.y}
                r={(joint.thickness * camera.scale) / 2}
                fill={joint.selected ? '#2563eb' : '#334155'}
              />
            );
          })}

        {/* Wall bodies as real geometry (thick round strokes) */}
        {walls.map((wall) => {
          const s = toScreen(wall.start);
          const e = toScreen(wall.end);
          const isSelected = selectedIds.includes(wall.id);
          const widthPx = Math.max(3, wall.thickness * camera.scale);
          return (
            <g key={wall.id}>
              <line
                x1={s.x}
                y1={s.y}
                x2={e.x}
                y2={e.y}
                stroke="rgba(15,23,42,0.25)"
                strokeWidth={widthPx + 2}
                strokeLinecap="round"
              />
              <line
                x1={s.x}
                y1={s.y}
                x2={e.x}
                y2={e.y}
                stroke={isSelected ? '#2563eb' : '#334155'}
                strokeWidth={widthPx}
                strokeLinecap="round"
              />
              {isSelected && (
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={e.x}
                  y2={e.y}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                />
              )}
              {/* Wide invisible hit target */}
              <line
                x1={s.x}
                y1={s.y}
                x2={e.x}
                y2={e.y}
                stroke="transparent"
                strokeWidth={Math.max(14, widthPx + 8)}
                strokeLinecap="round"
                style={{ cursor: tool === 'select' ? 'pointer' : cursor }}
                onMouseDown={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  event.stopPropagation();
                }}
                onMouseUp={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  event.stopPropagation();
                  onSelectWall(wall.id, event.shiftKey);
                }}
              />
              {isSelected && (
                <g>
                  {[s, e].map((p, index) => (
                    <rect
                      key={index}
                      x={p.x - 5}
                      y={p.y - 5}
                      width={10}
                      height={10}
                      rx={2}
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth={2}
                    />
                  ))}
                </g>
              )}
            </g>
          );
        })}

        {/* Pending start marker */}
        {pendingStart &&
          (() => {
            const s = toScreen(pendingStart);
            return (
              <circle
                cx={s.x}
                cy={s.y}
                r={6}
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth={2}
                style={{ pointerEvents: 'none' }}
              />
            );
          })()}

        {/* Live preview while drawing */}
        {tool === 'wall' && pendingStart && hover && previewLength > 1e-6 && (
          <g style={{ pointerEvents: 'none' }}>
            {(() => {
              const s = toScreen(pendingStart);
              const e = toScreen(hover.snapped);
              return (
                <g>
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={e.x}
                    y2={e.y}
                    stroke="#2563eb"
                    strokeWidth={Math.max(3, 0.2 * camera.scale)}
                    strokeLinecap="round"
                    strokeDasharray="8 5"
                    opacity={0.85}
                  />
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={e.x}
                    y2={e.y}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeDasharray="8 5"
                    opacity={0.9}
                  />
                </g>
              );
            })()}
          </g>
        )}

        {/* Snap indicator */}
        {tool === 'wall' && hover?.kind && (
          <g style={{ pointerEvents: 'none' }}>
            {(() => {
              const s = toScreen(hover.snapped);
              const color = SNAP_COLORS[hover.kind];
              return (
                <g>
                  <circle cx={s.x} cy={s.y} r={8} fill="none" stroke={color} strokeWidth={2} />
                  <circle cx={s.x} cy={s.y} r={2.5} fill={color} />
                </g>
              );
            })()}
          </g>
        )}
      </svg>

      {/* Floating length + snap chips (HTML for crisp text) */}
      {tool === 'wall' && pendingStart && hover && previewMidScreen && previewLength > 1e-6 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-background/95 px-2 py-0.5 text-xs font-semibold shadow-sm"
          style={{ left: previewMidScreen.x, top: previewMidScreen.y - 10 }}
        >
          {formatLengthM(previewLength)}
          {hover.kind && (
            <span className="ml-1.5 font-normal" style={{ color: SNAP_COLORS[hover.kind] }}>
              · {snapLabel(hover.kind)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default EditorCanvas;
