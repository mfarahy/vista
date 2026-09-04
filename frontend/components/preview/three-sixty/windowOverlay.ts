// 360 viewer preview — geometry-based window overlay.
// Typed port of the former standalone prototype's `windowOverlay.js`.
//
// Projects the floor-plan window's world-space corners into the current
// panorama view and draws a minimal SVG outline + measurement label above
// the Pannellum viewer. Position is fully derived from spatial geometry
// (camera position, orientation, viewer yaw/pitch/hfov) — never a fixed
// screen position or fixed yaw.
//
// Visibility: hidden/faded when the window leaves the view (any corner
// behind the camera or no corner near the viewport). Seam-safe because the
// projection works on direction vectors (sin/cos of the yaw delta).
//
// NOTE: the measurement label is passed in already localized (via
// `viewers.threeSixty.windowWidth`); this module builds no user-facing
// strings itself. The `?debug` readout is a developer-only aid.

import { EYE_HEIGHT_M, floorPlanToWorld3D } from './coordinates';
import { panoramaById } from './panoramas';
import { WINDOWS } from './floorplan';
import { windowWorldCorners } from './windowGeometry';
import {
  isWindowVisible,
  projectWindowCorners,
  worldPointToYawPitch,
} from './panoramaProjection';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type OverlayViewer = {
  getYaw: () => number;
  getPitch: () => number;
  getHfov: () => number;
};

export type WindowOverlayOptions = {
  /** Localized measurement label, e.g. `t('viewers.threeSixty.windowWidth', …)` */
  widthLabel: string;
};

export function isWindowDebugMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('debug') || params.has('window-debug');
  } catch {
    return false;
  }
}

function createOverlaySvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'vista-360-preview__window-overlay');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '5';
  svg.style.overflow = 'hidden';

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'vista-360-preview__window-overlay-group');
  group.style.transition = 'opacity 180ms ease';
  group.style.opacity = '0';

  const polygon = document.createElementNS(SVG_NS, 'polygon');
  polygon.setAttribute('class', 'vista-360-preview__window-overlay-shape');
  group.appendChild(polygon);

  const labelBg = document.createElementNS(SVG_NS, 'rect');
  labelBg.setAttribute('class', 'vista-360-preview__window-overlay-label-bg');
  labelBg.setAttribute('rx', '10');
  labelBg.setAttribute('ry', '10');
  group.appendChild(labelBg);

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('class', 'vista-360-preview__window-overlay-label');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dominant-baseline', 'middle');
  group.appendChild(label);

  svg.appendChild(group);
  return { svg, group, polygon, label, labelBg };
}

function createDebugPanel(): HTMLDivElement {
  const div = document.createElement('div');
  div.setAttribute('class', 'vista-360-preview__window-overlay-debug');
  div.style.position = 'absolute';
  div.style.left = '12px';
  div.style.bottom = '12px';
  div.style.zIndex = '6';
  div.style.maxWidth = '360px';
  div.style.padding = '8px 10px';
  div.style.borderRadius = '6px';
  div.style.background = 'rgba(0,0,0,0.72)';
  div.style.color = '#fff';
  div.style.fontFamily = 'ui-monospace, monospace';
  div.style.fontSize = '11px';
  div.style.lineHeight = '1.5';
  div.style.whiteSpace = 'pre-wrap';
  div.style.pointerEvents = 'none';
  return div;
}

/**
 * Attaches the geometry-based window overlay for `panoramaId`.
 * Returns a cleanup function. If the panorama has no window, no SVG is
 * shown (still returns a no-op cleanup).
 */
export function attachWindowOverlay(
  viewer: OverlayViewer,
  container: HTMLElement,
  panoramaId: string,
  options: WindowOverlayOptions,
): () => void {
  const pano = panoramaById(panoramaId);
  const win = WINDOWS.find((w) => w.roomId === panoramaId);
  if (!pano || !win) return () => {};

  const cameraPos = floorPlanToWorld3D(pano.position, EYE_HEIGHT_M);
  const corners = windowWorldCorners(win);
  const debug = isWindowDebugMode();

  const { svg, group, polygon, label, labelBg } = createOverlaySvg();
  container.appendChild(svg);
  label.textContent = options.widthLabel;

  let debugPanel: HTMLDivElement | null = null;
  if (debug) {
    debugPanel = createDebugPanel();
    container.appendChild(debugPanel);
  }

  // Ensure the overlay container can position children.
  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = 'relative';

  let canvas: HTMLCanvasElement | null = container.querySelector('canvas');
  let rafId = 0;

  const update = () => {
    rafId = requestAnimationFrame(update);
    if (!canvas) {
      canvas = container.querySelector('canvas');
      if (!canvas) return;
    }
    const width = container.clientWidth || canvas.clientWidth;
    const height = container.clientHeight || canvas.clientHeight;
    if (!width || !height) return;
    if (svg.getAttribute('width') !== String(width)) {
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
    }

    const view = {
      yaw: viewer.getYaw(),
      pitch: viewer.getPitch(),
      hfov: viewer.getHfov(),
      width,
      height,
    };
    const projected = projectWindowCorners(corners, cameraPos, pano.orientation, view);
    const anyBehind = projected.some((p) => p.behind);
    const visible = !anyBehind && isWindowVisible(projected, width, height);

    group.style.opacity = visible ? '1' : '0';
    if (!visible) {
      if (debugPanel) {
        debugPanel.textContent =
          `window ${win.id}\n` +
          `camera pos ${cameraPos.x.toFixed(2)}, ${cameraPos.y.toFixed(2)}, ${cameraPos.z.toFixed(2)} orient ${pano.orientation}°\n` +
          `view yaw ${view.yaw.toFixed(1)}° pitch ${view.pitch.toFixed(1)}° hfov ${view.hfov.toFixed(1)}°\n` +
          `visible false (anyBehind=${anyBehind})`;
      }
      return;
    }

    const points = projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    polygon.setAttribute('points', points);

    // Label centered on the top edge, nudged upward.
    const topMidX = (projected[2].x + projected[3].x) / 2;
    const topMidY = (projected[2].y + projected[3].y) / 2;
    const labelX = topMidX;
    const labelY = topMidY - 18;
    label.setAttribute('x', String(labelX.toFixed(1)));
    label.setAttribute('y', String(labelY.toFixed(1)));
    // Size the pill behind the text (~52x20 for "1.80 m").
    labelBg.setAttribute('x', String((labelX - 28).toFixed(1)));
    labelBg.setAttribute('y', String((labelY - 11).toFixed(1)));
    labelBg.setAttribute('width', '56');
    labelBg.setAttribute('height', '22');

    if (debugPanel) {
      const lines = [
        `window ${win.id} (${options.widthLabel})`,
        `camera pos ${cameraPos.x.toFixed(2)}, ${cameraPos.y.toFixed(2)}, ${cameraPos.z.toFixed(2)} orient ${pano.orientation}°`,
        `view yaw ${view.yaw.toFixed(1)}° pitch ${view.pitch.toFixed(1)}° hfov ${view.hfov.toFixed(1)}° ${width}x${height}`,
        `world corners:`,
        ...corners.map(
          (c, i) => `  ${i}: (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`,
        ),
        `projected:`,
        ...projected.map((p, i) => {
          const yp = worldPointToYawPitch(corners[i], cameraPos, pano.orientation);
          return `  ${i}: yaw ${yp.yaw.toFixed(1)}° pitch ${yp.pitch.toFixed(1)}° -> ${p.x.toFixed(0)},${p.y.toFixed(0)} h=${p.h.toFixed(3)}`;
        }),
      ];
      debugPanel.textContent = lines.join('\n');
    }
  };

  update();

  return () => {
    cancelAnimationFrame(rafId);
    svg.remove();
    if (debugPanel) debugPanel.remove();
    if (!prevPosition) container.style.position = '';
  };
}
