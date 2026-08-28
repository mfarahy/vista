import { JobDispatcher } from './dispatcher.js';
import { testJobHandler } from './handlers/test-job.js';
import { documentProcessingHandler } from './handlers/document-processing.js';
import { floorplan3DHandler } from './handlers/floorplan-3d.js';

/**
 * Builds the default dispatcher with the handlers implemented so far. Future
 * job types are registered here as they are added.
 */
export function createDefaultDispatcher(): JobDispatcher {
  return new JobDispatcher()
    .register('test-job', testJobHandler)
    .register('document-processing', documentProcessingHandler)
    .register('floorplan-3d', floorplan3DHandler);
}
