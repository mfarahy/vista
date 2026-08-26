/**
 * Normalized Vista floor-plan geometry.
 *
 * This is the canonical, versioned geometry contract produced by a
 * `GeometryProvider` (currently the deterministic `MockGeometryProvider`) and
 * consumed by the Geometry Playground UI. The schema is intentionally minimal
 * for Phase 1; it is expected to grow in later phases.
 *
 * Coordinate system (image-relative):
 *   origin = top-left corner of the source image
 *   x      = horizontal pixel coordinate (increases to the right)
 *   y      = vertical pixel coordinate (increases downward)
 */

export type GeometryUnits = 'px';

export type Point2D = {
  x: number;
  y: number;
};

export type WallType = 'interior' | 'exterior' | 'unknown';

export type Wall = {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number;
  type: WallType;
  /** Optional 0..1 confidence that this entity was extracted correctly. */
  confidence?: number;
};

export type Room = {
  id: string;
  name: string | null;
  polygon: Point2D[];
  wallIds: string[];
  confidence?: number;
  /**
   * Semantic room type from the controlled VLM enum (bedroom, kitchen,
   * hallway, …) when the Phase 6 fusion layer matched a semantic space to
   * this polygon. `null`/undefined when unknown.
   */
  type?: string | null;
};

export type DoorSwing = 'left' | 'right';

export type Door = {
  id: string;
  wallId: string;
  /** Fractional position (0..1) of the door centre along its host wall. */
  position: number;
  width: number;
  swing: DoorSwing;
  confidence?: number;
};

export type Window = {
  id: string;
  wallId: string;
  /** Fractional position (0..1) of the window centre along its host wall. */
  position: number;
  width: number;
  confidence?: number;
};

export type StairDirection = 'up' | 'down';

/**
 * A stair entity. Phase 6 stairs are *semantic region candidates*: the UNet
 * has no stair class, so a fused stair carries the VLM's anchor point, the
 * hosting room and the direction — never fabricated tread geometry. Hence
 * `width`/`length` are optional and only present when real geometry exists.
 */
export type Stair = {
  id: string;
  position: Point2D;
  width?: number;
  length?: number;
  direction?: StairDirection | null;
  /** Hosting room id when the anchor landed inside a matched room. */
  regionId?: string | null;
  /** `semantic` = VLM-derived region candidate (no UNet geometry). */
  source?: 'semantic' | 'unet';
  confidence?: number;
};

export type GeometrySource = {
  width: number;
  height: number;
};

export type VistaGeometry = {
  version: string;
  units: GeometryUnits;
  source: GeometrySource;
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  stairs: Stair[];
  scale: number | null;
  /** Optional overall 0..1 confidence of the extraction, when the provider
   *  exposes it. Providers that have no confidence signal omit it. */
  confidence?: number;
};

/** Current version constant used by providers when emitting geometry. */
export const GEOMETRY_VERSION = '1.0';
