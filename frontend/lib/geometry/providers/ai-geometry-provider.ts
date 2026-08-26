import type { GeometryExtraction } from './geometry-provider';
import type { FloorPlanImage, GeometryProvider } from './geometry-provider';

/**
 * Provider error codes surfaced by the AI provider; the UI maps them onto
 * localized messages.
 */
export type AiGeometryErrorCode =
  | 'missing-image'
  | 'service-unreachable'
  | 'extract-failed'
  | 'invalid-result';

export class AIGeometryError extends Error {
  readonly code: AiGeometryErrorCode;

  constructor(code: AiGeometryErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = 'AIGeometryError';
    this.code = code;
  }
}

/**
 * Real inference provider. Sends the uploaded floor plan to the local
 * `/api/geometry/extract` proxy (which talks to the geometry-ai Python
 * service and runs the VistaGeometry adapter); the client-side only receives
 * normalized `VistaGeometry` variants.
 */
export class AIGeometryProvider implements GeometryProvider {
  readonly type = 'ai' as const;

  async extract(image: FloorPlanImage): Promise<GeometryExtraction> {
    if (!image.data) {
      throw new AIGeometryError('missing-image');
    }

    const form = new FormData();
    form.append('file', image.data);

    let res: Response;
    try {
      res = await fetch('/api/geometry/extract', { method: 'POST', body: form });
    } catch {
      throw new AIGeometryError('service-unreachable');
    }

    if (!res.ok) {
      const errorCode = await res
        .json()
        .then((body: { error?: string }) => mapErrorCode(body?.error))
        .catch(() => 'extract-failed' as const);
      throw new AIGeometryError(errorCode ?? 'extract-failed');
    }

    try {
      const payload = (await res.json()) as {
        geometry: import('../models/geometry').VistaGeometry;
        rawGeometry?: import('../models/geometry').VistaGeometry;
        debug?: import('../geometry-debug').GeometryDebug;
      };
      return {
        geometry: payload.geometry,
        rawGeometry: payload.rawGeometry,
        debug: payload.debug,
      };
    } catch {
      throw new AIGeometryError('invalid-result');
    }
  }
}

function mapErrorCode(code?: string): AiGeometryErrorCode | undefined {
  switch (code) {
    case 'service-unreachable':
      return 'service-unreachable';
    case 'extract-failed':
      return 'extract-failed';
    default:
      return undefined;
  }
}

export const aiGeometryProvider: GeometryProvider = new AIGeometryProvider();