// 360 viewer preview — floor-boundary overlay (Vista 360 MVP, phase 1).
//
// Renders the lines where the floor meets the walls inside the Pannellum
// view, derived from the stored Raster2Seq floor-plan geometry (a normalized
// polygon mapped into world meters). Built as a sibling of `windowOverlay.ts`
// and reuses its projection helpers; additional geometry (windows, doors,
// walls) can later attach their own overlays the same way without touching
// the raw analysis.
//
// The boundary is a closed loop that surrounds the camera, so unlike the
// window overlay it must stay visible even when many of its vertices are
// behind the viewer: only the in-front arc is projected and drawn, ordered by
// relative yaw (seam-safe — the projection works on direction vectors).

import { floorPlanToWorld3D, normalizedFloorplanToWorld, type WorldPoint } from './coordinates';
import { normalizeYaw } from './panoramas';
import { worldPointToYawPitch, yawPitchToScreen, type ViewState } from './panoramaProjection';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type BoundaryOverlayViewer = {
  getYaw: () => number;
  getPitch: () => number;
  getHfov: () => number;
};

export type FloorBoundaryOverlayOptions = {
  /** Boundary polygon in normalized [0,1] floor-plan coordinates. */
  boundary: number[][];
  /** Camera position in normalized [0,1] floor-plan coordinates. */
  camera: { x: number; y: number };
  /** Panorama orientation (degrees): world yaw at the panorama's yaw-0. */
  orientation?: number;
};

function createOverlaySvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'vista-360-preview__boundary-overlay');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '5';
  svg.style.overflow = 'hidden';

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'vista-360-preview__boundary-overlay-group');
  group.style.transition = 'opacity 180ms ease';
  group.style.opacity = '0';

  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('class', 'vista-360-preview__boundary-overlay-shape');
  group.appendChild(polyline);

  svg.appendChild(group);
  return { svg, group, polyline };
}

/**
 * Attaches the floor-boundary overlay for the given panorama and returns a
 * cleanup function. The boundary stays hidden until at least two vertices are
 * in front of the camera.
 */
export function attachFloorBoundaryOverlay(
  viewer: BoundaryOverlayViewer,
  container: HTMLElement,
  options: FloorBoundaryOverlayOptions,
): () => void {
  const { boundary, camera, orientation = 0 } = options;
  if (!boundary || boundary.length < 3) return () => {};

  const cameraPos: WorldPoint = floorPlanToWorld3D(normalizedFloorplanToWorld(camera.x, camera.y));
  const worldPoints = boundary.map(([nx, ny]) => ({
    x: normalizedFloorplanToWorld(nx, ny).x,
    y: 0,
    z: normalizedFloorplanToWorld(nx, ny).y,
  }));

  const { svg, group, polyline } = createOverlaySvg();
  container.appendChild(svg);

  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = 'relative';

  let canvas: HTMLCanvasElement | null = null;
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

    const view: ViewState = {
      yaw: viewer.getYaw(),
      pitch: viewer.getPitch(),
      hfov: viewer.getHfov(),
      width,
      height,
    };

    const projected = worldPoints
      .map((point) => {
        const { yaw, pitch } = worldPointToYawPitch(point, cameraPos, orientation);
        const screen = yawPitchToScreen(yaw, pitch, view);
        return { ...screen, relYaw: normalizeYaw(yaw - view.yaw) };
      })
      .filter((p) => !p.behind && Math.abs(p.relYaw) < 90)
      .sort((a, b) => a.relYaw - b.relYaw);

    if (projected.length < 2) {
      group.style.opacity = '0';
      return;
    }

    polyline.setAttribute(
      'points',
      projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    );
    group.style.opacity = '1';
  };

  update();

  return () => {
    cancelAnimationFrame(rafId);
    svg.remove();
    if (!prevPosition) container.style.position = '';
  };
}
