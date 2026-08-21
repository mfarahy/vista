import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { mastraLogLevel } from '../lib/logger.js';
import { propertyExposeAgent } from './agents/property-expose-agent.js';
import { createExposeMastraWorkflow } from './workflows/create-expose-workflow.js';
import { locationResearchAgent } from './agents/location-research-agent.js';
import { locationResearchWorkflow } from './workflows/location-research-workflow.js';

export { propertyExposeAgent } from './agents/property-expose-agent.js';
export {
  locationResearchAgent,
  researchLocation,
  validateLocationResearch,
} from './agents/location-research-agent.js';
export { generatePropertyExposeContent } from './agents/property-expose-agent.js';
export {
  createExposeWorkflow,
  createExposeMastraWorkflow,
} from './workflows/create-expose-workflow.js';
export {
  locationResearchWorkflow,
  runLocationResearch,
} from './workflows/location-research-workflow.js';
export * from './schemas/index.js';

export const mastra = new Mastra({
  logger: createLogger({ name: 'mastra', level: mastraLogLevel() }),
  agents: { propertyExposeAgent, locationResearchAgent },
  workflows: { createExposeWorkflow: createExposeMastraWorkflow, locationResearchWorkflow },
});
