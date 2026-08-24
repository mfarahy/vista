// Spatial navigation prototype (Phase 4).
//
// Turns the in-memory panorama data (`panoramas.js`) into Pannellum's
// per-scene configuration: every panorama becomes one Pannellum scene and
// every outgoing link becomes one navigation arrow hotspot, positioned at
// the exact (yaw, pitch) direction of the target panorama.
//
// Clicking an arrow navigates to the target scene. Pannellum cross-fades
// between scenes (`sceneFadeDuration`) and re-renders the arrow hotspots
// every frame, so the arrows stay glued to their spatial direction while the
// camera rotates and are hidden automatically when the direction is behind
// the camera.

import { LINKS, PANORAMAS, arrivalYaw, linkYaw, panoramaById } from './panoramas.js'

// Must match `sceneFadeDuration` in the viewer config (see App.jsx).
export const FADE_TRANSITION_MS = 800

/**
 * Builds the `scenes` configuration for the Pannellum viewer.
 *
 * @param {Function} navigate - called with the clicked link
 */
export function buildScenesConfig(navigate) {
  const scenes = {}
  for (const pano of PANORAMAS) {
    scenes[pano.id] = {
      panorama: pano.image,
      yaw: pano.initial.yaw,
      pitch: pano.initial.pitch,
      hfov: pano.initial.hfov,
      hotSpots: LINKS.filter((link) => link.from === pano.id).map((link) =>
        createArrowHotspot(link, navigate),
      ),
    }
  }
  return scenes
}

/**
 * Navigates from the current panorama along `link`.
 *
 * The arriving view keeps the current pitch and zoom and faces the same
 * world direction the arrow pointed to (the direction of travel), expressed
 * in the target panorama's frame. Pannellum cross-fades to the target scene.
 */
export function navigateToPanorama(viewer, link) {
  viewer.loadScene(link.to, viewer.getPitch(), arrivalYaw(link), viewer.getHfov())
}

function createArrowHotspot(link, navigate) {
  return {
    type: 'custom',
    cssClass: 'nav-arrow',
    yaw: linkYaw(link),
    pitch: 0,
    clickHandlerFunc: (event, args) => navigate(link),
    createTooltipFunc: (div) => createArrowElement(div, link),
  }
}

function createArrowElement(div, link) {
  const target = panoramaById(link.to)

  const body = document.createElement('div')
  body.className = 'nav-arrow-body'

  const icon = document.createElement('span')
  icon.className = 'nav-arrow-icon'
  icon.setAttribute('aria-hidden', 'true')

  const label = document.createElement('span')
  label.className = 'nav-arrow-label'
  label.textContent = target.label

  body.append(icon, label)
  div.appendChild(body)
}