import "dotenv/config";
import { fal } from "@fal-ai/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  Flux2FlexEditInput,
  Flux2FlexEditOutput,
} from "@fal-ai/client/endpoints";
import { Buffer } from "node:buffer";
import process from "node:process";

// ============================================================================
// Configuration — tweak these for your first test.
// ============================================================================

// Image-to-image model used to convert the 2D floor plan into a 3D render.
// "fal-ai/flux-2-flex/edit" is FLUX.2 [flex] in edit mode: it accepts input
// image URLs and re-renders them following a prompt.
const FAL_MODEL_ID = "fal-ai/flux-2-flex/edit";

const PROMPT = [
  "The input image is a 2D architectural floor plan.",
  "Transform it into a realistic 3D interior/exterior visualization.",
  "Preserve the EXACT room layout: the position and proportions of every wall, door, window, and each room must stay unchanged.",
  "Do NOT add, remove, merge, or resize any rooms.",
  "Do NOT change the architecture or the overall outline of the building.",
  "Add realistic furniture appropriate to each room (sofas, beds, kitchen counters, tables, chairs, etc.).",
  "Use realistic materials (wood flooring, tiles, brick, glass, concrete, drywall) and realistic natural lighting with soft shadows.",
  "Render as a professional architectural 3D visualization with a slightly elevated isometric view so the full layout is visible.",
  "Warm inviting color palette, high detail, photorealistic.",
].join(" ");

// Output resolution preset (square, portrait_4_3, landscape_4_3, ... or "auto").
const IMAGE_SIZE: Flux2FlexEditInput["image_size"] = "landscape_4_3";

// How closely the model follows the prompt. Lower = more freedom.
const GUIDANCE_SCALE = 3.5;

// Number of denoising steps. Higher = more detail but slower/costlier.
const NUM_INFERENCE_STEPS = 28;

// Set a number to make results reproducible, or leave undefined for random.
const SEED: number | undefined = undefined;

const OUTPUT_FORMAT: Flux2FlexEditInput["output_format"] = "png";

// 1 = strictest, 5 = most permissive.
const SAFETY_TOLERANCE: Flux2FlexEditInput["safety_tolerance"] = "2";

const OUTPUT_DIR = "output";
const OUTPUT_FILE = "floor-plan-3d.png";

// ============================================================================
// Helpers
// ============================================================================

function mimeTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download generated image (HTTP ${response.status}): ${url}`
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destPath, buffer);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error(
      "Usage: npx tsx scripts/test-floorplan-3d.ts <path-to-2d-floor-plan-image>"
    );
    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);
  if (!existsSync(inputPath)) {
    console.error(`Input image not found: ${inputPath}`);
    process.exit(1);
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.error(
      "FAL_KEY is not set. Add FAL_KEY=<your fal.ai key> to a .env file or export it in your shell."
    );
    process.exit(1);
  }

  fal.config({ credentials: apiKey });
  console.log(`Model: ${FAL_MODEL_ID}`);
  console.log(`Input image: ${inputPath}`);

  // 1. Upload the floor plan to fal.ai storage.
  console.log("Uploading input image to fal.ai ...");
  let imageUrl: string;
  try {
    const buffer = await readFile(inputPath);
    const blob = new Blob([new Uint8Array(buffer)], {
      type: mimeTypeFor(inputPath),
    });
    imageUrl = await fal.storage.upload(blob);
    console.log(`Uploaded image URL: ${imageUrl}`);
  } catch (error) {
    console.error("Image upload to fal.ai failed:", error);
    process.exit(1);
  }

  // 2. Build the generation input.
  const input: Flux2FlexEditInput = {
    prompt: PROMPT,
    image_urls: [imageUrl],
    image_size: IMAGE_SIZE,
    guidance_scale: GUIDANCE_SCALE,
    num_inference_steps: NUM_INFERENCE_STEPS,
    output_format: OUTPUT_FORMAT,
    safety_tolerance: SAFETY_TOLERANCE,
    ...(SEED !== undefined ? { seed: SEED } : {}),
  };

  // 3. Run the generation and wait for the result.
  console.log("Generating 3D visualization (this can take a minute or two) ...");
  let result: Flux2FlexEditOutput;
  try {
    const response = await fal.subscribe(FAL_MODEL_ID, {
      input,
      onQueueUpdate(update) {
        if (update.status === "IN_PROGRESS" || update.status === "COMPLETED") {
          if (update.logs.length > 0) {
            console.log(`  ${update.logs.map((log) => log.message).join(" ")}`);
          }
        }
      },
    });
    result = response.data;
  } catch (error) {
    console.error("fal.ai generation failed:", error);
    process.exit(1);
  }

  const image = result.images?.[0];
  if (!image?.url) {
    console.error(
      "fal.ai response did not contain an output image:",
      JSON.stringify(result, null, 2)
    );
    process.exit(1);
  }

  console.log(`Generated image URL: ${image.url}`);

  // 4. Download the result locally.
  await mkdir(OUTPUT_DIR, { recursive: true });
  const destPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  try {
    await downloadToFile(image.url, destPath);
    console.log(`Saved to: ${destPath}`);
  } catch (error) {
    console.error("Downloading the generated image failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});