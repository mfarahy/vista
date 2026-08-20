import { createStep, createWorkflow } from "@mastra/core/workflows";
import { locationResearchInputSchema, locationResearchSchema } from "../schemas/location-research.js";
import { researchLocation, validateLocationResearch } from "../agents/location-research-agent.js";

const validateInput = createStep({
  id: "ValidateLocationInput",
  inputSchema: locationResearchInputSchema,
  outputSchema: locationResearchInputSchema,
  execute: async ({ inputData }) => locationResearchInputSchema.parse(inputData),
});

const research = createStep({
  id: "ResearchLocation",
  inputSchema: locationResearchInputSchema,
  outputSchema: locationResearchSchema,
  execute: async ({ inputData }) => researchLocation(inputData),
});

const validateResearch = createStep({
  id: "ValidateResearch",
  inputSchema: locationResearchSchema,
  outputSchema: locationResearchSchema,
  execute: async ({ inputData }) => validateLocationResearch(inputData),
});

export const locationResearchWorkflow = createWorkflow({
  id: "location-research-workflow",
  inputSchema: locationResearchInputSchema,
  outputSchema: locationResearchSchema,
}).then(validateInput).then(research).then(validateResearch).commit();

export async function runLocationResearch(input: unknown, options?: { refresh?: boolean }) {
  const validated = locationResearchInputSchema.parse(input);
  return validateLocationResearch(await researchLocation(validated, options));
}
