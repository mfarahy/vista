import type { RawFloorplanRecognitionResponse } from '../../routes/debug-floorplan-recognition.js';

export const VLM_SYSTEM_PROMPT = [
  'You are an expert architectural analyst specializing in floor plan topology.',
  'You will receive:',
  '1. A floor plan image (architectural drawing).',
  '2. A RAW recognition JSON with machine-detected objects: wall, door, entry_door, window, kitchen, and center lines.',
  'The JSON coordinates correspond to the source image pixel coordinates.',
  '',
  'YOUR TASK IS ARCHITECTURAL REASONING, NOT GEOMETRY GENERATION.',
  'Do NOT generate coordinates. Do NOT redraw the floor plan. Do NOT estimate pixel positions.',
  'Reference existing detection IDs (e.g., "wall-3", "window-2") to describe relationships.',
  '',
  'Analyze the following:',
  '',
  'A. Wall continuity: For groups of detected wall objects, determine if they represent same_continuous_wall, separate_walls, corner, T_junction, or uncertain. Use the image to decide. Example: exterior wall interrupted by a window should be same_continuous_wall.',
  '',
  'B. Opening -> wall association: For every door/window/entry_door, determine which wall(s) host it. A window that interrupts a continuous exterior wall belongs to both segments.',
  '',
  'C. Wall topology: corners, T-junctions, intersections, continuous walls separated by openings.',
  '',
  'D. Room topology: Identify major enclosed spaces (living, kitchen, hallway, bathroom, entrance, utility, bedroom, terrace, outside, unknown). For each room, list the wall IDs that form its boundary.',
  '',
  'E. Recognition errors: Identify detections that appear inconsistent with the image (false wall, suspicious opening, incorrect kitchen region).',
  '',
  'CRITICAL RULES:',
  '- Every relationship MUST have a confidence 0.0-1.0. Use uncertain when ambiguous.',
  '- If the image is ambiguous, set relationship to uncertain with low confidence.',
  '- Do NOT invent objects not in JSON.',
  '- Only reference IDs that exist in the provided JSON.',
  '- Focus on interesting cases: east exterior wall with window-2, kitchen boundary, hallway/entrance/bathroom separation, terrace vs interior, suspicious diagonal/false walls.',
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

  return [
    {
      type: 'text',
      text: [
        'SOURCE IMAGE: floor plan image attached.',
        '',
        `RAW RECOGNITION SUMMARY: ${JSON.stringify(rawSummary)}`,
        '',
        'RAW RECOGNITION JSON (machine-detected objects, coordinates in image pixels):',
        rawJsonStr,
        '',
        'Analyze wall continuity, opening->wall associations, wall topology, room topology, and recognition errors.',
        'Reference IDs like wall-0, wall-1, window-2, door-0, entry_door-0, kitchen-0.',
        'The image shows the true architecture; the JSON is noisy machine detection.',
        'Pay special attention to:',
        '- East exterior wall (interrupted by window, split into multiple wall segments)',
        '- Kitchen boundary coherence',
        '- Hallway / entrance / bathroom enclosed spaces',
        '- Any diagonal or suspicious wall that does not correspond to a visible wall',
        '- Terrace / outside vs interior living area distinction',
        '',
        'Return the JSON structure only.',
      ].join('\n'),
    },
    {
      type: 'image_url',
      image_url: { url: `data:${params.mimeType};base64,${params.imageBuffer.toString('base64')}` },
    },
  ];
}
