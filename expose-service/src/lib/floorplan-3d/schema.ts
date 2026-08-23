import { z } from 'zod';

/**
 * Canonical 3D floor plan model produced by a FloorPlan3DProvider and consumed
 * by the frontend viewer. The MVP keeps the representation deliberately
 * simple: rooms, walls, doors, and windows expressed as axis-aligned boxes in
 * meters on a two-dimensional plan (x/y), with an optional `level` for
 * multi-storey plans. The frontend extrudes these boxes and labels the rooms.
 *
 * This is the provider boundary: every provider must return a model that
 * satisfies `floorPlan3DModelSchema` — no provider-specific format ever
 * reaches the frontend.
 */

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const roomSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  /** Storey index; 0 = ground floor. */
  level: z.number().int().min(0).max(20).default(0),
  /** Room center in meters on the plan. */
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(200),
  depth: z.number().positive().max(200),
  /** Room height in meters; also the wall height of that level. */
  height: z.number().positive().max(20).default(2.5),
  /** Extracted room area in m², when it can be read reliably; null otherwise. */
  areaM2: z.number().positive().max(10000).nullable(),
});

const wallSchema = z.object({
  id: z.string().min(1).max(60),
  level: z.number().int().min(0).max(20).default(0),
  /** Wall centerline segment endpoints in meters on the plan. */
  from: pointSchema,
  to: pointSchema,
  /** Wall thickness in meters. */
  thickness: z.number().positive().max(5).default(0.25),
  height: z.number().positive().max(20).default(2.5),
});

const openingSchema = z.object({
  id: z.string().min(1).max(60),
  level: z.number().int().min(0).max(20).default(0),
  /** Opening center in meters on the plan. */
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(10),
  height: z.number().positive().max(10).default(2.1),
  /** Orientation of the opening in radians around the vertical axis. */
  rotation: z.number().finite().default(0),
});

export const floorPlan3DModelSchema = z.object({
  /** Unit of all lengths; the MVP always uses meters. */
  unit: z.literal('m').default('m'),
  rooms: z.array(roomSchema).min(1).max(60),
  walls: z.array(wallSchema).max(300).default([]),
  doors: z.array(openingSchema).max(60).default([]),
  windows: z.array(openingSchema).max(60).default([]),
});

export type FloorPlan3DRoom = z.infer<typeof roomSchema>;
export type FloorPlan3DWall = z.infer<typeof wallSchema>;
export type FloorPlan3DOpening = z.infer<typeof openingSchema>;
export type FloorPlan3DModel = z.infer<typeof floorPlan3DModelSchema>;