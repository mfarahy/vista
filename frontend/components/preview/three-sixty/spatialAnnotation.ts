// Isolated 360 viewer preview — spatial annotation.
// Typed port of the standalone prototype's `360/src/spatialAnnotation.js`.
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
// a fade-in/fade-out. The fade span adapts to the current zoom level.

export const ANNOTATION_ID = 'window-annotation';

const FADE_TRANSITION_MS = 240;

export type AnnotationOptions = {
  label: string;
  size: string;
  yaw?: number;
  pitch?: number;
};

export type AnnotationHotspot = {
  id?: string;
  type?: string;
  cssClass?: string;
  yaw?: number;
  pitch?: number;
  div?: HTMLElement;
};

export type AnnotationViewer = {
  getConfig: () => { hotSpots?: AnnotationHotspot[] };
  addHotSpot: (hotspot: AnnotationHotspot) => void;
  getYaw: () => number;
  getPitch: () => number;
  getHfov: () => number;
};

/**
 * Attaches the single window annotation to the given Pannellum viewer and
 * starts the fade loop. Returns a cleanup function.
 */
export function attachWindowAnnotation(
  viewer: AnnotationViewer,
  container: HTMLElement,
  options: AnnotationOptions,
): () => void {
  const { label, size, yaw = 40, pitch = -5 } = options;

  // Register the hotspot once. On later visits to the same scene Pannellum
  // re-creates it from the scene's hotSpot configuration, so we only pick up
  // the existing hotspot object again.
  const hotSpots = viewer.getConfig().hotSpots || [];
  let annotation: AnnotationHotspot | undefined = hotSpots.find((hs) => hs.id === ANNOTATION_ID);
  if (!annotation) {
    annotation = {
      id: ANNOTATION_ID,
      type: 'custom',
      cssClass: 'vista-360-preview__annotation-window',
      yaw,
      pitch,
    };
    viewer.addHotSpot(annotation);
  }

  // Visual representation (label card), anchored on the hotspot position.
  let card = annotation.div?.querySelector<HTMLElement>('.vista-360-preview__annotation-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'vista-360-preview__annotation-card';
    card.style.transition = `opacity ${FADE_TRANSITION_MS}ms ease`;

    const name = document.createElement('span');
    name.className = 'vista-360-preview__annotation-name';
    name.textContent = label;

    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'vista-360-preview__annotation-size';
    sizeLabel.textContent = size;

    card.append(name, sizeLabel);
    annotation.div?.appendChild(card);
  }

  let canvas = container.querySelector('canvas');
  let rafId = 0;

  const update = () => {
    rafId = requestAnimationFrame(update);

    // The canvas may not exist yet right after `load`; retry until it does.
    if (!canvas) {
      canvas = container.querySelector('canvas');
      if (!canvas) return;
    }

    const viewYaw = viewer.getYaw();
    const viewPitch = viewer.getPitch();
    const hfov = viewer.getHfov();

    // Vertical field of view derived from the canvas aspect ratio.
    const vfov =
      (2 *
        Math.atan(
          Math.tan(((hfov / 2) * Math.PI) / 180) *
            (canvas.clientHeight / canvas.clientWidth),
        ) *
        180) /
      Math.PI;

    // Cosine of the angle between the view direction and the annotation
    // direction (same math Pannellum uses to decide hotspot visibility).
    const yawDelta = ((-yaw + viewYaw) * Math.PI) / 180;
    const pitchA = (pitch * Math.PI) / 180;
    const pitchV = (viewPitch * Math.PI) / 180;
    const cosAngle =
      Math.sin(pitchA) * Math.sin(pitchV) +
      Math.cos(pitchA) * Math.cos(pitchV) * Math.cos(yawDelta);
    const angle = Math.acos(Math.min(1, Math.max(-1, cosAngle)));

    // Fade span: angular radius of the viewable area (smaller of the two
    // half field-of-view angles). Circular approximation of the frustum.
    const halfAngle = ((Math.min(hfov, vfov) / 2) * Math.PI) / 180;
    const t = Math.min(1, Math.max(0, 1 - angle / halfAngle));
    const opacity = t * t * (3 - 2 * t); // smoothstep

    card.style.opacity = opacity.toFixed(3);
  };

  update();

  return () => cancelAnimationFrame(rafId);
}