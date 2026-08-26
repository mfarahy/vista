import { GEOMETRY_VERSION, type Point2D, type VistaGeometry, type Wall } from '../models/geometry';
import type { FloorPlanImage, GeometryProvider } from './geometry-provider';

/**
 * Deterministic geometry provider used for Phase 1 end-to-end testing.
 *
 * It synthesizes a simple, plausible floor plan from the source image's pixel
 * dimensions: a rectangular exterior shell with a single interior divider that
 * splits the plan into two rooms, one door and two windows. No real image
 * analysis happens here — the geometry is a stand-in for the future AI model
 * and keeps the whole pipeline testable.
 */
export class MockGeometryProvider implements GeometryProvider {
  readonly type = 'mock' as const;

  async extract(image: FloorPlanImage) {
    return { geometry: buildMockGeometry(image) };
  }
}

/**
 * Deterministic geometry synthesis shared by the async provider wrapper, so
 * every page glance still uses the same geometry.
 */
export function buildMockGeometry(image: FloorPlanImage): VistaGeometry {
    const { width, height } = image;
    const margin = Math.min(width, height) * 0.05;

    const topLeft = { x: margin, y: margin };
    const topRight = { x: width - margin, y: margin };
    const bottomRight = { x: width - margin, y: height - margin };
    const bottomLeft = { x: margin, y: height - margin };

    const dividerX = width / 2;

    const walls: Wall[] = [
      {
        id: 'wall-north',
        start: topLeft,
        end: topRight,
        thickness: Math.round(Math.min(width, height) * 0.02),
        type: 'exterior',
      },
      {
        id: 'wall-east',
        start: topRight,
        end: bottomRight,
        thickness: Math.round(Math.min(width, height) * 0.02),
        type: 'exterior',
      },
      {
        id: 'wall-south',
        start: bottomRight,
        end: bottomLeft,
        thickness: Math.round(Math.min(width, height) * 0.02),
        type: 'exterior',
      },
      {
        id: 'wall-west',
        start: bottomLeft,
        end: topLeft,
        thickness: Math.round(Math.min(width, height) * 0.02),
        type: 'exterior',
      },
      {
        id: 'wall-divider',
        start: { x: dividerX, y: margin },
        end: { x: dividerX, y: height - margin },
        thickness: Math.round(Math.min(width, height) * 0.015),
        type: 'interior',
      },
    ];

    const roomWest: Point2D[] = [
      topLeft,
      { x: dividerX, y: margin },
      { x: dividerX, y: height - margin },
      bottomLeft,
    ];
    const roomEast: Point2D[] = [
      { x: dividerX, y: margin },
      topRight,
      bottomRight,
      { x: dividerX, y: height - margin },
    ];

    return {
      version: GEOMETRY_VERSION,
      units: 'px',
      source: { width, height },
      walls,
      rooms: [
        {
          id: 'room-west',
          name: null,
          polygon: roomWest,
          wallIds: ['wall-north', 'wall-west', 'wall-south', 'wall-divider'],
        },
        {
          id: 'room-east',
          name: null,
          polygon: roomEast,
          wallIds: ['wall-north', 'wall-east', 'wall-south', 'wall-divider'],
        },
      ],
      doors: [
        {
          id: 'door-divider',
          wallId: 'wall-divider',
          position: 0.5,
          width: Math.round(Math.min(width, height) * 0.12),
          swing: 'left',
        },
      ],
      windows: [
        {
          id: 'window-north',
          wallId: 'wall-north',
          position: 0.3,
          width: Math.round(Math.min(width, height) * 0.18),
        },
        {
          id: 'window-south',
          wallId: 'wall-south',
          position: 0.7,
          width: Math.round(Math.min(width, height) * 0.18),
        },
      ],
      stairs: [],
      scale: null,
    };
}

/**
 * Shared singleton so every page glance uses the same deterministic geometry
 * without re-instantiating the provider.
 */
export const mockGeometryProvider: GeometryProvider = new MockGeometryProvider();
