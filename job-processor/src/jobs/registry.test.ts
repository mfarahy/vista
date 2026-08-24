import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDefaultDispatcher } from './registry.js';

describe('default dispatcher registry', () => {
  it('registers the document-processing handler', () => {
    const dispatcher = createDefaultDispatcher();
    assert.ok(dispatcher.has('document-processing'));
    assert.ok(dispatcher.has('test-job'));
    assert.ok(dispatcher.list().includes('document-processing'));
  });
});
