'use client';

import { useCallback, useEffect, useRef, useState } from 'react';import Link from 'next/link';
import {
  AppWindow,
  BrickWall,
  DoorOpen,
  Download,
  Eraser,
  Maximize,
  MousePointer2,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import EditorCanvas, { type EditorCanvasHandle } from '@/components/floorplan-editor/editor-canvas';
import { wallLength, type Room, type Vec2 } from '@/lib/floorplan/model';
import { formatAreaM2, formatLengthM, parseLengthM, type SnapKind } from '@/lib/floorplan/geometry';
import { useFloorplanEditor, type EditorTool, type SelectionKind } from '@/lib/floorplan/use-floorplan-editor';
import { exportFileName, importFloorPlanJson, serializeFloorPlan } from '@/lib/floorplan/serialization';
import {
  clearStoredFloorPlan,
  restoreFloorPlan,
  saveFloorPlan,
} from '@/lib/floorplan/storage';
import type { FloorPlanIssue } from '@/lib/floorplan/validation';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Validation issue code → editor i18n key. Unknown codes fall back to a generic message. */
const ISSUE_I18N_KEYS: Record<string, string> = {
  'malformed-json': 'editor.importErrorMalformedJson',
  'unsupported-version': 'editor.importErrorUnsupportedVersion',
  'invalid-units': 'editor.importErrorInvalidUnits',
  'missing-field': 'editor.importErrorMissingField',
  'duplicate-id': 'editor.importErrorDuplicateId',
  'invalid-id': 'editor.importErrorInvalidId',
  'invalid-number': 'editor.importErrorInvalidNumber',
  'invalid-wall': 'editor.importErrorInvalidWall',
  'zero-length-wall': 'editor.importErrorZeroLengthWall',
  'invalid-thickness': 'editor.importErrorInvalidThickness',
  'invalid-door': 'editor.importErrorInvalidDoor',
  'invalid-window': 'editor.importErrorInvalidWindow',
  'invalid-wall-ref': 'editor.importErrorInvalidWallRef',
  'invalid-centerT': 'editor.importErrorInvalidCenterT',
  'invalid-width': 'editor.importErrorInvalidWidth',
  'invalid-swing': 'editor.importErrorInvalidSwing',
  'invalid-room': 'editor.importErrorInvalidRoom',
  'invalid-boundary': 'editor.importErrorInvalidBoundary',
  'invalid-area': 'editor.importErrorInvalidArea',
  'invalid-metadata': 'editor.importErrorInvalidMetadata',
  'invalid-plan': 'editor.importErrorInvalidPlan',
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

const DOOR_WIDTH_PRESETS = [0.625, 0.75, 0.875, 1.0];
const WINDOW_WIDTH_PRESETS = [0.8, 1.0, 1.2, 1.5, 2.0];

export default function FloorPlanEditorPage() {
  const { t } = useI18n();
  const editor = useFloorplanEditor();
  const {
    walls,
    rooms,
    doors,
    windows,
    selectedIds,
    selectedWalls,
    selection,
    selectedDoor,
    selectedWindow,
    selectedRoom,
    tool,
    pendingStart,
    thickness,
    canUndo,
    canRedo,
  } = editor;
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [zoomScale, setZoomScale] = useState(60);
  // Phase 3: persistence / import-export UI state (all strings via i18n).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);
  const [fitToken, setFitToken] = useState(0);
  const [notice, setNotice] = useState<{ kind: 'success' | 'warning'; textKey: string } | null>(null);
  const [importErrors, setImportErrors] = useState<FloorPlanIssue[] | null>(null);
  const { plan, dirty, loadPlan, markSaved } = editor;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const issueMessage = useCallback(
    (issue: FloorPlanIssue): string => {
      const key = ISSUE_I18N_KEYS[issue.code];
      if (key) return t(key);
      return t('editor.importErrorGeneric', { code: issue.code });
    },
    [t],
  );

  // Restore the persisted draft once. Invalid drafts are ignored with a
  // short notice; the editor always starts usable.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const result = restoreFloorPlan();
    if (result.status === 'ok') {
      loadPlan(result.plan, { recordHistory: false, markClean: true });
      if (result.plan.walls.length > 0) setFitToken((n) => n + 1);
    } else if (result.status === 'corrupt') {
      setNotice({ kind: 'warning', textKey: 'editor.corruptDraft' });
    }
  }, [loadPlan]);

  // Autosave the semantic plan (debounced). The dirty flag covers the
  // short gap between an edit and the persisted write.
  useEffect(() => {
    if (!restoredRef.current) return;
    const id = window.setTimeout(() => {
      if (saveFloorPlan(plan)) markSaved();
    }, 300);
    return () => window.clearTimeout(id);
  }, [plan, markSaved]);

  // Navigation warning only while edits are not yet persisted.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Fit the canvas after import/restore (post-render so geometry is current).
  useEffect(() => {
    if (fitToken > 0) canvasRef.current?.fitView();
  }, [fitToken]);

  const handleImportFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      const text = await file.text();
      const result = importFloorPlanJson(text);
      if (result.ok) {
        loadPlan(result.plan);
        setImportErrors(null);
        setNotice({ kind: 'success', textKey: 'editor.importSuccess' });
        if (result.plan.walls.length > 0) setFitToken((n) => n + 1);
      } else {
        // Keep the current plan untouched; show a concise localized error.
        setImportErrors(result.errors);
        setNotice(null);
      }
    },
    [loadPlan],
  );

  const handleExport = useCallback(() => {
    const json = serializeFloorPlan(plan);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFileName();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [plan]);

  const handleClear = useCallback(() => {
    if (window.confirm(t('editor.clearConfirm'))) {
      editor.clearAll();
      clearStoredFloorPlan();
      editor.markSaved();
      setImportErrors(null);
    }
  }, [editor, t]);

  const handleDrawClick = useCallback(
    (point: Vec2) => {
      editor.finishWallSegment(point);
    },
    [editor],
  );

  const handleSelect = useCallback(
    (kind: SelectionKind, id: string | null, additive: boolean) => {
      editor.select(kind, id, additive);
    },
    [editor],
  );

  const handlePlaceOpening = useCallback(
    (kind: 'door' | 'window', wallId: string, centerT: number) => {
      if (kind === 'door') editor.placeDoor(wallId, centerT);
      else editor.placeWindow(wallId, centerT);
    },
    [editor],
  );

  const handleWallLengthCommit = useCallback(
    (wallId: string, lengthM: number) => {
      editor.setWallLengthM(wallId, lengthM);
    },
    [editor],
  );

  const handleFinishChain = useCallback(() => {
    editor.cancelPending();
  }, [editor]);

  const handleViewChange = useCallback((scale: number) => {
    setZoomScale(scale);
  }, []);

  const snapLabel = useCallback(
    (kind: Exclude<SnapKind, null>) => {
      switch (kind) {
        case 'endpoint':
          return t('editor.snapEndpoint');
        case 'horizontal':
          return t('editor.snapHorizontal');
        case 'vertical':
          return t('editor.snapVertical');
        case 'angle':
          return t('editor.snapAngle');
      }
    },
    [t],
  );

  const formatRoomLabel = useCallback(
    (room: Room) => {
      if (room.name.trim()) return room.name;
      const index = rooms.findIndex((candidate) => candidate.id === room.id);
      return t('editor.roomDefault', { number: index + 1 });
    },
    [rooms, t],
  );

  const formatRoomArea = useCallback((room: Room) => formatAreaM2(room.areaM2), []);

  // Keyboard shortcuts: Delete/Backspace, Escape, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y,
  // V/W/D/F tool switch, Space temporary pan.
  const { pendingStart: pending, deleteSelected, cancelPending, clearSelection, setTool: setToolAction, undo, redo } = editor;
  const shortcutsRef = useRef({ deleteSelected, cancelPending, clearSelection, setToolAction, undo, redo, pending });
  shortcutsRef.current = { deleteSelected, cancelPending, clearSelection, setToolAction, undo, redo, pending };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const actions = shortcutsRef.current;
      const mod = event.ctrlKey || event.metaKey;
      if (event.code === 'Space' && !isEditableTarget(event.target) && !event.repeat) {
        event.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        actions.redo();
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        actions.deleteSelected();
      } else if (event.key === 'Escape') {
        if (actions.pending) actions.cancelPending();
        else actions.clearSelection();
      } else if (event.key.toLowerCase() === 'v') {
        actions.setToolAction('select');
      } else if (event.key.toLowerCase() === 'w') {
        actions.setToolAction('wall');
      } else if (event.key.toLowerCase() === 'd') {
        actions.setToolAction('door');
      } else if (event.key.toLowerCase() === 'f') {
        actions.setToolAction('window');
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false);
    };
    const onBlur = () => setSpaceDown(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const totalLength = walls.reduce((sum, wall) => sum + wallLength(wall), 0);
  const firstSelected = selectedWalls[0] ?? null;
  const hasSelection = selectedIds.length > 0 || selectedDoor !== null || selectedWindow !== null || selectedRoom !== null;
  const isPlanEmpty = walls.length === 0 && doors.length === 0 && windows.length === 0;

  const setTool = (next: EditorTool) => editor.setTool(next);

  const toolHint = pendingStart
    ? t('editor.pendingHint')
    : tool === 'door'
      ? t('editor.doorHint')
      : tool === 'window'
        ? t('editor.windowHint')
        : t('editor.drawingHint');

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-none flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <VistaLogoLink href="/" />
          <span className="ml-2 hidden text-xs font-medium text-muted-foreground sm:inline">
            {t('editor.badge')}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('editor.importPlanHint')}
              title={t('editor.importPlanHint')}
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <Upload />
              <span className="hidden sm:inline">{t('editor.importPlan')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('editor.exportPlanHint')}
              title={t('editor.exportPlanHint')}
              disabled={isPlanEmpty}
              onClick={handleExport}
              className="gap-1.5"
            >
              <Download />
              <span className="hidden sm:inline">{t('editor.exportPlan')}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                void handleImportFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <Separator orientation="vertical" className="mx-1 h-5" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.undo')}
              title={t('editor.undo')}
              disabled={!canUndo}
              onClick={editor.undo}
            >
              <Undo2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.redo')}
              title={t('editor.redo')}
              disabled={!canRedo}
              onClick={editor.redo}
            >
              <Redo2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.zoomOut')}
              title={t('editor.zoomOut')}
              onClick={() => canvasRef.current?.zoomOut()}
            >
              <ZoomOut />
            </Button>
            <span className="w-12 text-center text-xs font-semibold text-muted-foreground">
              {Math.round(zoomScale)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.zoomIn')}
              title={t('editor.zoomIn')}
              onClick={() => canvasRef.current?.zoomIn()}
            >
              <ZoomIn />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.fitView')}
              title={t('editor.fitView')}
              onClick={() => canvasRef.current?.fitView()}
            >
              <Maximize />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.resetView')}
              title={t('editor.resetView')}
              onClick={() => canvasRef.current?.resetView()}
            >
              <RotateCcw />
            </Button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="border-b bg-muted/30">
        <div className="mx-auto flex max-w-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs text-muted-foreground sm:px-6">
          <span className="font-semibold text-foreground">{t('editor.title')}</span>
          <span
            className="inline-flex items-center gap-1.5"
            role="status"
            aria-live="polite"
            title={dirty ? t('editor.unsavedChanges') : t('editor.savedState')}
          >
            <span
              className={cn(
                'inline-block size-1.5 rounded-full',
                dirty ? 'bg-amber-500' : 'bg-emerald-500',
              )}
            />
            {dirty ? t('editor.unsavedChanges') : t('editor.savedState')}
          </span>
          <span className="hidden md:inline">{toolHint}</span>
          <span className="ml-auto hidden lg:inline">{t('editor.panHint')}</span>
        </div>
        {notice && (
          <div className="mx-auto flex max-w-none items-center gap-2 px-4 pb-2 sm:px-6">
            <p
              role="status"
              className={cn(
                'flex-1 rounded-lg border px-3 py-1.5 text-xs',
                notice.kind === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
              )}
            >
              {t(notice.textKey)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('common.close')}
              onClick={() => setNotice(null)}
            >
              <X />
            </Button>
          </div>
        )}
        {importErrors && (
          <div className="mx-auto flex max-w-none items-start gap-2 px-4 pb-2 sm:px-6">
            <div
              role="alert"
              className="flex-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive"
            >
              <p className="font-semibold">{t('editor.importFailed')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {importErrors.slice(0, 3).map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issueMessage(issue)}</li>
                ))}
              </ul>
              {importErrors.length > 3 && (
                <p className="mt-1 text-muted-foreground">
                  {t('editor.importErrorMore', { count: importErrors.length - 3 })}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('common.close')}
              onClick={() => setImportErrors(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left drawing toolbar */}
        <aside
          aria-label={t('editor.title')}
          className="flex flex-row items-center gap-2 border-b bg-card px-4 py-2 lg:w-20 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:px-3 lg:py-4"
        >
          <Button
            type="button"
            variant={tool === 'select' ? 'default' : 'outline'}
            size="lg"
            title={t('editor.selectToolHint')}
            aria-pressed={tool === 'select'}
            onClick={() => setTool('select')}
            className={cn('flex-1 lg:flex-none lg:flex-col lg:gap-1 lg:py-3')}
          >
            <MousePointer2 />
            <span className="text-xs">{t('editor.selectTool')}</span>
          </Button>
          <Button
            type="button"
            variant={tool === 'wall' ? 'default' : 'outline'}
            size="lg"
            title={t('editor.wallToolHint')}
            aria-pressed={tool === 'wall'}
            onClick={() => setTool('wall')}
            className={cn('flex-1 lg:flex-none lg:flex-col lg:gap-1 lg:py-3')}
          >
            <BrickWall />
            <span className="text-xs">{t('editor.wallTool')}</span>
          </Button>
          <Button
            type="button"
            variant={tool === 'door' ? 'default' : 'outline'}
            size="lg"
            title={t('editor.doorToolHint')}
            aria-pressed={tool === 'door'}
            onClick={() => setTool('door')}
            className={cn('flex-1 lg:flex-none lg:flex-col lg:gap-1 lg:py-3')}
          >
            <DoorOpen />
            <span className="text-xs">{t('editor.doorTool')}</span>
          </Button>
          <Button
            type="button"
            variant={tool === 'window' ? 'default' : 'outline'}
            size="lg"
            title={t('editor.windowToolHint')}
            aria-pressed={tool === 'window'}
            onClick={() => setTool('window')}
            className={cn('flex-1 lg:flex-none lg:flex-col lg:gap-1 lg:py-3')}
          >
            <AppWindow />
            <span className="text-xs">{t('editor.windowTool')}</span>
          </Button>
          <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:mt-2 lg:flex-col">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.deleteSelected')}
              title={t('editor.deleteSelected')}
              disabled={!hasSelection}
              onClick={editor.deleteSelected}
            >
              <Trash2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.clearAll')}
              title={t('editor.clearAll')}
              disabled={isPlanEmpty}
              onClick={handleClear}
            >
              <Eraser />
            </Button>
          </div>
          <p className="ml-auto hidden text-xs text-muted-foreground lg:mt-auto lg:block lg:text-center">
            {t(walls.length === 1 ? 'editor.wallsCountOne' : 'editor.wallsCount', {
              count: walls.length,
            })}
            <br />
            {t(rooms.length === 1 ? 'editor.roomsCountOne' : 'editor.roomsCount', {
              count: rooms.length,
            })}
          </p>
        </aside>

        {/* Central canvas */}
        <section className="relative min-h-[55vh] flex-1 lg:min-h-0">
          <EditorCanvas
            ref={canvasRef}
            walls={walls}
            rooms={rooms}
            doors={doors}
            windows={windows}
            selectedIds={selectedIds}
            selectedOpening={
              selectedDoor
                ? { kind: 'door', id: selectedDoor.id }
                : selectedWindow
                  ? { kind: 'window', id: selectedWindow.id }
                  : null
            }
            selectedRoomId={selectedRoom?.id ?? null}
            tool={tool}
            pendingStart={pendingStart}
            spacePanActive={spaceDown}
            snapLabel={snapLabel}
            canvasAriaLabel={t('editor.canvasAria')}
            formatRoomLabel={formatRoomLabel}
            formatRoomArea={formatRoomArea}
            dimensionEditTitle={t('editor.dimensionEditTitle')}
            onDrawClick={handleDrawClick}
            onSelect={handleSelect}
            onFinishChain={handleFinishChain}
            onViewChange={handleViewChange}
            onPlaceOpening={handlePlaceOpening}
            onWallLengthCommit={handleWallLengthCommit}
            onBeginTransient={editor.beginTransient}
            onPreviewWallEndpoint={editor.previewWallEndpoint}
            onPreviewWallMove={editor.previewWallMove}
            onPreviewOpeningT={editor.previewOpeningT}
            onEndTransient={editor.endTransient}
          />
          {isPlanEmpty && !pendingStart && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
              <p className="max-w-md rounded-lg border bg-background/95 px-4 py-2 text-center text-xs text-muted-foreground shadow-sm">
                {t('editor.emptyPlan')}
              </p>
            </div>
          )}
        </section>

        {/* Minimal properties area */}
        <aside className="w-full shrink-0 border-t bg-card px-4 py-4 lg:w-72 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <SelectionPanel
              selectionKind={selection?.kind ?? null}
              firstSelected={firstSelected}
              selectedCount={selectedIds.length}
              selectedCountLabel={t('editor.selectedCount', { count: selectedIds.length })}
              totalLengthLabel={t('editor.totalLength', { value: formatLengthM(totalLength) })}
              noSelectionLabel={t('editor.noSelection')}
              selectedWallLabel={t('editor.selectedWall')}
              wallLengthLabel={t('editor.wallLength')}
              wallLengthEditLabel={t('editor.wallLengthEdit')}
              wallThicknessLabel={t('editor.wallThickness')}
              thicknessUnitLabel={(value: string) => t('editor.thicknessUnit', { value })}
              attachedLabel={(count: number) =>
                t(count === 1 ? 'editor.attachedOpeningsOne' : 'editor.attachedOpenings', { count })
              }
              selectedDoor={selectedDoor}
              selectedDoorLabel={t('editor.selectedDoor')}
              hostWallLabel={t('editor.hostWall')}
              openingWidthLabel={t('editor.openingWidth')}
              widthUnitLabel={(value: string) => t('editor.widthUnit', { value })}
              doorSwingLabel={t('editor.doorSwing')}
              swingLeftLabel={t('editor.swingLeft')}
              swingRightLabel={t('editor.swingRight')}
              selectedWindow={selectedWindow}
              selectedWindowLabel={t('editor.selectedWindow')}
              selectedRoom={selectedRoom}
              selectedRoomLabel={t('editor.selectedRoom')}
              roomNameLabel={t('editor.roomName')}
              roomNamePlaceholder={t('editor.roomNamePlaceholder')}
              roomAreaLabel={t('editor.roomArea')}
              walls={walls}
              doors={doors}
              windows={windows}
              formatRoomLabel={formatRoomLabel}
              onWallLengthCommit={handleWallLengthCommit}
              onDoorWidth={(id, width) => editor.setDoorWidth(id, width)}
              onWindowWidth={(id, width) => editor.setWindowWidth(id, width)}
              onDoorSwing={(id, swing) => editor.setDoorSwing(id, swing)}
              onRenameRoom={(id, name) => editor.renameRoom(id, name)}
            />

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="wall-thickness">{t('editor.wallThickness')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="wall-thickness"
                  type="number"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={thickness}
                  onChange={(event) => editor.setThickness(Number(event.target.value))}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">m</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[0.115, 0.15, 0.2, 0.24, 0.3].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant={Math.abs(thickness - preset) < 1e-9 ? 'default' : 'outline'}
                    size="xs"
                    onClick={() => editor.setThickness(preset)}
                  >
                    {preset.toFixed(3).replace(/0$/, '')}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectedIds.length === 0}
                onClick={editor.applyThicknessToSelection}
              >
                {t('editor.applyThickness')}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={!hasSelection}
                onClick={editor.deleteSelected}
              >
                <Trash2 /> {t('editor.deleteSelected')}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t('editor.totalLength', { value: formatLengthM(totalLength) })}
              </p>
            </div>

            <Separator />

            <div className="space-y-1 text-xs text-muted-foreground">
              <h3 className="text-xs font-semibold text-foreground">
                {t('editor.shortcutsTitle')}
              </h3>
              <p>Del — {t('editor.shortcutDelete')}</p>
              <p>Esc — {t('editor.shortcutCancel')}</p>
              <p>Ctrl/⌘ Z — {t('editor.shortcutUndo')}</p>
              <p>Ctrl/⌘ ⇧ Z — {t('editor.shortcutRedo')}</p>
              <p>Space — {t('editor.shortcutPan')}</p>
              <p>
                V / W / D / F — {t('editor.selectTool')} / {t('editor.wallTool')} /{' '}
                {t('editor.doorTool')} / {t('editor.windowTool')}
              </p>
            </div>

            <Button variant="link" size="sm" asChild className="px-0">
              <Link href="/">{t('common.back')}</Link>
            </Button>
          </div>
        </aside>
      </div>
    </main>
  );
}

type SelectionPanelProps = {
  selectionKind: SelectionKind | null;
  firstSelected: { id: string; start: Vec2; end: Vec2; thickness: number } | null;
  selectedCount: number;
  selectedCountLabel: string;
  totalLengthLabel: string;
  noSelectionLabel: string;
  selectedWallLabel: string;
  wallLengthLabel: string;
  wallLengthEditLabel: string;
  wallThicknessLabel: string;
  thicknessUnitLabel: (value: string) => string;
  attachedLabel: (count: number) => string;
  selectedDoor: { id: string; wallId: string; width: number; swing: 'left' | 'right' } | null;
  selectedDoorLabel: string;
  hostWallLabel: string;
  openingWidthLabel: string;
  widthUnitLabel: (value: string) => string;
  doorSwingLabel: string;
  swingLeftLabel: string;
  swingRightLabel: string;
  selectedWindow: { id: string; wallId: string; width: number } | null;
  selectedWindowLabel: string;
  selectedRoom: Room | null;
  selectedRoomLabel: string;
  roomNameLabel: string;
  roomNamePlaceholder: string;
  roomAreaLabel: string;
  walls: { id: string; start: Vec2; end: Vec2 }[];
  doors: { id: string; wallId: string }[];
  windows: { id: string; wallId: string }[];
  formatRoomLabel: (room: Room) => string;
  onWallLengthCommit: (wallId: string, lengthM: number) => void;
  onDoorWidth: (id: string, width: number) => void;
  onWindowWidth: (id: string, width: number) => void;
  onDoorSwing: (id: string, swing: 'left' | 'right') => void;
  onRenameRoom: (id: string, name: string) => void;
};

function SelectionPanel(props: SelectionPanelProps) {
  const {
    selectionKind,
    firstSelected,
    selectedDoor,
    selectedWindow,
    selectedRoom,
    walls,
    doors,
    windows,
  } = props;

  if (selectionKind === 'door' && selectedDoor) {
    const host = walls.find((wall) => wall.id === selectedDoor.wallId);
    const hostLength = host
      ? Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y)
      : null;
    return (
      <div>
        <h2 className="text-sm font-semibold">{props.selectedDoorLabel}</h2>
        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>{props.hostWallLabel}</dt>
            <dd className="font-semibold text-foreground">
              {hostLength === null ? '—' : formatLengthM(hostLength)}
            </dd>
          </div>
        </dl>
        <div className="mt-3 space-y-2">
          <Label htmlFor="door-width">{props.openingWidthLabel}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="door-width"
              type="number"
              min={0.4}
              max={3}
              step={0.01}
              value={selectedDoor.width.toFixed(2)}
              onChange={(event) => {
                const parsed = parseLengthM(event.target.value);
                if (parsed !== null) props.onDoorWidth(selectedDoor.id, parsed);
              }}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {DOOR_WIDTH_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={Math.abs(selectedDoor.width - preset) < 1e-9 ? 'default' : 'outline'}
                size="xs"
                onClick={() => props.onDoorWidth(selectedDoor.id, preset)}
              >
                {preset.toFixed(3).replace(/0$/, '')}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Label>{props.doorSwingLabel}</Label>
          <div className="flex gap-1">
            {(['left', 'right'] as const).map((swing) => (
              <Button
                key={swing}
                type="button"
                variant={selectedDoor.swing === swing ? 'default' : 'outline'}
                size="xs"
                onClick={() => props.onDoorSwing(selectedDoor.id, swing)}
              >
                {swing === 'left' ? props.swingLeftLabel : props.swingRightLabel}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selectionKind === 'window' && selectedWindow) {
    const host = walls.find((wall) => wall.id === selectedWindow.wallId);
    const hostLength = host
      ? Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y)
      : null;
    return (
      <div>
        <h2 className="text-sm font-semibold">{props.selectedWindowLabel}</h2>
        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>{props.hostWallLabel}</dt>
            <dd className="font-semibold text-foreground">
              {hostLength === null ? '—' : formatLengthM(hostLength)}
            </dd>
          </div>
        </dl>
        <div className="mt-3 space-y-2">
          <Label htmlFor="window-width">{props.openingWidthLabel}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="window-width"
              type="number"
              min={0.4}
              max={3}
              step={0.01}
              value={selectedWindow.width.toFixed(2)}
              onChange={(event) => {
                const parsed = parseLengthM(event.target.value);
                if (parsed !== null) props.onWindowWidth(selectedWindow.id, parsed);
              }}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {WINDOW_WIDTH_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={Math.abs(selectedWindow.width - preset) < 1e-9 ? 'default' : 'outline'}
                size="xs"
                onClick={() => props.onWindowWidth(selectedWindow.id, preset)}
              >
                {preset.toFixed(3).replace(/0$/, '')}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selectionKind === 'room' && selectedRoom) {
    return (
      <div>
        <h2 className="text-sm font-semibold">{props.selectedRoomLabel}</h2>
        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>{props.roomAreaLabel}</dt>
            <dd className="font-semibold text-foreground">{formatAreaM2(selectedRoom.areaM2)}</dd>
          </div>
        </dl>
        <div className="mt-3 space-y-2">
          <Label htmlFor="room-name">{props.roomNameLabel}</Label>
          <RoomNameInput
            key={selectedRoom.id}
            roomId={selectedRoom.id}
            initialName={selectedRoom.name}
            placeholder={props.roomNamePlaceholder}
            fallbackLabel={props.formatRoomLabel(selectedRoom)}
            onRename={props.onRenameRoom}
          />
        </div>
      </div>
    );
  }

  if (firstSelected) {
    const attachedCount =
      doors.filter((door) => door.wallId === firstSelected.id).length +
      windows.filter((window) => window.wallId === firstSelected.id).length;
    return (
      <div>
        <h2 className="text-sm font-semibold">{props.selectedWallLabel}</h2>
        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>{props.wallLengthLabel}</dt>
            <dd className="font-semibold text-foreground">
              {formatLengthM(
                Math.hypot(
                  firstSelected.end.x - firstSelected.start.x,
                  firstSelected.end.y - firstSelected.start.y,
                ),
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{props.wallThicknessLabel}</dt>
            <dd className="font-semibold text-foreground">
              {props.thicknessUnitLabel(firstSelected.thickness.toFixed(2))}
            </dd>
          </div>
          {attachedCount > 0 && (
            <div className="flex justify-between gap-2">
              <dt>{props.attachedLabel(attachedCount)}</dt>
              <dd className="font-semibold text-foreground">{attachedCount}</dd>
            </div>
          )}
          {props.selectedCount > 1 && (
            <div className="flex justify-between gap-2">
              <dt>{props.selectedCountLabel}</dt>
              <dd className="font-semibold text-foreground">{props.totalLengthLabel}</dd>
            </div>
          )}
        </dl>
        <WallLengthInput
          key={firstSelected.id}
          wallId={firstSelected.id}
          lengthM={Math.hypot(
            firstSelected.end.x - firstSelected.start.x,
            firstSelected.end.y - firstSelected.start.y,
          )}
          label={props.wallLengthEditLabel}
          onCommit={props.onWallLengthCommit}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold">{props.selectedWallLabel}</h2>
      <p className="mt-2 text-xs text-muted-foreground">{props.noSelectionLabel}</p>
    </div>
  );
}

function WallLengthInput({
  wallId,
  lengthM,
  label,
  onCommit,
}: {
  wallId: string;
  lengthM: number;
  label: string;
  onCommit: (wallId: string, lengthM: number) => void;
}) {
  const [draft, setDraft] = useState(lengthM.toFixed(2));
  const [focused, setFocused] = useState(false);
  // Keep the field in sync with live geometry (e.g. endpoint drags) unless
  // the user is actively editing.
  useEffect(() => {
    if (!focused) setDraft(lengthM.toFixed(2));
  }, [lengthM, focused]);
  return (
    <div className="mt-3 space-y-2">
      <Label htmlFor={`wall-length-${wallId}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`wall-length-${wallId}`}
          type="number"
          min={0.05}
          step={0.01}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const parsed = parseLengthM(draft);
            if (parsed !== null && parsed >= 0.05) onCommit(wallId, parsed);
            else setDraft(lengthM.toFixed(2));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const parsed = parseLengthM(draft);
              if (parsed !== null && parsed >= 0.05) onCommit(wallId, parsed);
              else setDraft(lengthM.toFixed(2));
              (event.target as HTMLInputElement).blur();
            }
          }}
          className="w-24"
        />
        <span className="text-xs text-muted-foreground">m</span>
      </div>
    </div>
  );
}

function RoomNameInput({
  roomId,
  initialName,
  placeholder,
  fallbackLabel,
  onRename,
}: {
  roomId: string;
  initialName: string;
  placeholder: string;
  fallbackLabel: string;
  onRename: (id: string, name: string) => void;
}) {
  const [draft, setDraft] = useState(initialName);
  return (
    <Input
      id="room-name"
      type="text"
      value={draft}
      placeholder={fallbackLabel || placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== initialName) onRename(roomId, draft.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          if (draft !== initialName) onRename(roomId, draft.trim());
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
