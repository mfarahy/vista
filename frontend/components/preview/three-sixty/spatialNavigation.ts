// 360 viewer preview — spatial navigation.
//
// Turns the in-memory panorama data (`panoramas.ts`) into Pannellum's
// per-scene configuration: every panorama becomes one Pannellum scene and
// every outgoing link becomes one navigation arrow hotspot, positioned at
// the exact (yaw, pitch) direction of the target panorama.
//
// Clicking an arrow navigates to the target scene. Pannellum cross-fades
// between scenes (`sceneFadeDuration`) and re-renders the arrow hotspots
// every frame, so the arrows stay glued to their spatial direction while the
// camera rotates and are hidden automatically when the direction is behind
// the camera.

import { LINKS, PANORAMAS, arrivalYaw, linkYaw, panoramaById, type PanoramaId, type PanoramaLink } from './panoramas';

export type PannellumViewer = {
  loadScene: (id: string, pitch: number, yaw: number, hfov: number) => void;
  getYaw: () => number;
  getPitch: () => number;
  getHfov: () => number;
};

// Must match `sceneFadeDuration` in the viewer config (see ThreeSixtyPreview).
export const FADE_TRANSITION_MS = 800;

/**
 * Builds the `scenes` configuration for the Pannellum viewer.
 *
 * @param navigate - called with the clicked link
 * @param labelFor  - resolves a panorama id to its displayed (localized) label
 */
export function buildScenesConfig(
  navigate: (link: PanoramaLink) => void,
  labelFor: (id: PanoramaId) => string,
): Record<string, unknown> {
  const scenes: Record<string, unknown> = {};
  for (const pano of PANORAMAS) {
    scenes[pano.id] = {
      panorama: pano.image,
      yaw: pano.initial.yaw,
      pitch: pano.initial.pitch,
      hfov: pano.initial.hfov,
      hotSpots: LINKS.filter((link) => link.from === pano.id).map((link) =>
        createArrowHotspot(link, navigate, labelFor),
      ),
    };
  }
  return scenes;
}

/**
 * Navigates from the current panorama along `link`.
 *
 * The arriving view keeps the current pitch and zoom and faces back toward
 * the panorama the user came from, expressed in the target panorama's frame.
 * Pannellum cross-fades to the target scene.
 */
export function navigateToPanorama(viewer: PannellumViewer, link: PanoramaLink) {
  viewer.loadScene(link.to, viewer.getPitch(), arrivalYaw(link), viewer.getHfov());
}

function createArrowHotspot(
  link: PanoramaLink,
  navigate: (link: PanoramaLink) => void,
  labelFor: (id: PanoramaId) => string,
) {
  return {
    type: 'custom',
    cssClass: 'vista-360-preview__nav-arrow',
    yaw: linkYaw(link),
    pitch: 0,
    clickHandlerFunc: (event: unknown, args: unknown) => navigate(link),
    createTooltipFunc: (div: HTMLElement) => createArrowElement(div, link, labelFor),
  };
}

function createArrowElement(div: HTMLElement, link: PanoramaLink, labelFor: (id: PanoramaId) => string) {
  const target = panoramaById(link.to)

  const body = document.createElement('div')
  body.className = 'vista-360-preview__nav-arrow-body'

  const icon = document.createElement('span')
  icon.className = 'vista-360-preview__nav-arrow-icon'
  icon.setAttribute('aria-hidden', 'true')

  const label = document.createElement('span')
  label.className = 'vista-360-preview__nav-arrow-label'
  label.textContent = target ? labelFor(target.id) : String(link.to)

  body.append(icon, label)
  div.appendChild(body)
}