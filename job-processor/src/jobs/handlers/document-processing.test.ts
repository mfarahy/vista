import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeDocumentProcessingHandler } from './document-processing.js';
import { getLogger } from '../../lib/logger.js';
import type { DocumentProcessingClient } from './document-processing-client.js';

function fakeClient(): {
  state: {
    ocrCalls: string[];
    understandCalls: string[];
    ocrStatuses: Map<string, string>;
    ocrError?: Error;
  };
  client: DocumentProcessingClient;
} {
  const state = {
    ocrCalls: [] as string[],
    understandCalls: [] as string[],
    ocrStatuses: new Map<string, string>(),
    ocrError: undefined as Error | undefined,
  };
  const client: DocumentProcessingClient = {
    ocr: async (id) => {
      state.ocrCalls.push(id);
      if (state.ocrError) throw state.ocrError;
      return { record: { id, status: state.ocrStatuses.get(id) ?? 'completed' } };
    },
    understand: async (id) => {
      state.understandCalls.push(id);
      return { record: { id, status: 'completed' } };
    },
  };
  return { state, client };
}

function context(payload: unknown, updates: Array<Record<string, unknown>>) {
  return {
    job: { jobId: 'job-1', jobType: 'document-processing', payload, metadata: undefined },
    update: async (patch: Record<string, unknown>) => {
      updates.push(patch);
    },
    log: getLogger(),
  };
}

describe('document-processing handler', () => {
  it('reports per-step progress and completes for every document', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const fake = fakeClient();
    const handler = makeDocumentProcessingHandler(fake.client);

    const result = await handler(context({ documentIds: ['doc-a', 'doc-b'] }, updates));

    assert.deepEqual(result, { message: 'Processed 2 document(s)' });
    assert.deepEqual(fake.state.ocrCalls, ['doc-a', 'doc-b']);
    assert.deepEqual(fake.state.understandCalls, ['doc-a', 'doc-b']);

    assert.deepEqual(
      updates.map((u) => u.currentStep),
      ['ocr', 'understanding', 'ocr', 'understanding', 'done'],
    );
    assert.deepEqual(
      updates.map((u) => u.progress),
      [0, 50, 50, 100, 100],
    );
    assert.equal(updates[updates.length - 1].message, 'Processed 2 document(s)');
  });

  it('contains a failed document and still completes the job', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const fake = fakeClient();
    fake.state.ocrStatuses.set('doc-bad', 'failed');
    const handler = makeDocumentProcessingHandler(fake.client);

    const result = await handler(context({ documentIds: ['doc-ok', 'doc-bad'] }, updates));

    assert.match(result.message ?? '', /Processed 1 of 2 document/);
    // The failed document is not sent to the understanding stage.
    assert.deepEqual(fake.state.understandCalls, ['doc-ok']);
  });

  it('throws when every document fails (job is marked failed)', async () => {
    const fake = fakeClient();
    fake.state.ocrError = new Error('boom');
    const handler = makeDocumentProcessingHandler(fake.client);

    await assert.rejects(
      () => Promise.resolve().then(() => handler(context({ documentIds: ['doc-a'] }, []))),
      /All 1 document\(s\) failed to process: boom/,
    );
  });

  it('includes the persisted OCR error in the job failure message', async () => {
    const fake = fakeClient();
    fake.state.ocrError = new Error(
      'Google Document AI configuration is incomplete; missing GOOGLE_DOCUMENT_AI_PROCESSOR_ID.',
    );
    const handler = makeDocumentProcessingHandler(fake.client);

    await assert.rejects(
      () => Promise.resolve().then(() => handler(context({ documentIds: ['doc-a'] }, []))),
      /All 1 document\(s\) failed to process: Google Document AI configuration is incomplete/,
    );
  });

  it('accepts a single documentId', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const fake = fakeClient();
    const handler = makeDocumentProcessingHandler(fake.client);

    await handler(context({ documentId: 'only' }, updates));

    assert.deepEqual(fake.state.ocrCalls, ['only']);
    assert.equal(updates[updates.length - 1].currentStep, 'done');
    assert.equal(updates[updates.length - 1].progress, 100);
  });

  it('throws when no document ids are provided', async () => {
    const fake = fakeClient();
    const handler = makeDocumentProcessingHandler(fake.client);
    await assert.rejects(
      () => Promise.resolve().then(() => handler(context({}, []))),
      /document-processing: payload must provide documentIds or documentId/,
    );
  });
});
