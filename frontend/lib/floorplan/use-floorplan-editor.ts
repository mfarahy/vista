'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_WALL_THICKNESS_M,
  clampThickness,
  createWall,
  emptyFloorPlan,
  isValidWall,
  type Door,
  type DoorSwing,
  type FloorPlan,
  type Room,
  type Vec2,
  type Wall,
  type Window,
} from './model';
import {
  clonePlan,
  planAddDoor,
  planAddWall,
  planAddWindow,
  planDeleteOpenings,
  planDeleteWalls,
  planMoveDoor,
  planMoveWall,
  planMoveWindow,
  planRenameRoom,
  planSetDoorSwing,
  planSetDoorWidth,
  planSetWallEndpoint,
  planSetWallLength,
  planSetWallThickness,
  planSetWindowWidth,
  pushHistory,
  redoStep,
  undoStep,
  withRooms,
} from './plan-ops';
import { serializeFloorPlan } from './serialization';

export type EditorTool = 'select' | 'wall' | 'door' | 'window';

export type SelectionKind = 'wall' | 'door' | 'window' | 'room';
export type Selection = { kind: SelectionKind; id: string } | null;

export type UseFloorplanEditorResult = {
  plan: FloorPlan;
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  rooms: Room[];
  /** Multi-selected wall ids (Phase 1 behavior, Shift-click). */
  selectedIds: string[];
  selectedWalls: Wall[];
  selection: Selection;
  selectedDoor: Door | null;
  selectedWindow: Window | null;
  selectedRoom: Room | null;
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
  select: (kind: SelectionKind, id: string | null, additive?: boolean) => void;
  clearSelection: () => void;
  deleteSelected: () => void;
  applyThicknessToSelection: () => void;
  clearAll: () => void;
  undo: () => void;
  redo: () => void;
  // Phase 2: precision wall editing
  setWallLengthM: (wallId: string, lengthM: number) => boolean;
  // Phase 2: transient drags (endpoint / wall move / opening slide).
  // beginTransient snapshots; preview* updates without history; endTransient
  // records a single undo step (or restores when cancelled).
  beginTransient: () => void;
  previewWallEndpoint: (wallId: string, which: 'start' | 'end', point: Vec2) => void;
  previewWallMove: (wallId: string, delta: Vec2) => void;
  previewOpeningT: (kind: 'door' | 'window', id: string, centerT: number) => void;
  endTransient: (commit: boolean) => void;
  // Phase 2: doors & windows
  placeDoor: (wallId: string, centerT: number) => Door | null;
  placeWindow: (wallId: string, centerT: number) => Window | null;
  setDoorWidth: (doorId: string, width: number) => void;
  setWindowWidth: (windowId: string, width: number) => void;
  setDoorSwing: (doorId: string, swing: DoorSwing) => void;
  // Phase 3: rooms
  renameRoom: (roomId: string, name: string) => void;
  // Phase 3: persistence / import
  /** True when the plan differs from the last saved/persisted snapshot. */
  dirty: boolean;
  /** Load an external plan (import/restore). Undoable by default. */
  loadPlan: (next: FloorPlan, options?: { recordHistory?: boolean; markClean?: boolean }) => void;
  /** Mark the current plan as saved (baseline for dirty tracking). */
  markSaved: () => void;
};

const HISTORY_LIMIT = 100;

/**
 * Editor state with snapshot-based undo/redo over the whole FloorPlan
 * (walls, doors, windows; rooms re-derive but keep user names).
 * Selection and tool are transient and never enter history.
 */
export function useFloorplanEditor(): UseFloorplanEditorResult {
  const [plan, setPlan] = useState<FloorPlan>(() => emptyFloorPlan());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedOpening, setSelectedOpening] = useState<{ kind: 'door' | 'window'; id: string } | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [tool, setToolState] = useState<EditorTool>('wall');
  const [pendingStart, setPendingStart] = useState<Vec2 | null>(null);
  const [thickness, setThicknessState] = useState<number>(DEFAULT_WALL_THICKNESS_M);
  const planRef = useRef<FloorPlan>(emptyFloorPlan());
  const pendingRef = useRef<Vec2 | null>(null);
  const thicknessRef = useRef<number>(DEFAULT_WALL_THICKNESS_M);
  const selectedRef = useRef<string[]>([]);
  const openingRef = useRef<{ kind: 'door' | 'window'; id: string } | null>(null);
  const roomRef = useRef<string | null>(null);
  const pastRef = useRef<FloorPlan[]>([]);
  const futureRef = useRef<FloorPlan[]>([]);
  const transientRef = useRef<FloorPlan | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  // Phase 3: dirty tracking against the last persisted snapshot.
  const savedRef = useRef<string>(serializeFloorPlan(emptyFloorPlan()));
  const [dirty, setDirty] = useState(false);

  const commitPlan = useCallback((next: FloorPlan, recordHistory = true) => {
    if (recordHistory) {
      pastRef.current = pushHistory(pastRef.current, clonePlan(planRef.current), HISTORY_LIMIT);
      futureRef.current = [];
    }
    planRef.current = next;
    setPlan(next);
    setDirty(serializeFloorPlan(next) !== savedRef.current);
    setHistoryVersion((n) => n + 1);
  }, []);

  const clearTransientSelection = useCallback(() => {
    selectedRef.current = [];
    setSelectedIds([]);
    openingRef.current = null;
    setSelectedOpening(null);
    roomRef.current = null;
    setSelectedRoomId(null);
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
    commitPlan(planAddWall(planRef.current, candidate));
    pendingRef.current = { ...point };
    setPendingStart({ ...point });
    selectedRef.current = [candidate.id];
    setSelectedIds([candidate.id]);
    openingRef.current = null;
    setSelectedOpening(null);
    roomRef.current = null;
    setSelectedRoomId(null);
    return candidate;
  }, [commitPlan]);

  const cancelPending = useCallback(() => {
    pendingRef.current = null;
    setPendingStart(null);
  }, []);

  const select = useCallback((kind: SelectionKind, id: string | null, additive = false) => {
    if (id === null) {
      if (!additive) {
        selectedRef.current = [];
        setSelectedIds([]);
        openingRef.current = null;
        setSelectedOpening(null);
        roomRef.current = null;
        setSelectedRoomId(null);
      }
      return;
    }
    if (kind === 'wall') {
      const current = selectedRef.current;
      const next = additive
        ? current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id]
        : [id];
      selectedRef.current = next;
      setSelectedIds(next);
      openingRef.current = null;
      setSelectedOpening(null);
      roomRef.current = null;
      setSelectedRoomId(null);
      return;
    }
    // Doors, windows and rooms are single-select and replace wall selection.
    selectedRef.current = [];
    setSelectedIds([]);
    if (kind === 'room') {
      roomRef.current = id;
      setSelectedRoomId(id);
      openingRef.current = null;
      setSelectedOpening(null);
    } else {
      openingRef.current = { kind, id };
      setSelectedOpening({ kind, id });
      roomRef.current = null;
      setSelectedRoomId(null);
    }
  }, []);

  const selectWall = useCallback((id: string | null, additive = false) => {
    select('wall', id, additive);
  }, [select]);

  const clearSelection = useCallback(() => {
    clearTransientSelection();
  }, [clearTransientSelection]);

  const deleteSelected = useCallback(() => {
    const wallIds = selectedRef.current;
    const opening = openingRef.current;
    if (wallIds.length === 0 && !opening) return;
    let next = planRef.current;
    if (wallIds.length > 0) next = planDeleteWalls(next, wallIds);
    if (opening) {
      next = planDeleteOpenings(
        next,
        opening.kind === 'door' ? [opening.id] : [],
        opening.kind === 'window' ? [opening.id] : [],
      );
    }
    commitPlan(next);
    clearTransientSelection();
  }, [commitPlan, clearTransientSelection]);

  const applyThicknessToSelection = useCallback(() => {
    if (selectedRef.current.length === 0) return;
    commitPlan(planSetWallThickness(planRef.current, selectedRef.current, thicknessRef.current));
  }, [commitPlan]);

  const clearAll = useCallback(() => {
    const current = planRef.current;
    if (current.walls.length === 0 && current.doors.length === 0 && current.windows.length === 0) return;
    commitPlan(withRooms(emptyFloorPlan(), []));
    clearTransientSelection();
    pendingRef.current = null;
    setPendingStart(null);
  }, [commitPlan, clearTransientSelection]);

  const undo = useCallback(() => {
    const step = undoStep(    pastRef.current, futureRef.current, clonePlan(planRef.current));
    if (!step) return;
    pastRef.current = step.past;
    futureRef.current = step.future;
    planRef.current = step.current;
    setPlan(step.current);
    setDirty(serializeFloorPlan(step.current) !== savedRef.current);
    clearTransientSelection();
    pendingRef.current = null;
    setPendingStart(null);
    setHistoryVersion((n) => n + 1);
  }, [clearTransientSelection]);

  const redo = useCallback(() => {
    const step = redoStep(    pastRef.current, futureRef.current, clonePlan(planRef.current));
    if (!step) return;
    pastRef.current = step.past;
    futureRef.current = step.future;
    planRef.current = step.current;
    setPlan(step.current);
    setDirty(serializeFloorPlan(step.current) !== savedRef.current);
    clearTransientSelection();
    pendingRef.current = null;
    setPendingStart(null);
    setHistoryVersion((n) => n + 1);
  }, [clearTransientSelection]);

  // --- Precision wall editing --------------------------------------------

  const setWallLengthM = useCallback((wallId: string, lengthM: number): boolean => {
    const next = planSetWallLength(planRef.current, wallId, lengthM);
    if (!next) return false;
    commitPlan(next);
    return true;
  }, [commitPlan]);

  const beginTransient = useCallback(() => {
    transientRef.current = clonePlan(planRef.current);
  }, []);

  const previewWallEndpoint = useCallback((wallId: string, which: 'start' | 'end', point: Vec2) => {
    const next = planSetWallEndpoint(planRef.current, wallId, which, point);
    if (!next) return;
    planRef.current = next;
    setPlan(next);
  }, []);

  const previewWallMove = useCallback((wallId: string, delta: Vec2) => {
    // Deltas are absolute from the grab point: always apply to the drag-start
    // snapshot, otherwise repeated previews would compound the movement.
    const base = transientRef.current ?? planRef.current;
    const next = planMoveWall(base, wallId, delta);
    if (!next) return;
    planRef.current = next;
    setPlan(next);
  }, []);

  const previewOpeningT = useCallback((kind: 'door' | 'window', id: string, centerT: number) => {
    const next =
      kind === 'door'
        ? planMoveDoor(planRef.current, id, centerT)
        : planMoveWindow(planRef.current, id, centerT);
    if (!next) return;
    planRef.current = next;
    setPlan(next);
  }, []);

  const endTransient = useCallback((commit: boolean) => {
    const snapshot = transientRef.current;
    transientRef.current = null;
    if (!snapshot) return;
    if (commit) {
      pastRef.current = pushHistory(pastRef.current, snapshot, HISTORY_LIMIT);
      futureRef.current = [];
      setDirty(serializeFloorPlan(planRef.current) !== savedRef.current);
      setHistoryVersion((n) => n + 1);
    } else {
      planRef.current = snapshot;
      setPlan(snapshot);
      setDirty(serializeFloorPlan(snapshot) !== savedRef.current);
    }
  }, []);

  // --- Doors & windows -----------------------------------------------------

  const placeDoor = useCallback((wallId: string, centerT: number): Door | null => {
    const result = planAddDoor(planRef.current, wallId, centerT);
    if (!result) return null;
    commitPlan(result.plan);
    openingRef.current = { kind: 'door', id: result.door.id };
    setSelectedOpening({ kind: 'door', id: result.door.id });
    selectedRef.current = [];
    setSelectedIds([]);
    roomRef.current = null;
    setSelectedRoomId(null);
    return result.door;
  }, [commitPlan]);

  const placeWindow = useCallback((wallId: string, centerT: number): Window | null => {
    const result = planAddWindow(planRef.current, wallId, centerT);
    if (!result) return null;
    commitPlan(result.plan);
    openingRef.current = { kind: 'window', id: result.window.id };
    setSelectedOpening({ kind: 'window', id: result.window.id });
    selectedRef.current = [];
    setSelectedIds([]);
    roomRef.current = null;
    setSelectedRoomId(null);
    return result.window;
  }, [commitPlan]);

  const setDoorWidth = useCallback((doorId: string, width: number) => {
    const next = planSetDoorWidth(planRef.current, doorId, width);
    if (next) commitPlan(next);
  }, [commitPlan]);

  const setWindowWidth = useCallback((windowId: string, width: number) => {
    const next = planSetWindowWidth(planRef.current, windowId, width);
    if (next) commitPlan(next);
  }, [commitPlan]);

  const setDoorSwing = useCallback((doorId: string, swing: DoorSwing) => {
    const next = planSetDoorSwing(planRef.current, doorId, swing);
    if (next) commitPlan(next);
  }, [commitPlan]);

  // --- Rooms ---------------------------------------------------------------

  const renameRoom = useCallback((roomId: string, name: string) => {
    const next = planRenameRoom(planRef.current, roomId, name);
    if (next) commitPlan(next);
  }, [commitPlan]);

  // --- Phase 3: import / restore / dirty ------------------------------------

  const markSaved = useCallback(() => {
    savedRef.current = serializeFloorPlan(planRef.current);
    setDirty(false);
  }, []);

  const loadPlan = useCallback((next: FloorPlan, options?: { recordHistory?: boolean; markClean?: boolean }) => {
    const recordHistory = options?.recordHistory ?? true;
    if (recordHistory) {
      pastRef.current = pushHistory(pastRef.current, clonePlan(planRef.current), HISTORY_LIMIT);
      futureRef.current = [];
    }
    const loaded = withRooms(clonePlan(next), next.rooms);
    planRef.current = loaded;
    setPlan(loaded);
    if (options?.markClean) {
      savedRef.current = serializeFloorPlan(loaded);
      setDirty(false);
    } else {
      setDirty(serializeFloorPlan(loaded) !== savedRef.current);
    }
    setHistoryVersion((n) => n + 1);
    clearTransientSelection();
    pendingRef.current = null;
    setPendingStart(null);
  }, [clearTransientSelection]);

  const selectedWalls = useMemo(
    () => plan.walls.filter((wall) => selectedIds.includes(wall.id)),
    [plan.walls, selectedIds],
  );
  const selectedDoor = useMemo(
    () =>
      selectedOpening?.kind === 'door'
        ? (plan.doors.find((door) => door.id === selectedOpening.id) ?? null)
        : null,
    [plan.doors, selectedOpening],
  );
  const selectedWindow = useMemo(
    () =>
      selectedOpening?.kind === 'window'
        ? (plan.windows.find((window) => window.id === selectedOpening.id) ?? null)
        : null,
    [plan.windows, selectedOpening],
  );
  const selectedRoom = useMemo(
    () => (selectedRoomId ? (plan.rooms.find((room) => room.id === selectedRoomId) ?? null) : null),
    [plan.rooms, selectedRoomId],
  );
  const selection: Selection = useMemo(() => {
    if (selectedOpening) return { kind: selectedOpening.kind, id: selectedOpening.id };
    if (selectedRoomId) return { kind: 'room', id: selectedRoomId };
    const first = selectedIds[0];
    return first ? { kind: 'wall', id: first } : null;
  }, [selectedOpening, selectedRoomId, selectedIds]);

  void historyVersion;

  return {
    plan,
    walls: plan.walls,
    doors: plan.doors,
    windows: plan.windows,
    rooms: plan.rooms,
    selectedIds,
    selectedWalls,
    selection,
    selectedDoor,
    selectedWindow,
    selectedRoom,
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
    select,
    clearSelection,
    deleteSelected,
    applyThicknessToSelection,
    clearAll,
    undo,
    redo,
    setWallLengthM,
    beginTransient,
    previewWallEndpoint,
    previewWallMove,
    previewOpeningT,
    endTransient,
    placeDoor,
    placeWindow,
    setDoorWidth,
    setWindowWidth,
    setDoorSwing,
    renameRoom,
    dirty,
    loadPlan,
    markSaved,
  };
}
