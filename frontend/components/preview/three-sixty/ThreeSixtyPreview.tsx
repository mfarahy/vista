'use client';

import { useEffect, useRef, useState } from 'react';
import { Orbit } from 'lucide-react';
import 'pannellum/build/pannellum.css';
import { panoramaById } from './panoramas';
import {
  FADE_TRANSITION_MS,
  buildScenesConfig,
  navigateToPanorama,
  type PannellumViewer,
} from './spatialNavigation';
import { attachWindowOverlay } from './windowOverlay';
import { WINDOWS } from './floorplan';
import { windowWidthValue } from './windowGeometry';
import { useI18n } from '@/lib/i18n';
import { PreviewNav } from '@/components/preview/preview-nav';
import { LanguageSwitcher } from '@/components/language-switcher';
import './styles.css';

type ViewerHandle = PannellumViewer & {
  on: (event: 'load', handler: () => void) => void;
  off: (event: 'load', handler: () => void) => void;
  getScene: () => string;
  destroy: () => void;
};

function roomLabelKey(id: string): string {
  return `viewers.threeSixty.rooms.${id}`;
}

const PANNELLUM_SCRIPT_URL = '/vista-360/pannellum.js';
const PANNELLUM_SCRIPT_DATA = 'data-vista-pannellum';

function loadPannellumScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.pannellum) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[${PANNELLUM_SCRIPT_DATA}='true']`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Pannellum')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = PANNELLUM_SCRIPT_URL;
    script.setAttribute(PANNELLUM_SCRIPT_DATA, 'true');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Pannellum'));
    document.head.appendChild(script);
  });
}

export function ThreeSixtyPreview() {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  // Tracks which scene the viewer should (re)mount on; kept out of the
  // effect's dependency array so in-viewer arrow navigation (which also
  // updates it) doesn't tear down and recreate the Pannellum viewer.
  const initialSceneRef = useRef('living-room');
  const [currentLabel, setCurrentLabel] = useState(() =>
    t(roomLabelKey('living-room')),
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: ViewerHandle | undefined;
    let overlayCleanup: (() => void) | undefined;
    let handleSceneLoad: (() => void) | undefined;
    let disposed = false;

    async function init() {
      // Pannellum's UMD build attaches itself to `window.pannellum` as a side
      // effect; load it client-side only so SSR never touches `window`.
      try {
        await loadPannellumScript();
      } catch {
        return;
      }
      if (disposed || !containerRef.current) return;

      const pannellum = window.pannellum as
        | { viewer: (container: HTMLElement, config: unknown) => ViewerHandle }
        | undefined;
      if (!pannellum) return;

      const scenes = buildScenesConfig(
        (link) => {
          if (viewer) navigateToPanorama(viewer, link);
        },
        (id) => t(roomLabelKey(id)),
      );

      viewer = pannellum.viewer(containerRef.current, {
        type: 'equirectangular',
        firstScene: initialSceneRef.current,
        scenes,
        autoLoad: true,
        // Simple cross-fade transition between panoramas.
        sceneFadeDuration: FADE_TRANSITION_MS,
        // Interaction: drag to look around, wheel + pinch to zoom.
        mouseZoom: true,
        keyboardZoom: true,
        // Keep the UI minimal: hide the built-in toolbar and compass.
        showControls: false,
        compass: false,
        tooltip: false,
      });

      const handleSceneLoadInner = () => {
        const sceneId = viewer?.getScene();
        const pano = sceneId ? panoramaById(sceneId) : undefined;
        setCurrentLabel(pano ? t(roomLabelKey(pano.id)) : sceneId ?? '');
        if (sceneId) initialSceneRef.current = sceneId;

        // Geometry-based window overlay: attaches for any panorama that owns
        // a floor-plan window (currently living room only). Navigation
        // arrows are created by Pannellum from the scene config.
        if (overlayCleanup) {
          overlayCleanup();
          overlayCleanup = undefined;
        }
        if (sceneId && containerRef.current) {
          const win = WINDOWS.find((w) => w.roomId === sceneId);
          if (win) {
            overlayCleanup = attachWindowOverlay(viewer!, containerRef.current, sceneId, {
              widthLabel: t('viewers.threeSixty.windowWidth', {
                width: windowWidthValue(win),
              }),
            });
          }
        }
      };
      handleSceneLoad = handleSceneLoadInner;
      viewer.on('load', handleSceneLoadInner);
    }

    void init();

    return () => {
      disposed = true;
      if (overlayCleanup) overlayCleanup();
      if (viewer) {
        if (handleSceneLoad) viewer.off('load', handleSceneLoad);
        viewer.destroy();
      }
    };
  }, [t]);

  return (
    <div className="vista-360-preview">
      <div
        ref={containerRef}
        className="vista-360-preview__viewport"
        role="region"
        aria-label={t('viewers.threeSixty.viewerAriaLabel')}
      />

      <div className="vista-360-preview__topbar">
        <span className="vista-360-preview__badge">
          <Orbit className="size-3.5" aria-hidden /> {t('viewers.threeSixty.badge')}
        </span>
        <PreviewNav current="360" />
        <LanguageSwitcher />
      </div>

      <h1 className="vista-360-preview__title">
        {t('viewers.threeSixty.roomPattern', { room: currentLabel })}
      </h1>
    </div>
  );
}