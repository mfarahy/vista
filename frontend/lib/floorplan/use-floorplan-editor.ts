'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_WALL_THICKNESS_M,
  clampThickness,
  createWall,
  isValidWall,
  type Vec2,
  type Wall,
} from './model';

export type EditorTool = 'select' | 'wall';

export type UseFloorplanEditorResult = {
  walls: Wall[];
  selectedIds: string[];
  selectedWalls: Wall[];
  tool: EditorTool;
  pendingStart: Vec2 | null;
  thickness: number;
  canUndo: boolean;
  canRedo: boolean;
  setTool: (tool: EditorTool) => void;
  setThickness: (thickness: number) => void;
  beginWall: (point: Vec2) => void;
  finishWallSegment: (point: Vec2) => Wall | null;
  cancelPending: () => void;
  selectWall: (id: string | null, additive?: boolean) => void;
  clearSelection: () => void;
  deleteSelected: () => void;
  applyThicknessToSelection: () => void;
  clearAll: () => void;
  undo: () => void;
  redo: () => void;
};

const HISTORY_LIMIT = 100;

function cloneWalls(walls: Wall[]): Wall[] {
  return walls.map((wall) => ({
    ...wall,
    start: { ...wall.start },
    end: { ...wall.end },
  }));
}

/**
 * Editor state with a small snapshot-based undo/redo.
 * History stores wall arrays only (selection/tool are transient).
 */
export function useFloorplanEditor(): UseFloorplanEditorResult {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setToolState] = useState<EditorTool>('wall');
  const [pendingStart, setPendingStart] = useState<Vec2 | null>(null);
  const [thickness, setThicknessState] = useState<number>(DEFAULT_WALL_THICKNESS_M);
  const wallsRef = useRef<Wall[]>([]);
  const pendingRef = useRef<Vec2 | null>(null);
  const thicknessRef = useRef<number>(DEFAULT_WALL_THICKNESS_M);
  const selectedRef = useRef<string[]>([]);
  const pastRef = useRef<Wall[][]>([]);
  const futureRef = useRef<Wall[][]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const commitWalls = useCallback((next: Wall[], recordHistory = true) => {
    if (recordHistory) {
      pastRef.current.push(cloneWalls(wallsRef.current));
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
      futureRef.current = [];
    }
    wallsRef.current = next;
    setWalls(next);
    setHistoryVersion((n) => n + 1);
  }, []);

  const setTool = useCallback((next: EditorTool) => {
    setToolState(next);
    pendingRef.current = null;
    setPendingStart(null);
  }, []);

  const setThickness = useCallback((value: number) => {
    const clamped = clampThickness(value);
    thicknessRef.current = clamped;
    setThicknessState(clamped);
  }, []);

  const beginWall = useCallback((point: Vec2) => {
    pendingRef.current = { ...point };
    setPendingStart({ ...point });
  }, []);

  const finishWallSegment = useCallback((point: Vec2): Wall | null => {
    const start = pendingRef.current;
    if (!start) {
      pendingRef.current = { ...point };
      setPendingStart({ ...point });
      return null;
    }
    const candidate = createWall(start, point, thicknessRef.current);
    if (!isValidWall(candidate)) return null;
    commitWalls([...wallsRef.current, candidate]);
    // Keep chaining: the next segment starts where this one ended.
    pendingRef.current = { ...point };
    setPendingStart({ ...point });
    selectedRef.current = [candidate.id];
    setSelectedIds([candidate.id]);
    return candidate;
  }, [commitWalls]);

  const cancelPending = useCallback(() => {
    pendingRef.current = null;
    setPendingStart(null);
  }, []);

  const selectWall = useCallback((id: string | null, additive = false) => {
    if (id === null) {
      selectedRef.current = [];
      setSelectedIds([]);
      return;
    }
    const current = selectedRef.current;
    const next = additive
      ? current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
      : [id];
    selectedRef.current = next;
    setSelectedIds(next);
  }, []);

  const clearSelection = useCallback(() => {
    selectedRef.current = [];
    setSelectedIds([]);
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedRef.current.length === 0) return;
    const ids = new Set(selectedRef.current);
    commitWalls(wallsRef.current.filter((wall) => !ids.has(wall.id)));
    selectedRef.current = [];
    setSelectedIds([]);
  }, [commitWalls]);

  const applyThicknessToSelection = useCallback(() => {
    if (selectedRef.current.length === 0) return;
    const ids = new Set(selectedRef.current);
    commitWalls(
      wallsRef.current.map((wall) =>
        ids.has(wall.id) ? { ...wall, thickness: thicknessRef.current } : wall,
      ),
    );
  }, [commitWalls]);

  const clearAll = useCallback(() => {
    if (wallsRef.current.length === 0) return;
    commitWalls([]);
    selectedRef.current = [];
    setSelectedIds([]);
    pendingRef.current = null;
    setPendingStart(null);
  }, [commitWalls]);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(cloneWalls(wallsRef.current));
    wallsRef.current = previous;
    setWalls(previous);
    selectedRef.current = [];
    setSelectedIds([]);
    pendingRef.current = null;
    setPendingStart(null);
    setHistoryVersion((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneWalls(wallsRef.current));
    wallsRef.current = next;
    setWalls(next);
    selectedRef.current = [];
    setSelectedIds([]);
    pendingRef.current = null;
    setPendingStart(null);
    setHistoryVersion((n) => n + 1);
  }, []);

  const selectedWalls = useMemo(
    () => walls.filter((wall) => selectedIds.includes(wall.id)),
    [walls, selectedIds],
  );

  void historyVersion;

  return {
    walls,
    selectedIds,
    selectedWalls,
    tool,
    pendingStart,
    thickness,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    setTool,
    setThickness,
    beginWall,
    finishWallSegment,
    cancelPending,
    selectWall,
    clearSelection,
    deleteSelected,
    applyThicknessToSelection,
    clearAll,
    undo,
    redo,
  };
}
