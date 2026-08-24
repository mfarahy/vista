import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type express from 'express';

type ServeCorsOptions = {
  environment?: Record<string, string | undefined>;
};

async function serveCors(options: ServeCorsOptions = {}): Promise<{
  origin: string;
  stop: () => Promise<void>;
}> {
  const previous = process.env.CORS_ORIGIN;
  if (options.environment) {
    for (const [key, value] of Object.entries(options.environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const { createApp } = await import('./app.js');
  const app: express.Express = createApp({});
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;

  if (options.environment) {
    // Restore the environment only after the app captured its config.
    for (const key of Object.keys(options.environment)) {
      if (previous !== undefined) process.env[key] = previous;
      else delete process.env[key];
    }
  }

  return {
    origin: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function corsRequest(baseUrl: string, origin: string): Promise<Response> {
  return fetch(`${baseUrl}/api/properties`, {
    method: 'POST',
    headers: { origin },
  });
}

describe('CORS', () => {
  it('falls back to reflecting any origin when CORS_ORIGIN is unset (dev)', async () => {
    const { origin, stop } = await serveCors();
    try {
      const response = await corsRequest(origin, 'http://localhost:3000');
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    } finally {
      await stop();
    }
  });

  it('allows an exact configured origin', async () => {
    const { origin, stop } = await serveCors({
      environment: { CORS_ORIGIN: 'https://gmalen.com' },
    });
    try {
      const response = await corsRequest(origin, 'https://gmalen.com');
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://gmalen.com');
    } finally {
      await stop();
    }
  });

  it('treats the bare and www. variants of a configured origin interchangeably', async () => {
    const { origin, stop } = await serveCors({
      environment: { CORS_ORIGIN: 'https://gmalen.com' },
    });
    try {
      for (const configured of ['https://www.gmalen.com', 'https://gmalen.com']) {
        const response = await corsRequest(origin, configured);
        assert.equal(
          response.headers.get('access-control-allow-origin'),
          configured,
          `expected ${configured} to be allowed`,
        );
      }
    } finally {
      await stop();
    }
  });

  it('supports a comma-separated allowlist', async () => {
    const { origin, stop } = await serveCors({
      environment: { CORS_ORIGIN: 'https://example.com, https://gmalen.com' },
    });
    try {
      for (const configured of ['https://example.com', 'https://www.gmalen.com']) {
        const response = await corsRequest(origin, configured);
        assert.equal(response.headers.get('access-control-allow-origin'), configured);
      }
    } finally {
      await stop();
    }
  });

  it('rejects origins outside the allowlist', async () => {
    const { origin, stop } = await serveCors({
      environment: { CORS_ORIGIN: 'https://gmalen.com' },
    });
    try {
      const response = await corsRequest(origin, 'https://attacker.example.com');
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    } finally {
      await stop();
    }
  });

  it('answers CORS preflight requests for an allowed origin', async () => {
    const { origin, stop } = await serveCors({
      environment: { CORS_ORIGIN: 'https://www.gmalen.com' },
    });
    try {
      const response = await fetch(`${origin}/api/properties`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://gmalen.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://gmalen.com');
      assert.equal(response.headers.get('access-control-allow-methods'), 'GET,HEAD,PUT,PATCH,POST,DELETE');
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    } finally {
      await stop();
    }
  });
});