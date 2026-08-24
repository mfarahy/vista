import { JobDispatcher } from './dispatcher.js';
import { testJobHandler } from './handlers/test-job.js';
import { documentProcessingHandler } from './handlers/document-processing.js';

/**
 * Builds the default dispatcher with the handlers implemented so far. Future
 * job types are registered here as they are added.
 */
export function createDefaultDispatcher(): JobDispatcher {
  return new JobDispatcher()
    .register('test-job', testJobHandler)
    .register('document-processing', documentProcessingHandler);
}
