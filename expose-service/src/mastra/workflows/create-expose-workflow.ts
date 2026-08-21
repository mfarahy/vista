import type { PropertyExposeData } from '../../lib/expose-data.js';
import { propertyExposeDataSchema } from '../../lib/expose-data.js';
import {
  generatePropertyExposeContent,
  preparePropertyExposeData,
} from '../agents/property-expose-agent.js';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import {
  validatePropertyDataInputSchema,
  generateExposeContentOutputSchema,
  prepareExposeDataOutputSchema,
} from '../schemas/index.js';
import { researchLocation, validateLocationResearch } from '../agents/location-research-agent.js';
import { getLogger } from '../../lib/logger.js';

const validatePropertyData = createStep({
  id: 'ValidatePropertyData',
  inputSchema: validatePropertyDataInputSchema,
  outputSchema: validatePropertyDataInputSchema,
  execute: async ({ inputData }) => ({
    property: propertyExposeDataSchema.parse(inputData.property),
  }),
});
const prepareData = createStep({
  id: 'PrepareExposeData',
  inputSchema: validatePropertyDataInputSchema,
  outputSchema: prepareExposeDataOutputSchema,
  execute: async ({ inputData }) => preparePropertyExposeData(inputData.property),
});
const resolveLocationStep = createStep({
  id: 'ResolveLocation',
  inputSchema: prepareExposeDataOutputSchema,
  outputSchema: prepareExposeDataOutputSchema,
  execute: async ({ inputData }) => {
    return inputData;
  },
});
const researchLocationStep = createStep({
  id: 'ResearchLocation',
  inputSchema: prepareExposeDataOutputSchema,
  outputSchema: prepareExposeDataOutputSchema,
  execute: async ({ inputData }) => {
    const address = inputData.property.location.address;
    if (
      !address.city ||
      !address.postalCode ||
      (!process.env.TAVILY_API_KEY && process.env.NODE_ENV !== 'test')
    )
      return inputData;
    try {
      const research = await researchLocation({
        propertyId: inputData.property.basicInformation.title || 'expose-property',
        address: [address.street, address.houseNumber, address.postalCode, address.city]
          .filter(Boolean)
          .join(' '),
        city: address.city,
        district: inputData.property.location.district || address.district || undefined,
        neighborhood: inputData.property.location.neighborhood || undefined,
        postalCode: address.postalCode,
        country: address.country,
        latitude: inputData.property.location.latitude ?? undefined,
        longitude: inputData.property.location.longitude ?? undefined,
      });
      return {
        ...inputData,
        property: {
          ...inputData.property,
          location: {
            ...inputData.property.location,
            research: validateLocationResearch(research),
          },
        },
      };
    } catch (error) {
      getLogger().warn(
        { err: error },
        'Location research failed; continuing without research in workflow',
      );
      return inputData;
    }
  },
});
const generateContent = createStep({
  id: 'GenerateExposeContent',
  inputSchema: prepareExposeDataOutputSchema,
  outputSchema: generateExposeContentOutputSchema,
  execute: async ({ inputData }) => generatePropertyExposeContent(inputData.property),
});

export const createExposeMastraWorkflow = createWorkflow({
  id: 'create-expose-workflow',
  inputSchema: validatePropertyDataInputSchema,
  outputSchema: generateExposeContentOutputSchema,
})
  .then(validatePropertyData)
  .then(prepareData)
  .then(resolveLocationStep)
  .then(researchLocationStep)
  .then(generateContent)
  .commit();

export async function createExposeWorkflow(property: unknown) {
  const validatedProperty = propertyExposeDataSchema.parse(property);
  return generatePropertyExposeContent(validatedProperty);
}

export type CreateExposeWorkflowInput = PropertyExposeData;
