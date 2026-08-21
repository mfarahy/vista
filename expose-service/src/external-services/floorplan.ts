import { fal } from '@fal-ai/client';
import type { Flux2FlexEditInput, Flux2FlexEditOutput } from '@fal-ai/client/endpoints';

export const FAL_FLOORPLAN_MODEL = 'fal-ai/flux-2-flex/edit';

export const DEFAULT_SYSTEM_PROMPT = [
  'The input image is a 2D architectural floor plan.',
  'Preserve the EXACT room layout: the position and proportions of every wall, door, window, and each room must stay unchanged.',
  'Do NOT add, remove, merge, or resize any rooms.',
  'Do NOT change the architecture or the overall outline of the building.',
].join(' ');

export const DEFAULT_USER_PROMPT = [
  'Transform the 2D floor plan into a realistic 3D interior/exterior visualization.',
  'Add realistic furniture appropriate to each room (sofas, beds, kitchen counters, tables, chairs, etc.).',
  'Use realistic materials (wood flooring, tiles, brick, glass, concrete, drywall) and realistic natural lighting with soft shadows.',
  'Render as a professional architectural 3D visualization with a slightly elevated isometric view so the full layout is visible.',
  'Warm inviting color palette, high detail, photorealistic.',
].join(' ');

export interface FloorplanTo3DInput {
  imageBuffer: Buffer;
  mimeType: string;
  systemPrompt?: string;
  userPrompt?: string;
  imageSize?: Flux2FlexEditInput['image_size'];
  guidanceScale?: number;
  numInferenceSteps?: number;
  seed?: number;
}

export interface FloorplanTo3DResult {
  imageUrl: string;
  seed: number;
}

export async function floorplanTo3D(input: FloorplanTo3DInput): Promise<FloorplanTo3DResult> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error('FAL_KEY is not configured on the server.');
  }
  fal.config({ credentials: apiKey });

  const systemPrompt = input.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const userPrompt = input.userPrompt || DEFAULT_USER_PROMPT;
  const prompt = [systemPrompt, userPrompt].filter(Boolean).join('\n\n');

  const blob = new Blob([new Uint8Array(input.imageBuffer)], { type: input.mimeType });
  const imageUrl = await fal.storage.upload(blob);

  const payload: Flux2FlexEditInput = {
    prompt,
    image_urls: [imageUrl],
    image_size: input.imageSize ?? 'landscape_4_3',
    guidance_scale: input.guidanceScale ?? 3.5,
    num_inference_steps: input.numInferenceSteps ?? 28,
    output_format: 'png',
    safety_tolerance: '2',
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  };

  const response = await fal.subscribe(FAL_FLOORPLAN_MODEL, { input: payload });
  const data = response.data as Flux2FlexEditOutput;
  const image = data.images?.[0];
  if (!image?.url) {
    throw new Error('fal.ai response did not contain an output image.');
  }
  return { imageUrl: image.url, seed: data.seed };
}
