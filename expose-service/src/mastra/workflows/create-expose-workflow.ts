import type { PropertyExposeData } from "../../lib/expose-data.js";
import { propertyExposeDataSchema } from "../../lib/expose-data.js";
import { generatePropertyExposeContent, preparePropertyExposeData } from "../agents/property-expose-agent.js";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { validatePropertyDataInputSchema, generateExposeContentOutputSchema, prepareExposeDataOutputSchema } from "../schemas/index.js";
import { resolveLocation } from "../../lib/location-service.js";

const validatePropertyData = createStep({
  id: "ValidatePropertyData",
  inputSchema: validatePropertyDataInputSchema,
  outputSchema: validatePropertyDataInputSchema,
  execute: async ({ inputData }) => ({ property: propertyExposeDataSchema.parse(inputData.property) }),
});
const prepareData = createStep({
  id: "PrepareExposeData",
  inputSchema: validatePropertyDataInputSchema,
  outputSchema: prepareExposeDataOutputSchema,
  execute: async ({ inputData }) => preparePropertyExposeData(inputData.property),
});
const resolveLocationStep = createStep({
  id: "ResolveLocation",
  inputSchema: prepareExposeDataOutputSchema,
  outputSchema: prepareExposeDataOutputSchema,
  execute: async ({ inputData }) => {
    // Resolution is deterministic; Phase 5 can consume this prepared location without adding research here.
    const result = await resolveLocation(inputData.property);
    return { ...inputData, property: result };
  },
});
const generateContent = createStep({
  id: "GenerateExposeContent",
  inputSchema: prepareExposeDataOutputSchema,
  outputSchema: generateExposeContentOutputSchema,
  execute: async ({ inputData }) => generatePropertyExposeContent(inputData.property),
});

export const createExposeMastraWorkflow = createWorkflow({
  id: "create-expose-workflow",
  inputSchema: validatePropertyDataInputSchema,
  outputSchema: generateExposeContentOutputSchema,
}).then(validatePropertyData).then(prepareData).then(resolveLocationStep).then(generateContent).commit();

export async function createExposeWorkflow(property: unknown) {
  const validatedProperty = propertyExposeDataSchema.parse(property);
  return generatePropertyExposeContent(await resolveLocation(validatedProperty));
}

export type CreateExposeWorkflowInput = PropertyExposeData;
