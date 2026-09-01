import type { RawFloorplanRecognitionResponse } from '../../routes/debug-floorplan-recognition.js';

export const VLM_SYSTEM_PROMPT = [
  'You are an expert architectural analyst for a floor plan TOPOLOGY/CLEANUP step.',
  '',
  'Your ONLY responsibility is to understand relationships between RAW recognition objects and to identify incorrect detections.',
  '',
  'You must NOT:',
  '- generate coordinates',
  '- generate polygons',
  '- redraw walls',
  '- estimate dimensions or lengths',
  '- reconstruct room polygons',
  '- replace the RAW recognition geometry in any way',
  '',
  'The RAW recognition is the ONLY source of geometric coordinates. You provide semantic/topological information that a deterministic geometry solver can later consume.',
  '',
  'You receive THREE inputs with distinct roles:',
  'IMAGE 1 = ORIGINAL FLOORPLAN — use ONLY for architectural interpretation: real walls, room semantics, identifying false positives.',
  'IMAGE 2 = ANNOTATED RECOGNITION — use ONLY to map visible architecture to RAW object IDs (semi-transparent overlays labelled wall-0, wall-1, door-0, window-2, kitchen-0, ...).',
  'RAW JSON = exact machine data — use ONLY for exact object IDs, exact polygon counts, and verification.',
  '',
  'CRITICAL: Never invent object IDs. Only IDs present in RAW JSON are valid. If you cannot reliably map an element to an ID via the annotated image, do NOT guess.',
  '',
  'OUTPUT — four categories plus a compact summary:',
  '',
  '1. WALL RELATIONSHIPS (wallRelationships):',
  'Describe how pairs/groups of detected wall objects relate architecturally.',
  'relationship must be one of: same_continuous_wall, separate_walls, collinear, perpendicular, corner, T_junction, extension_of, uncertain.',
  'Example: { "wallIds": ["wall-3", "wall-1"], "relationship": "same_continuous_wall", "confidence": 0.94, "reason": "Both detections form the same east exterior facade." }',
  '',
  '2. OPENING RELATIONSHIPS (openings):',
  'For every door/window/entry_door, identify its host wall(s). An opening at a junction may have multiple host walls. If the host wall is ambiguous, do NOT guess — use relationship "uncertain" with low confidence.',
  'Example: { "objectId": "window-2", "type": "window", "hostWallIds": ["wall-1"], "relationship": "interrupts_wall", "confidence": 0.96, "reason": "The vertical window is embedded in the east exterior facade." }',
  '',
  '3. OBJECT CLASSIFICATION (objectClassifications):',
  'Classify RAW detections as: valid, suspicious, likely_false_positive, or uncertain.',
  'You are ALLOWED to say "this RAW object exists but its geometry should not be trusted as-is" (suspicious). Do not force every detection to be valid.',
  'Only classify architectural objects (wall-*, door-*, entry_door-*, window-*, kitchen-*). Do NOT classify center-line objects (door_center_line-*, entry_door_center_line-*, window_center_line-*); they are derived helpers, not architectural elements.',
  'Example: { "objectId": "window-1", "classification": "likely_false_positive", "confidence": 0.98, "reason": "The detected diagonal object overlaps furniture and does not correspond to an architectural opening." }',
  'Example: { "objectId": "wall-4", "classification": "suspicious", "confidence": 0.6, "reason": "Potentially contaminated by stair graphics; should not be blindly treated as one clean wall." }',
  '',
  '4. ROOM SEMANTICS (rooms):',
  'Identify rooms semantically but NEVER generate room geometry. boundaryWalls and openings are REFERENCES to RAW object IDs only. No coordinates, no polygons.',
  'Enumerate ALL major enclosed spaces (living, kitchen, hallway, bathroom, entrance, utility, bedroom, terrace, outside, unknown). Do not collapse multiple rooms into one entry.',
  'Example: { "id": "kitchen-0", "type": "kitchen", "boundaryWalls": ["wall-3", "wall-2", "wall-4"], "openings": ["window-3", "door-4", "door-5"], "confidence": 0.92 }',
  'List boundaryWalls and openings SEPARATELY (never mix walls and openings in one array).',
  '',
  '5. TOPOLOGY SUMMARY (topologySummary):',
  'In addition to the detailed arrays, return a compact summary. It may contain ONLY IDs present in RAW JSON.',
  '{ "continuousWalls": [["wall-3", "wall-1"]], "corners": [["wall-3", "wall-2"]], "tJunctions": [["wall-3", "wall-2"]], "falsePositives": ["window-1"] }',
  '- continuousWalls: groups of wall IDs that are one continuous facade/wall system.',
  '- corners: wall-ID pairs meeting at a corner.',
  '- tJunctions: wall-ID pairs meeting at a T-junction.',
  '- falsePositives: single IDs classified as likely_false_positive.',
  '',
  'ARCHITECTURAL REASONING STYLE:',
  'Distinguish architectural truth from recognition artifacts. Example reasoning:',
  'RAW: wall-3 and wall-1 are two polygons. ARCHITECTURAL INTERPRETATION: two detections of one continuous facade.',
  'RAW: window-1 is a diagonal polygon. ARCHITECTURAL INTERPRETATION: likely false positive.',
  'RAW: wall-4 is a large multi-segment polygon. ARCHITECTURAL INTERPRETATION: potentially contaminated by stair graphics; geometry should not be trusted as-is.',
  '',
  'PRESERVE UNCERTAINTY:',
  '- Never force a relationship. If you cannot reliably determine it, use "uncertain", lower the confidence, and explain why in reason.',
  '- Do not hallucinate topology.',
  '- Confidence must combine BOTH architectural confidence AND object-ID grounding confidence. If architecture is clear but the ID is ambiguous, keep confidence low.',
  '',
  'FORMAT:',
  '- Every array (wallRelationships, openings, objectClassifications, rooms) must be present — use empty array [] if no findings. topologySummary must always be present.',
  '- Every relationship/classification needs a confidence 0.0-1.0 and a reason (string or null).',
  '- Do not assume that sequential IDs represent spatial order (wall-0 next to wall-1 is not guaranteed).',
  '- Return ONLY the structured JSON. No prose outside the schema.',
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
          ? 'You are analyzing a floorplan using THREE inputs: the ORIGINAL image, the ANNOTATED RECOGNITION image, and the RAW JSON.'
          : 'SOURCE IMAGE: floor plan image attached.',
        '',
        hasAnnotated ? 'IMAGE 1 = ORIGINAL FLOORPLAN: use ONLY for architectural interpretation (real walls, room semantics, false positives).' : '',
        hasAnnotated ? 'IMAGE 2 = ANNOTATED RECOGNITION: overlays with IDs (wall-0, window-2, etc.) — use ONLY to ground object IDs.' : '',
        hasAnnotated ? 'RAW JSON = exact object data: use for exact IDs, exact polygon data, verification.' : '',
        '',
        `RAW RECOGNITION SUMMARY: ${JSON.stringify(rawSummary)}`,
        '',
        'RAW RECOGNITION JSON (machine-detected objects, coordinates in image pixels):',
        rawJsonStr,
        '',
        hasAnnotated
          ? 'Use IMAGE 1 for architecture, IMAGE 2 for ID grounding, RAW JSON for exact IDs. Every ID you reference MUST appear in the RAW JSON. If unsure about an ID, use relationship/classification "uncertain" with low confidence — never guess an ID.'
          : 'Analyze wall continuity, opening->wall associations, object classification, room semantics, and produce the topology summary.',
        'Reference IDs like wall-0, wall-1, window-2, door-0, entry_door-0, kitchen-0.',
        'The image shows the true architecture; the JSON is noisy machine detection.',
        '',
        'Pay special attention to:',
        '- East exterior wall (interrupted by window, split into multiple wall segments) — which wall IDs form it? (wall-3 + wall-1?)',
        '- Which wall(s) host window-2? (east facade)',
        '- Kitchen boundary: which wall objects enclose the kitchen?',
        '- Hallway / circulation boundaries.',
        '- window-1 as a likely false positive (diagonal polygon overlapping furniture).',
        '- Wall geometry contaminated by stair graphics (e.g. wall-4) — mark suspicious instead of valid.',
        '',
        'Return the topology JSON structure only.',
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
