import { z } from "zod";
import { propertyExposeDataSchema } from "../../lib/expose-data.js";
import { exposeContentSchema } from "./expose-content.js";

export const validatePropertyDataInputSchema = z.object({ property: propertyExposeDataSchema });
export const prepareExposeDataOutputSchema = z.object({ property: propertyExposeDataSchema, ready: z.boolean() });
export const generateExposeContentOutputSchema = z.object({ property: propertyExposeDataSchema, content: exposeContentSchema });
export type ValidatePropertyDataInput = z.infer<typeof validatePropertyDataInputSchema>;
export type PrepareExposeDataOutput = z.infer<typeof prepareExposeDataOutputSchema>;
export type GenerateExposeContentOutput = z.infer<typeof generateExposeContentOutputSchema>;
export { exposeContentSchema, validateExposeContent, validateExposeContentReferences } from "./expose-content.js";
export type { ExposeContent } from "./expose-content.js";
