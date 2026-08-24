// Spatial annotation prototype (Phase 3).
//
// This module attaches ONE fictional annotation ("Window", 180 x 140 cm) to a
// fixed 3D direction inside a panorama. It is intentionally not a general
// annotation framework — it only proves that an annotation can stay locked to
// a spatial direction of the 360 camera.
//
// Positioning is delegated to Pannellum's built-in custom hotspot system:
// `renderHotSpot()` (pannellum.js) reprojects the hotspot from its
// (yaw, pitch) direction to screen coordinates on every rendered frame and
// sets `visibility: hidden` as soon as the direction is behind the camera.
//
// On top of that, a requestAnimationFrame loop computes the angular distance
// between the current view direction and the annotation direction and drives
// a fade-in/fade-out: fully opaque when the annotation is centered, fully
// transparent when it leaves the (circular approximation of the) view
// frustum. The fade span adapts to the current zoom level (hfov/vfov), so the
// annotation also fades correctly when zooming.
//
// Since Phase 4 the prototype can navigate between several panoramas; this
// annotation lives only in the living room. Pannellum re-creates the
// hotspot's DOM element whenever the scene is (re)loaded, so this module is
// idempotent: it registers the hotspot once per scene and rebuilds only the
// label card if the element is new again.

export const WINDOW_ANNOTATION = {
  label: 'Window',
  size: '180 × 140 cm',
  // Predefined spatial direction (degrees) relative to the panorama.
  yaw: 40,
  pitch: -5,
}

const ANNOTATION_ID = 'window-annotation'
const FADE_TRANSITION_MS = 240

/**
 * Attaches the single window annotation to the given Pannellum viewer and
 * starts the fade loop. Returns a cleanup function.
 */
export function attachWindowAnnotation(viewer, container) {
  const { label, size, yaw, pitch } = WINDOW_ANNOTATION

  // Register the hotspot once. On later visits to the same scene Pannellum
  // re-creates it from the scene's hotSpot configuration, so we only pick up
  // the existing hotspot object again.
  const hotSpots = viewer.getConfig().hotSpots || []
  let annotation = hotSpots.find((hs) => hs.id === ANNOTATION_ID)
  if (!annotation) {
    annotation = {
      id: ANNOTATION_ID,
      type: 'custom',
      cssClass: 'annotation-window',
      yaw,
      pitch,
    }
    viewer.addHotSpot(annotation)
  }

  // Visual representation (label card), anchored on the hotspot position.
  let card = annotation.div.querySelector('.annotation-card')
  if (!card) {
    card = document.createElement('div')
    card.className = 'annotation-card'
    card.style.transition = `opacity ${FADE_TRANSITION_MS}ms ease`

    const name = document.createElement('span')
    name.className = 'annotation-name'
    name.textContent = label

    const sizeLabel = document.createElement('span')
    sizeLabel.className = 'annotation-size'
    sizeLabel.textContent = size

    card.append(name, sizeLabel)
    annotation.div.appendChild(card)
  }

  let canvas = container.querySelector('canvas')
  let rafId = 0

  const update = () => {
    rafId = requestAnimationFrame(update)

    // The canvas may not exist yet right after `load`; retry until it does.
    if (!canvas) {
      canvas = container.querySelector('canvas')
      if (!canvas) return
    }

    const viewYaw = viewer.getYaw()
    const viewPitch = viewer.getPitch()
    const hfov = viewer.getHfov()

    // Vertical field of view derived from the canvas aspect ratio.
    const vfov =
      (2 *
        Math.atan(
          Math.tan(((hfov / 2) * Math.PI) / 180) *
            (canvas.clientHeight / canvas.clientWidth),
        ) *
        180) /
      Math.PI

    // Cosine of the angle between the view direction and the annotation
    // direction (same math Pannellum uses to decide hotspot visibility).
    const yawDelta = ((-yaw + viewYaw) * Math.PI) / 180
    const pitchA = (pitch * Math.PI) / 180
    const pitchV = (viewPitch * Math.PI) / 180
    const cosAngle =
      Math.sin(pitchA) * Math.sin(pitchV) +
      Math.cos(pitchA) * Math.cos(pitchV) * Math.cos(yawDelta)
    const angle = Math.acos(Math.min(1, Math.max(-1, cosAngle)))

    // Fade span: angular radius of the viewable area (smaller of the two
    // half field-of-view angles). Circular approximation of the frustum.
    const halfAngle = ((Math.min(hfov, vfov) / 2) * Math.PI) / 180
    const t = Math.min(1, Math.max(0, 1 - angle / halfAngle))
    const opacity = t * t * (3 - 2 * t) // smoothstep

    card.style.opacity = opacity.toFixed(3)
  }

  update()

  return () => cancelAnimationFrame(rafId)
}