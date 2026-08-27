import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AssistantMessage, Part } from '@opencode-ai/sdk';
import {
  classifySdkError,
  extractPromptText,
  messageErrorText,
  OpenCodeApiError,
  OpenCodeNotFoundError,
  OpenCodeTimeoutError,
  OpenCodeUnavailableError,
} from './opencode.js';

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    id: 'part-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'text',
    text: 'hello',
    ...overrides,
  } as Part;
}

describe('extractPromptText', () => {
  it('joins all text parts', () => {
    const parts = [
      makePart({ text: 'first' }),
      makePart({ type: 'reasoning', text: 'thinking' } as Partial<Part>),
      makePart({ id: 'part-2', text: 'second' }),
    ];
    assert.equal(extractPromptText(parts), 'first\nsecond');
  });

  it('returns empty string when there are no text parts', () => {
    assert.equal(extractPromptText([]), '');
  });
});

describe('messageErrorText', () => {
  it('extracts a message from a structured error', () => {
    const info = {
      error: { message: 'provider not configured' },
    } as unknown as AssistantMessage;
    assert.equal(messageErrorText(info), 'provider not configured');
  });

  it('falls back for missing error details', () => {
    const info = {} as AssistantMessage;
    assert.equal(messageErrorText(info), 'agent run failed');
  });
});

describe('classifySdkError', () => {
  it('maps an abort to a timeout error', () => {
    const error = classifySdkError(new Error('aborted'), true);
    assert.ok(error instanceof OpenCodeTimeoutError);
  });

  it('maps a 404 status to not found', () => {
    const error = classifySdkError(new Error('nope', { cause: { status: 404 } }), false);
    assert.ok(error instanceof OpenCodeNotFoundError);
  });

  it('maps other statuses to API errors', () => {
    const error = classifySdkError(new Error('boom', { cause: { status: 500 } }), false);
    assert.ok(error instanceof OpenCodeApiError);
    assert.equal(error.status, 500);
  });

  it('maps network failures to unavailable', () => {
    const error = classifySdkError(new TypeError('fetch failed'), false);
    assert.ok(error instanceof OpenCodeUnavailableError);
  });
});
