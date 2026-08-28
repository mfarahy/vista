import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { callMeltFlex, MELTFLEX_API_URL } from './meltflex-provider.js';

function mockFetch(response: { status: number; body: unknown; ok?: boolean }) {
  return async (url: string, init: RequestInit) => {
    assert.equal(url, MELTFLEX_API_URL);
    assert.equal(init.method, 'POST');
    const headers = init.headers as Record<string, string>;
    assert.ok(headers.Authorization?.startsWith('Bearer '));
    assert.equal(headers['Content-Type'], 'application/json');
    const body = JSON.parse(init.body as string);
    assert.ok(body.image?.startsWith('data:image/png;base64,'));
    return {
      ok: response.ok ?? (response.status >= 200 && response.status < 300),
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    } as unknown as Response;
  };
}

describe('callMeltFlex', () => {
  const buffer = Buffer.from('fake-image');
  const apiKey = 'test-key';

  it('returns modelUrl on success', async () => {
    const result = await callMeltFlex(buffer, 'image/png', {
      apiKey,
      fetchImpl: mockFetch({ status: 200, body: { success: true, modelUrl: 'https://cdn.example.com/model.glb', format: 'glb', creditsUsed: 10 } }) as unknown as typeof fetch,
    });
    assert.equal(result.modelUrl, 'https://cdn.example.com/model.glb');
    assert.equal(result.format, 'glb');
    assert.equal(result.creditsUsed, 10);
  });

  it('returns fallback base64 model when modelUrl missing', async () => {
    const base64 = Buffer.from('glb-bytes').toString('base64');
    const result = await callMeltFlex(buffer, 'image/png', {
      apiKey,
      fetchImpl: mockFetch({ status: 200, body: { success: true, model: base64, format: 'glb' } }) as unknown as typeof fetch,
    });
    assert.equal(result.model, base64);
    assert.equal(result.modelUrl, undefined);
  });

  it('throws unauthorized on 401', async () => {
    await assert.rejects(
      () =>
        callMeltFlex(buffer, 'image/png', {
          apiKey,
          fetchImpl: mockFetch({ status: 401, body: { error: 'unauthorized' } }) as unknown as typeof fetch,
        }),
      (err: Error) => {
        assert.match(err.message, /authentication failed/i);
        assert.equal((err as unknown as { status: number }).status, 401);
        return true;
      },
    );
  });

  it('throws insufficient credits on 402', async () => {
    await assert.rejects(
      () =>
        callMeltFlex(buffer, 'image/png', {
          apiKey,
          fetchImpl: mockFetch({ status: 402, body: { error: 'no credits' } }) as unknown as typeof fetch,
        }),
      (err: Error) => {
        assert.equal((err as unknown as { status: number }).status, 402);
        return true;
      },
    );
  });

  it('throws on conversion failure (malformed response missing both url and model)', async () => {
    await assert.rejects(
      () =>
        callMeltFlex(buffer, 'image/png', {
          apiKey,
          fetchImpl: mockFetch({ status: 200, body: { success: true, format: 'glb' } }) as unknown as typeof fetch,
        }),
      (err: Error) => {
        assert.match(err.message, /missing modelUrl/i);
        return true;
      },
    );
  });

  it('throws on malformed JSON', async () => {
    const badFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('bad json');
        },
        text: async () => 'not json',
      }) as unknown as Response;
    await assert.rejects(
      () => callMeltFlex(buffer, 'image/png', { apiKey, fetchImpl: badFetch as unknown as typeof fetch }),
      (err: Error) => {
        assert.match(err.message, /non-JSON/i);
        return true;
      },
    );
  });

  it('throws timeout when aborted', async () => {
    const abortFetch = async (_url: string, init: RequestInit) => {
      // simulate abort
      await new Promise<void>((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
      throw new Error('unreachable');
    };
    await assert.rejects(
      () => callMeltFlex(buffer, 'image/png', { apiKey, timeoutMs: 10, fetchImpl: abortFetch as unknown as typeof fetch }),
      (err: Error) => {
        assert.match(err.message, /timed out/i);
        return true;
      },
    );
  });

  it('throws on 429 rate limited', async () => {
    await assert.rejects(
      () =>
        callMeltFlex(buffer, 'image/png', {
          apiKey,
          fetchImpl: mockFetch({ status: 429, body: { error: 'rate' } }) as unknown as typeof fetch,
        }),
      (err: Error) => {
        assert.equal((err as unknown as { status: number }).status, 429);
        return true;
      },
    );
  });

  it('throws on 500 server error', async () => {
    await assert.rejects(
      () =>
        callMeltFlex(buffer, 'image/png', {
          apiKey,
          fetchImpl: mockFetch({ status: 500, body: { error: 'oops' } }) as unknown as typeof fetch,
        }),
      (err: Error) => {
        assert.equal((err as unknown as { status: number }).status, 500);
        return true;
      },
    );
  });
});
