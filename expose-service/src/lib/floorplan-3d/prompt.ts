import type { FloorPlan3DInput } from './types.js';

/**
 * Prompt contract for the OpenAI floor plan 3D provider. The system prompt
 * fixes the output contract (structural elements only, meters, one storey per
 * `level`); the user message carries the plan image plus optional property
 * context. No provider-specific logic lives outside this provider.
 */

export const SYSTEM_PROMPT = [
  'You are an expert architectural analyst.',
  'Analyze the 2D architectural floor plan image and extract its structural layout.',
  'Return a simple 3D model representation containing only the structural elements:',
  '- rooms: every room as a box with its center (x, y), width, depth, height and its name (e.g. "Wohnzimmer", "Küche", "Bad").',
  '- walls: the load-bearing and partition walls as straight segments (from, to) with thickness.',
  '- doors and windows: each as an opening placed on a wall with its center (x, y), width, height and rotation.',
  'Rules:',
  '- Use meters for every length. The unit must be "m".',
  '- Keep the exact room layout: do not invent, merge, or resize rooms.',
  '- Use level 0 for the ground floor, level 1 for the first floor, etc.',
  '- Include room names exactly as shown on the plan where readable.',
  '- Add areaM2 for a room only when the plan states the area explicitly.',
  '- Do NOT generate furniture, decorations, people, plants, or any non-structural content.',
  '- When a wall is not visible or not reliably identifiable, omit it instead of guessing.',
].join('\n');

/** A single content part of the user message sent to the model. */
export type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export function buildUserMessage(input: FloorPlan3DInput): UserContentPart[] {
  const context = input.property
    ? [
        'Property context for plausibility checks (do not treat as exact dimensions):',
        ...(input.property.address ? [`Address: ${input.property.address}`] : []),
        ...(input.property.livingAreaM2
          ? [`Living area: ${input.property.livingAreaM2} m²`]
          : []),
        ...(input.property.totalRooms
          ? [`Rooms: ${input.property.totalRooms}`]
          : []),
      ].join('\n')
    : null;
  return [
    {
      type: 'text',
      text: [
        'Extract the structural 3D model representation of the attached 2D floor plan.',
        context ?? '',
        'Respond with the JSON structure only.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      type: 'image_url',
      image_url: { url: `data:${input.mimeType};base64,${input.imageBuffer.toString('base64')}` },
    },
  ];
}