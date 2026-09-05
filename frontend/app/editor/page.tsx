'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BrickWall,
  Eraser,
  Maximize,
  MousePointer2,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
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
import { wallLength, type Vec2 } from '@/lib/floorplan/model';
import { formatLengthM, type SnapKind } from '@/lib/floorplan/geometry';
import { useFloorplanEditor, type EditorTool } from '@/lib/floorplan/use-floorplan-editor';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

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

export default function FloorPlanEditorPage() {
  const { t } = useI18n();
  const editor = useFloorplanEditor();
  const {
    walls,
    selectedIds,
    selectedWalls,
    tool,
    pendingStart,
    thickness,
    canUndo,
    canRedo,
  } = editor;
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [zoomScale, setZoomScale] = useState(60);

  const handleDrawClick = useCallback(
    (point: Vec2) => {
      editor.finishWallSegment(point);
    },
    [editor],
  );

  const handleSelectWall = useCallback(
    (id: string | null, additive: boolean) => {
      editor.selectWall(id, additive);
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

  // Keyboard shortcuts: Delete/Backspace, Escape, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y,
  // V/W tool switch, Space temporary pan.
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

  const setTool = (next: EditorTool) => editor.setTool(next);

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
          <span className="hidden md:inline">
            {pendingStart ? t('editor.pendingHint') : t('editor.drawingHint')}
          </span>
          <span className="ml-auto hidden lg:inline">{t('editor.panHint')}</span>
        </div>
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
          <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:mt-2 lg:flex-col">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('editor.deleteSelected')}
              title={t('editor.deleteSelected')}
              disabled={selectedIds.length === 0}
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
              disabled={walls.length === 0}
              onClick={() => {
                if (window.confirm(t('editor.clearConfirm'))) editor.clearAll();
              }}
            >
              <Eraser />
            </Button>
          </div>
          <p className="ml-auto hidden text-xs text-muted-foreground lg:mt-auto lg:block lg:text-center">
            {t(walls.length === 1 ? 'editor.wallsCountOne' : 'editor.wallsCount', {
              count: walls.length,
            })}
          </p>
        </aside>

        {/* Central canvas */}
        <section className="relative min-h-[55vh] flex-1 lg:min-h-0">
          <EditorCanvas
            ref={canvasRef}
            walls={walls}
            selectedIds={selectedIds}
            tool={tool}
            pendingStart={pendingStart}
            spacePanActive={spaceDown}
            snapLabel={snapLabel}
            canvasAriaLabel={t('editor.canvasAria')}
            onDrawClick={handleDrawClick}
            onSelectWall={handleSelectWall}
            onFinishChain={handleFinishChain}
            onViewChange={handleViewChange}
          />
          {walls.length === 0 && !pendingStart && (
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
            <div>
              <h2 className="text-sm font-semibold">{t('editor.selectedWall')}</h2>
              {firstSelected ? (
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <dt>{t('editor.wallLength')}</dt>
                    <dd className="font-semibold text-foreground">
                      {formatLengthM(wallLength(firstSelected))}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>{t('editor.wallThickness')}</dt>
                    <dd className="font-semibold text-foreground">
                      {t('editor.thicknessUnit', {
                        value: firstSelected.thickness.toFixed(2),
                      })}
                    </dd>
                  </div>
                  {selectedIds.length > 1 && (
                    <div className="flex justify-between gap-2">
                      <dt>{t('editor.selectedCount', { count: selectedIds.length })}</dt>
                      <dd className="font-semibold text-foreground">
                        {t('editor.totalLength', { value: formatLengthM(totalLength) })}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{t('editor.noSelection')}</p>
              )}
            </div>

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
                disabled={selectedIds.length === 0}
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
              <p>V / W — {t('editor.selectTool')} / {t('editor.wallTool')}</p>
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
