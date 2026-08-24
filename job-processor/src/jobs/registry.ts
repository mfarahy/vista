import { JobDispatcher } from './dispatcher.js';
import { testJobHandler } from './handlers/test-job.js';

/**
 * Builds the default dispatcher with the handlers implemented so far. Future
 * job types (e.g. document processing) are registered here as they are added.
 */
export function createDefaultDispatcher(): JobDispatcher {
  return new JobDispatcher().register('test-job', testJobHandler);
}
