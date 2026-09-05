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
  nearestEndpoint,
  nearestWall,
  openingEndpoints,
  parseLengthM,
  projectPointToWall,
  snapPoint,
  snapToleranceForScale,
  type SnapKind,
} from '@/lib/floorplan/geometry';
import {
  wallsBoundingBox,
  type Door,
  type Room,
  type Vec2,
  type Wall,
  type Window,
} from '@/lib/floorplan/model';
import type { EditorTool, SelectionKind } from '@/lib/floorplan/use-floorplan-editor';

export type EditorCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
  resetView: () => void;
};

export type OpeningSelection = { kind: 'door' | 'window'; id: string } | null;

type EditorCanvasProps = {
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  selectedIds: string[];
  selectedOpening: OpeningSelection;
  selectedRoomId: string | null;
  tool: EditorTool;
  pendingStart: Vec2 | null;
  spacePanActive: boolean;
  snapLabel: (kind: Exclude<SnapKind, null>) => string;
  canvasAriaLabel: string;
  formatRoomLabel: (room: Room) => string;
  formatRoomArea: (room: Room) => string;
  dimensionEditTitle: string;
  onDrawClick: (point: Vec2) => void;
  onSelect: (kind: SelectionKind, id: string | null, additive: boolean) => void;
  onFinishChain: () => void;
  onViewChange?: (scale: number) => void;
  onPlaceOpening: (kind: 'door' | 'window', wallId: string, t: number) => void;
  onWallLengthCommit: (wallId: string, lengthM: number) => void;
  onBeginTransient: () => void;
  onPreviewWallEndpoint: (wallId: string, which: 'start' | 'end', point: Vec2) => void;
  onPreviewWallMove: (wallId: string, delta: Vec2) => void;
  onPreviewOpeningT: (kind: 'door' | 'window', id: string, centerT: number) => void;
  onEndTransient: (commit: boolean) => void;
};

type Camera = { x: number; y: number; scale: number };

type DragState =
  | { type: 'endpoint'; wallId: string; which: 'start' | 'end'; active: boolean; startSX: number; startSY: number }
  | { type: 'wall'; wallId: string; grabWorld: Vec2; origStart: Vec2; origEnd: Vec2; active: boolean; startSX: number; startSY: number }
  | { type: 'opening'; kind: 'door' | 'window'; id: string; active: boolean; startSX: number; startSY: number };

const DEFAULT_SCALE = 60;
const MIN_SCALE = 8;
const MAX_SCALE = 500;
const GRID_MINOR_M = 0.5;
const GRID_MAJOR_M = 2;
const DRAG_THRESHOLD_PX = 4;

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
    rooms,
    doors,
    windows,
    selectedIds,
    selectedOpening,
    selectedRoomId,
    tool,
    pendingStart,
    spacePanActive,
    snapLabel,
    canvasAriaLabel,
    formatRoomLabel,
    formatRoomArea,
    dimensionEditTitle,
    onDrawClick,
    onSelect,
    onFinishChain,
    onViewChange,
    onPlaceOpening,
    onWallLengthCommit,
    onBeginTransient,
    onPreviewWallEndpoint,
    onPreviewWallMove,
    onPreviewOpeningT,
    onEndTransient,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: DEFAULT_SCALE });
  const [hover, setHover] = useState<{ snapped: Vec2; kind: SnapKind } | null>(null);
  const [panning, setPanning] = useState(false);
  const [dimEditing, setDimEditing] = useState(false);
  const [dimDraft, setDimDraft] = useState('');
  const [selDimEditing, setSelDimEditing] = useState(false);
  const [selDimDraft, setSelDimDraft] = useState('');
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
  const dragRef = useRef<DragState | null>(null);
  const transientActive = useRef(false);
  // Opening lookups for the drag handler (kept in refs to avoid stale closures).
  const doorsRef = useRef(doors);
  doorsRef.current = doors;
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const endTransientRef = useRef(onEndTransient);
  endTransientRef.current = onEndTransient;
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

  const finishPan = useCallback(() => {
    const pan = panState.current;
    panState.current = null;
    setPanning(false);
    return pan;
  }, []);

  const finishDrag = useCallback((commit: boolean) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.active && transientActive.current) {
      transientActive.current = false;
      endTransientRef.current(commit);
    }
    return drag;
  }, []);

  // Safety net: pointer released outside the canvas must not leave a stale
  // pan or element drag behind.
  useEffect(() => {
    const onWindowMouseUp = () => {
      finishPan();
      finishDrag(true);
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => window.removeEventListener('mouseup', onWindowMouseUp);
  }, [finishPan, finishDrag]);

  const beginDragIfMoved = useCallback(
    (sx: number, sy: number) => {
      const drag = dragRef.current;
      if (!drag || drag.active) return;
      if (Math.hypot(sx - drag.startSX, sy - drag.startSY) <= DRAG_THRESHOLD_PX) return;
      drag.active = true;
      transientActive.current = true;
      onBeginTransient();
    },
    [onBeginTransient],
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
      if (event.button === 0 && !forcePan && (toolRef.current === 'door' || toolRef.current === 'window')) {
        const raw = toWorld(sx, sy);
        const tolerance = snapToleranceForScale(cameraRef.current.scale);
        const hit = nearestWall(raw, wallsRef.current, tolerance);
        if (hit) {
          onPlaceOpening(toolRef.current, hit.wall.id, hit.t);
        }
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
    [onDrawClick, onPlaceOpening, toWorld],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const drag = dragRef.current;
      if (drag && event.buttons !== 0) {
        beginDragIfMoved(sx, sy);
        if (drag.active) {
          const raw = toWorld(sx, sy);
          const tolerance = snapToleranceForScale(cameraRef.current.scale);
          if (drag.type === 'endpoint') {
            const wall = wallsRef.current.find((w) => w.id === drag.wallId);
            if (wall) {
              const fixed = drag.which === 'start' ? wall.end : wall.start;
              const snapped = snapPoint(raw, wallsRef.current, tolerance, fixed);
              onPreviewWallEndpoint(drag.wallId, drag.which, snapped.point);
            }
          } else if (drag.type === 'wall') {
            const rawDelta = { x: raw.x - drag.grabWorld.x, y: raw.y - drag.grabWorld.y };
            let delta = rawDelta;
            // Snap the moved endpoints onto nearby existing endpoints so a
            // dragged wall reconnects precisely instead of approximately.
            const others = wallsRef.current.filter((w) => w.id !== drag.wallId);
            const movedStart = { x: drag.origStart.x + rawDelta.x, y: drag.origStart.y + rawDelta.y };
            const movedEnd = { x: drag.origEnd.x + rawDelta.x, y: drag.origEnd.y + rawDelta.y };
            const snapStart = nearestEndpoint(movedStart, others, tolerance);
            const snapHit = snapStart ?? nearestEndpoint(movedEnd, others, tolerance);
            if (snapHit) {
              const origCorner = snapStart ? drag.origStart : drag.origEnd;
              delta = { x: snapHit.point.x - origCorner.x, y: snapHit.point.y - origCorner.y };
            }
            onPreviewWallMove(drag.wallId, delta);
          } else {
            const host = wallsRef.current.find((w) =>
              (drag.kind === 'door'
                ? doorsRef.current.find((d) => d.id === drag.id)?.wallId
                : windowsRef.current.find((w2) => w2.id === drag.id)?.wallId) === w.id,
            );
            if (host) {
              const projected = projectPointToWall(raw, host);
              onPreviewOpeningT(drag.kind, drag.id, projected.t);
            }
          }
          updateHover(sx, sy);
          return;
        }
      } else if (drag && event.buttons === 0) {
        finishDrag(true);
      }
      const pan = panState.current;
      // event.buttons is 0 when no button is held: plain hovering must never pan.
      if (pan?.active && event.buttons !== 0) {
        const dx = sx - pan.startSX;
        const dy = sy - pan.startSY;
        if (Math.hypot(dx, dy) > 4) pan.moved = true;
        const mustPan =
          spaceRef.current || pan.button === 1 || (toolRef.current === 'select' && pan.moved && !dragRef.current);
        if (mustPan) {
          if (!pan.moved && (spaceRef.current || pan.button === 1)) pan.moved = true;
          setPanning(true);
          const scale = cameraRef.current.scale;
          const next = { ...cameraRef.current, x: pan.camX - dx / scale, y: pan.camY - dy / scale };
          cameraRef.current = next;
          setCamera(next);
        }
      } else if (pan?.active && event.buttons === 0) {
        // Button released without a mouseup reaching the canvas: drop the stale pan.
        finishPan();
      }
      updateHover(sx, sy);
    },
    [beginDragIfMoved, finishDrag, finishPan, onPreviewOpeningT, onPreviewWallEndpoint, onPreviewWallMove, toWorld, updateHover],
  );

  const handleMouseUp = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const pan = finishPan();
      const drag = finishDrag(true);
      if (drag?.active) return;
      if (drag && !drag.active) {
        // Clicked an element without dragging: handled by the element's own
        // mouseup (stopPropagation above); nothing to do here.
        return;
      }
      if (pan?.moved) return;
      if (toolRef.current !== 'select' || event.button !== 0) return;
      if (spaceRef.current) return;
      // Clicked without dragging on the select tool: background click handled
      // by the rect below; wall hits stop propagation before reaching here.
      selectRef.current('wall', null, event.shiftKey);
    },
    [finishDrag, finishPan],
  );

  const handleMouseLeave = useCallback(() => {
    finishPan();
    finishDrag(true);
    setHover(null);
  }, [finishDrag, finishPan]);

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

  const wallsById = useMemo(() => new Map(walls.map((wall) => [wall.id, wall])), [walls]);

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

  // Host wall of the selected opening (highlighted), and openings attached
  // to selected walls (emphasized).
  const selectedHostWallId = useMemo(() => {
    if (!selectedOpening) return null;
    if (selectedOpening.kind === 'door') {
      return doors.find((d) => d.id === selectedOpening.id)?.wallId ?? null;
    }
    return windows.find((w) => w.id === selectedOpening.id)?.wallId ?? null;
  }, [selectedOpening, doors, windows]);

  const attachedOpeningIds = useMemo(() => {
    const selected = new Set(selectedIds);
    const ids = new Set<string>();
    for (const d of doors) if (selected.has(d.wallId)) ids.add(d.id);
    for (const w of windows) if (selected.has(w.wallId)) ids.add(w.id);
    return ids;
  }, [doors, windows, selectedIds]);

  const previewLength =
    pendingStart && hover ? Math.hypot(hover.snapped.x - pendingStart.x, hover.snapped.y - pendingStart.y) : 0;
  const previewMid =
    pendingStart && hover
      ? { x: (pendingStart.x + hover.snapped.x) / 2, y: (pendingStart.y + hover.snapped.y) / 2 }
      : null;
  const previewMidScreen = previewMid ? toScreen(previewMid) : null;

  // Single selected wall dimension chip.
  const singleSelectedWall = selectedIds.length === 1 ? (wallsById.get(selectedIds[0]) ?? null) : null;
  const singleSelectedMidScreen = singleSelectedWall
    ? toScreen({
        x: (singleSelectedWall.start.x + singleSelectedWall.end.x) / 2,
        y: (singleSelectedWall.start.y + singleSelectedWall.end.y) / 2,
      })
    : null;

  const commitDrawDimension = useCallback(() => {
    if (!pendingRef.current || !hover) {
      setDimEditing(false);
      return;
    }
    const parsed = parseLengthM(dimDraft);
    setDimEditing(false);
    if (parsed === null || parsed <= 0) return;
    const start = pendingRef.current;
    const dx = hover.snapped.x - start.x;
    const dy = hover.snapped.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return;
    onDrawClick({ x: start.x + (dx / len) * parsed, y: start.y + (dy / len) * parsed });
  }, [dimDraft, hover, onDrawClick]);

  const commitSelectedLength = useCallback(() => {
    setSelDimEditing(false);
    if (!singleSelectedWall) return;
    const parsed = parseLengthM(selDimDraft);
    if (parsed === null) return;
    onWallLengthCommit(singleSelectedWall.id, parsed);
  }, [onWallLengthCommit, selDimDraft, singleSelectedWall]);

  const startElementDrag = useCallback(
    (event: React.MouseEvent, drag: DragState) => {
      if (toolRef.current !== 'select' || spaceRef.current) return;
      if (event.button !== 0) return;
      event.stopPropagation();
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        drag.startSX = event.clientX - rect.left;
        drag.startSY = event.clientY - rect.top;
      }
      dragRef.current = drag;
    },
    [],
  );

  const cursor = panning
    ? 'grabbing'
    : spacePanActive
      ? 'grab'
      : tool === 'wall' || tool === 'door' || tool === 'window'
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

        {/* Background click target (below everything interactive) */}
        <rect
          x={0}
          y={0}
          width={size.width}
          height={size.height}
          fill="transparent"
          onMouseUp={(event) => {
            event.stopPropagation();
            const pan = finishPan();
            const drag = finishDrag(true);
            if (drag?.active) return;
            // Wall drawing is handled on mousedown for speed; this target only
            // deselects on a plain click in the select tool (wall hits stop
            // propagation above). A released drag is a pan, not a deselect.
            if (pan?.moved) return;
            if (tool === 'select' && !spacePanActive) selectRef.current('wall', null, event.shiftKey);
          }}
        />

        {/* Rooms: subtle fill below walls, clickable to select + rename */}
        {rooms.map((room) => {
          if (room.polygon.length < 3) return null;
          const points = room.polygon.map((p) => {
            const s = toScreen(p);
            return `${s.x},${s.y}`;
          }).join(' ');
          const isSelected = selectedRoomId === room.id;
          return (
            <g key={room.id}>
              <polygon
                points={points}
                fill={isSelected ? 'rgba(37,99,235,0.10)' : 'rgba(148,163,184,0.13)'}
                stroke={isSelected ? '#2563eb' : '#94a3b8'}
                strokeWidth={isSelected ? 2 : 1}
                strokeDasharray={isSelected ? '7 4' : undefined}
                style={{ cursor: tool === 'select' ? 'pointer' : cursor }}
                onMouseUp={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  event.stopPropagation();
                  const pan = finishPan();
                  if (pan?.moved) return;
                  selectRef.current('room', room.id, false);
                }}
              />
            </g>
          );
        })}

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
          const isHost = selectedHostWallId === wall.id;
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
              {(isSelected || isHost) && (
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
                style={{ cursor: tool === 'select' ? 'move' : cursor }}
                onMouseDown={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  event.stopPropagation();
                  const world = toWorld(event.clientX - (svgRef.current?.getBoundingClientRect().left ?? 0), event.clientY - (svgRef.current?.getBoundingClientRect().top ?? 0));
                  startElementDrag(event, {
                    type: 'wall',
                    wallId: wall.id,
                    grabWorld: world,
                    origStart: { ...wall.start },
                    origEnd: { ...wall.end },
                    active: false,
                    startSX: 0,
                    startSY: 0,
                  });
                }}
                onMouseUp={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  event.stopPropagation();
                  const drag = finishDrag(true);
                  const pan = finishPan();
                  // Releasing after a drag is a move gesture, not a click.
                  if (drag?.active || pan?.moved) return;
                  selectRef.current('wall', wall.id, event.shiftKey);
                }}
              />
              {isSelected && (
                <g>
                  {(['start', 'end'] as const).map((which) => {
                    const p = which === 'start' ? s : e;
                    return (
                      <g key={which}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={12}
                          fill="transparent"
                          style={{ cursor: 'grab' }}
                          onMouseDown={(event) => {
                            if (tool !== 'select' || spacePanActive) return;
                            startElementDrag(event, {
                              type: 'endpoint',
                              wallId: wall.id,
                              which,
                              active: false,
                              startSX: 0,
                              startSY: 0,
                            });
                          }}
                          onMouseUp={(event) => {
                            if (tool !== 'select' || spacePanActive) return;
                            event.stopPropagation();
                            finishDrag(true);
                          }}
                        />
                        <rect
                          x={p.x - 5}
                          y={p.y - 5}
                          width={10}
                          height={10}
                          rx={2}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth={2}
                          style={{ pointerEvents: 'none' }}
                        />
                      </g>
                    );
                  })}
                </g>
              )}
            </g>
          );
        })}

        {/* Doors: jamb ticks + leaf + swing arc */}
        {doors.map((door) => {
          const wall = wallsById.get(door.wallId);
          if (!wall) return null;
          const { p1, p2 } = openingEndpoints(wall, door.centerT, door.width);
          const s1 = toScreen(p1);
          const s2 = toScreen(p2);
          const hinge = door.swing === 'left' ? s1 : s2;
          const far = door.swing === 'left' ? s2 : s1;
          // Leaf direction: wall tangent rotated -90° in screen space.
          const tx = s2.x - s1.x;
          const ty = s2.y - s1.y;
          const tLen = Math.hypot(tx, ty) || 1;
          const ux = tx / tLen;
          const uy = ty / tLen;
          const leafLenPx = door.width * camera.scale;
          const leafEnd = { x: hinge.x - uy * leafLenPx, y: hinge.y + ux * leafLenPx };
          const isSelected = selectedOpening?.kind === 'door' && selectedOpening.id === door.id;
          const emphasized = isSelected || attachedOpeningIds.has(door.id);
          const color = emphasized ? '#2563eb' : '#475569';
          return (
            <g key={door.id}>
              {/* jamb ticks */}
              <line x1={s1.x - uy * 6} y1={s1.y + ux * 6} x2={s1.x + uy * 6} y2={s1.y - ux * 6} stroke={color} strokeWidth={2.5} />
              <line x1={s2.x - uy * 6} y1={s2.y + ux * 6} x2={s2.x + uy * 6} y2={s2.y - ux * 6} stroke={color} strokeWidth={2.5} />
              {/* swing arc from leaf end to the closed position */}
              <path
                d={`M ${leafEnd.x} ${leafEnd.y} A ${leafLenPx} ${leafLenPx} 0 0 1 ${far.x} ${far.y}`}
                fill="none"
                stroke={color}
                strokeWidth={1.25}
                strokeDasharray="4 3"
                opacity={0.9}
              />
              {/* leaf */}
              <line x1={hinge.x} y1={hinge.y} x2={leafEnd.x} y2={leafEnd.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={hinge.x} cy={hinge.y} r={isSelected ? 4 : 2.5} fill={color} />
              {/* wide hit target along the opening */}
              <line
                x1={s1.x}
                y1={s1.y}
                x2={s2.x}
                y2={s2.y}
                stroke="transparent"
                strokeWidth={16}
                strokeLinecap="round"
                style={{ cursor: tool === 'select' ? 'grab' : cursor }}
                onMouseDown={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  startElementDrag(event, { type: 'opening', kind: 'door', id: door.id, active: false, startSX: 0, startSY: 0 });
                }}
                onMouseUp={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  event.stopPropagation();
                  const drag = finishDrag(true);
                  const pan = finishPan();
                  if (drag?.active || pan?.moved) return;
                  selectRef.current('door', door.id, false);
                }}
              />
            </g>
          );
        })}

        {/* Windows: double parallel lines + jamb ticks */}
        {windows.map((window) => {
          const wall = wallsById.get(window.wallId);
          if (!wall) return null;
          const { p1, p2 } = openingEndpoints(wall, window.centerT, window.width);
          const s1 = toScreen(p1);
          const s2 = toScreen(p2);
          const tx = s2.x - s1.x;
          const ty = s2.y - s1.y;
          const tLen = Math.hypot(tx, ty) || 1;
          const ux = tx / tLen;
          const uy = ty / tLen;
          const gap = Math.max(3, (wall.thickness * camera.scale) / 3);
          const isSelected = selectedOpening?.kind === 'window' && selectedOpening.id === window.id;
          const emphasized = isSelected || attachedOpeningIds.has(window.id);
          const color = emphasized ? '#2563eb' : '#475569';
          const glass = emphasized ? '#dbeafe' : '#f1f5f9';
          return (
            <g key={window.id}>
              <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={glass} strokeWidth={Math.max(4, wall.thickness * camera.scale * 0.8)} strokeLinecap="butt" />
              <line x1={s1.x - uy * gap} y1={s1.y + ux * gap} x2={s2.x - uy * gap} y2={s2.y + ux * gap} stroke={color} strokeWidth={1.75} />
              <line x1={s1.x + uy * gap} y1={s1.y - ux * gap} x2={s2.x + uy * gap} y2={s2.y - ux * gap} stroke={color} strokeWidth={1.75} />
              <line x1={s1.x - uy * 6} y1={s1.y + ux * 6} x2={s1.x + uy * 6} y2={s1.y - ux * 6} stroke={color} strokeWidth={2.5} />
              <line x1={s2.x - uy * 6} y1={s2.y + ux * 6} x2={s2.x + uy * 6} y2={s2.y - ux * 6} stroke={color} strokeWidth={2.5} />
              <line
                x1={s1.x}
                y1={s1.y}
                x2={s2.x}
                y2={s2.y}
                stroke="transparent"
                strokeWidth={16}
                strokeLinecap="round"
                style={{ cursor: tool === 'select' ? 'grab' : cursor }}
                onMouseDown={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  startElementDrag(event, { type: 'opening', kind: 'window', id: window.id, active: false, startSX: 0, startSY: 0 });
                }}
                onMouseUp={(event) => {
                  if (tool !== 'select' || spacePanActive) return;
                  event.stopPropagation();
                  const drag = finishDrag(true);
                  const pan = finishPan();
                  if (drag?.active || pan?.moved) return;
                  selectRef.current('window', window.id, false);
                }}
              />
            </g>
          );
        })}

        {/* Room labels: subtle, pointer-transparent */}
        {rooms.map((room) => {
          if (room.polygon.length < 3) return null;
          const c = toScreen(
            room.polygon.reduce(
              (acc, p) => ({ x: acc.x + p.x / room.polygon.length, y: acc.y + p.y / room.polygon.length }),
              { x: 0, y: 0 },
            ),
          );
          return (
            <g key={`label-${room.id}`} style={{ pointerEvents: 'none' }}>
              <text x={c.x} y={c.y - 2} textAnchor="middle" fontSize={12} fontWeight={600} fill={selectedRoomId === room.id ? '#1d4ed8' : '#64748b'}>
                {formatRoomLabel(room)}
              </text>
              <text x={c.x} y={c.y + 13} textAnchor="middle" fontSize={11} fill={selectedRoomId === room.id ? '#1d4ed8' : '#94a3b8'}>
                {formatRoomArea(room)}
              </text>
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
        {(tool === 'wall' || tool === 'door' || tool === 'window') && hover?.kind && (
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
      {tool === 'wall' && pendingStart && hover && previewMidScreen && previewLength > 1e-6 && !dimEditing && (
        <button
          type="button"
          title={dimensionEditTitle}
          className="absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-background/95 px-2 py-0.5 text-xs font-semibold shadow-sm hover:border-primary"
          style={{ left: previewMidScreen.x, top: previewMidScreen.y - 10 }}
          onClick={() => {
            setDimDraft(previewLength.toFixed(2));
            setDimEditing(true);
          }}
        >
          {formatLengthM(previewLength)}
          {hover.kind && (
            <span className="ml-1.5 font-normal" style={{ color: SNAP_COLORS[hover.kind] }}>
              · {snapLabel(hover.kind)}
            </span>
          )}
        </button>
      )}
      {tool === 'wall' && pendingStart && hover && previewMidScreen && previewLength > 1e-6 && dimEditing && (
        <form
          className="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border border-primary bg-background/95 px-2 py-0.5 text-xs shadow-sm"
          style={{ left: previewMidScreen.x, top: previewMidScreen.y - 10 }}
          onSubmit={(event) => {
            event.preventDefault();
            commitDrawDimension();
          }}
        >
          <input
            autoFocus
            aria-label={dimensionEditTitle}
            className="w-16 bg-transparent font-semibold outline-none"
            value={dimDraft}
            onChange={(event) => setDimDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setDimEditing(false);
            }}
            onBlur={commitDrawDimension}
          />
          <span className="text-muted-foreground">m</span>
        </form>
      )}

      {/* Selected wall dimension chip with direct length editing */}
      {tool === 'select' && singleSelectedWall && singleSelectedMidScreen && !selDimEditing && (
        <button
          type="button"
          title={dimensionEditTitle}
          className="absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-primary/40 bg-background/95 px-2 py-0.5 text-xs font-semibold text-primary shadow-sm hover:border-primary"
          style={{ left: singleSelectedMidScreen.x, top: singleSelectedMidScreen.y - 12 }}
          onClick={() => {
            const len = Math.hypot(
              singleSelectedWall.end.x - singleSelectedWall.start.x,
              singleSelectedWall.end.y - singleSelectedWall.start.y,
            );
            setSelDimDraft(len.toFixed(2));
            setSelDimEditing(true);
          }}
        >
          {formatLengthM(
            Math.hypot(
              singleSelectedWall.end.x - singleSelectedWall.start.x,
              singleSelectedWall.end.y - singleSelectedWall.start.y,
            ),
          )}
        </button>
      )}
      {tool === 'select' && singleSelectedWall && singleSelectedMidScreen && selDimEditing && (
        <form
          className="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border border-primary bg-background/95 px-2 py-0.5 text-xs shadow-sm"
          style={{ left: singleSelectedMidScreen.x, top: singleSelectedMidScreen.y - 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            commitSelectedLength();
          }}
        >
          <input
            autoFocus
            aria-label={dimensionEditTitle}
            className="w-16 bg-transparent font-semibold outline-none"
            value={selDimDraft}
            onChange={(event) => setSelDimDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSelDimEditing(false);
            }}
            onBlur={commitSelectedLength}
          />
          <span className="text-muted-foreground">m</span>
        </form>
      )}

    </div>
  );
});

export default EditorCanvas;
