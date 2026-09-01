import type { RawFloorplanRecognitionResponse } from '../../routes/debug-floorplan-recognition.js';

export const VLM_SYSTEM_PROMPT = [
  'You are an expert architectural analyst specializing in floor plan topology.',
  'You will receive TWO images and a RAW recognition JSON:',
  'IMAGE 1 = ORIGINAL FLOORPLAN — Use this image to understand the actual architectural structure (walls, rooms, openings as drawn).',
  'IMAGE 2 = ANNOTATED RECOGNITION — This image contains semi-transparent overlays with labels such as wall-0, wall-1, door-0, window-2, kitchen-0, etc. Use IMAGE 2 to determine which raw recognition object ID corresponds to each visible architectural element.',
  'RAW JSON = EXACT OBJECT DATA — Machine-detected objects: wall, door, entry_door, window, kitchen, and center lines. The JSON coordinates correspond to the source image pixel coordinates. Use the JSON to confirm object IDs and their coordinates.',
  '',
  'DISTINCTION:',
  'Original image → architecture (what is really drawn)',
  'Annotated image → object identity (which ID maps to which drawn element)',
  'JSON → exact machine-readable object definition (coordinates, counts)',
  '',
  'YOUR TASK IS ARCHITECTURAL REASONING WITH RELIABLE OBJECT-ID GROUNDING, NOT GEOMETRY GENERATION.',
  'Do NOT generate coordinates. Do NOT redraw the floor plan. Do NOT estimate pixel positions.',
  'Reference existing detection IDs (e.g., "wall-3", "window-2") to describe relationships.',
  '',
  'Analyze the following:',
  '',
  'A. Wall continuity: For groups of detected wall objects, determine if they represent same_continuous_wall, separate_walls, corner, T_junction, or uncertain. Use IMAGE 1 to decide architecture and IMAGE 2 to ground IDs. Example: east facade exterior wall interrupted by a window should be same_continuous_wall but you must identify the correct wall-* IDs via the annotated image.',
  '',
  'B. Opening -> wall association: For every door/window/entry_door, determine which wall(s) host it. A window that interrupts a continuous exterior wall belongs to both segments. Ground hostWallIds via IMAGE 2.',
  '',
  'C. Wall topology: corners, T-junctions, intersections, continuous walls separated by openings.',
  '',
  'D. Room topology: Identify major enclosed spaces (living, kitchen, hallway, bathroom, entrance, utility, bedroom, terrace, outside, unknown). For each room, list boundaryWalls (wall IDs forming its boundary) and openings (door/window IDs belonging to that room) SEPARATELY. Do NOT mix walls and openings in one array.',
  '',
  'E. Recognition errors: Identify detections that appear inconsistent with the image (false wall, suspicious opening, incorrect kitchen region).',
  '',
  'CRITICAL RULES:',
  '- Every relationship MUST have a confidence 0.0-1.0. Confidence must represent BOTH architectural confidence AND object-ID grounding confidence. Example: "The east facade is clearly continuous, but I cannot reliably determine whether this segment is wall-1 or wall-3." → Do NOT output 0.9; output low confidence (e.g., 0.4) or uncertain.',
  '- If the annotated image does not allow reliable identification of an ID, set relationship to "uncertain" with low confidence. Do NOT guess.',
  '- Never invent object IDs. Only reference IDs present in the supplied JSON.',
  '- Use the annotated image to ground IDs. Use the original image to reason about architecture.',
  '- Do not generate new coordinates. Do not redraw geometry. Do not estimate pixel coordinates.',
  '- Do not assume that sequential IDs represent spatial order (wall-0 next to wall-1 is not guaranteed).',
  '- If an ID cannot be confidently grounded, mark the relationship uncertain.',
  '- For wall relationships use: { wallIds: ["wall-3","wall-1"], relationship: "same_continuous_wall", confidence: 0.92, reason: "..." }',
  '- For openings use: { objectId: "window-2", hostWallIds: ["wall-3","wall-1"], relationship: "interrupts_wall", confidence: 0.97, reason: "..." }  (reason nullable)',
  '- For rooms use: { id: "living-0", type: "living", boundaryWalls: ["wall-3","wall-1","..."], openings: ["window-2","door-2"], confidence: 0.89, reason: "..." }  (openings may be empty array if no openings)',
  '- For reason fields: return a short string when you have a reason, or null when no reason is needed. All fields are required.',
  '- Every array (wallRelationships, openings, wallConnections, rooms, artifacts) must be present — use empty array [] if no findings.',
  '- Focus on interesting cases: east exterior wall with window-2 (can you correctly identify which wall objects form the east facade?), kitchen boundary coherence, hallway/entrance/bathroom enclosed spaces, terrace vs interior, suspicious diagonal/false walls, window-1 as likely false positive.',
  '',
  'Return ONLY the structured JSON. No prose outside the schema.',
].join('\n');

export type VlmUserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export function buildVlmUserMessage(params: {
  imageBuffer: Buffer;
  mimeType: string;
  raw: RawFloorplanRecognitionResponse;
  annotatedImageBuffer?: Buffer;
  annotatedMimeType?: string;
}): VlmUserContentPart[] {
  const rawSummary = {
    wall: params.raw.wall.length,
    door: params.raw.door.length,
    entry_door: params.raw.entry_door.length,
    window: params.raw.window.length,
    kitchen: params.raw.kitchen.length,
    door_center_line: params.raw.door_center_line.length,
    entry_door_center_line: params.raw.entry_door_center_line.length,
    window_center_line: params.raw.window_center_line.length,
  };

  const rawJsonStr = JSON.stringify(params.raw, null, 2);
  const hasAnnotated = !!params.annotatedImageBuffer;

  return [
    {
      type: 'text',
      text: [
        hasAnnotated
          ? 'You are analyzing a floorplan using TWO images (original + annotated) and the RAW JSON.'
          : 'SOURCE IMAGE: floor plan image attached.',
        '',
        hasAnnotated ? 'IMAGE 1 = ORIGINAL FLOORPLAN: use to understand architecture.' : '',
        hasAnnotated ? 'IMAGE 2 = ANNOTATED RECOGNITION: overlays with IDs (wall-0, window-2, etc.) — use to ground object IDs.' : '',
        hasAnnotated ? 'RAW JSON = exact object data (coordinates).' : '',
        '',
        `RAW RECOGNITION SUMMARY: ${JSON.stringify(rawSummary)}`,
        '',
        'RAW RECOGNITION JSON (machine-detected objects, coordinates in image pixels):',
        rawJsonStr,
        '',
        hasAnnotated
          ? 'Use IMAGE 1 for architectural reasoning and IMAGE 2 for ID grounding. Every ID you reference MUST appear in IMAGE 2 labels and in the JSON. If unsure, use relationship="uncertain" with low confidence.'
          : 'Analyze wall continuity, opening->wall associations, wall topology, room topology, and recognition errors.',
        'Reference IDs like wall-0, wall-1, window-2, door-0, entry_door-0, kitchen-0.',
        'The image shows the true architecture; the JSON is noisy machine detection.',
        hasAnnotated ? 'Confidence must combine architectural + grounding confidence. If ID is ambiguous, confidence must be low even if architecture is clear.' : '',
        'Pay special attention to:',
        '- East exterior wall (interrupted by window, split into multiple wall segments) — which wall IDs form it?',
        '- Which wall(s) host window-2?',
        '- Kitchen boundary: which wall objects surround kitchen?',
        '- Hallway definition',
        '- Terrace vs interior living distinction',
        '- Any diagonal or suspicious wall that does not correspond to a visible wall',
        '- window-1 and suspicious wall detections as likely false positives',
        '',
        'Return the JSON structure only.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      type: 'image_url',
      image_url: { url: `data:${params.mimeType};base64,${params.imageBuffer.toString('base64')}` },
    },
    ...(hasAnnotated && params.annotatedImageBuffer
      ? [
          {
            type: 'image_url' as const,
            image_url: {
              url: `data:${params.annotatedMimeType ?? 'image/png'};base64,${params.annotatedImageBuffer.toString('base64')}`,
            },
          },
        ]
      : []),
  ];
}
