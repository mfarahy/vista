import dotenv from 'dotenv';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Express } from 'express';
import { loadConfig } from './config.js';
import { getLogger } from './lib/logger.js';
import { createAgentBridgeClient } from './lib/bridge.js';
import { createMcpServer } from './tools.js';

dotenv.config();

/**
 * Stateless MCP supervisor server. Every request creates a fresh transport and
 * a fresh McpServer whose three tools forward to the Vista agent bridge. No
 * sessions, no database, no OpenCode/screenshot logic of its own.
 */
function createHttpApp({ bridgeUrl, host }: { bridgeUrl: string; host: string }): Express {
  const log = getLogger();
  const bridge = createAgentBridgeClient(bridgeUrl);
  const app = createMcpExpressApp({ host });

  app.post('/mcp', async (req, res) => {
    const server = createMcpServer(bridge, { bridgeUrl });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    // One server + one transport per request (stateless). Tear both down once
    // the response fully closes (also covers SSE streams and client disconnects)
    // so no state leaks between independent MCP calls.
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log.error(
        { err: error },
        'MCP request failed: %s',
        error instanceof Error ? error.message : String(error),
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
  });

  app.delete('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
  });

  return app;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const log = getLogger();

  log.info(
    { agentBridgeUrl: config.agentBridgeUrl, host: config.host, port: config.port },
    'Starting Vista MCP server: bridge=%s listen=%s:%s',
    config.agentBridgeUrl,
    config.host,
    config.port,
  );

  const app = createHttpApp({ bridgeUrl: config.agentBridgeUrl, host: config.host });
  const server = app.listen(config.port, config.host, () => {
    log.info(
      { host: config.host, port: config.port },
      'Vista MCP server listening on %s:%s (Streamable HTTP, stateless)',
      config.host,
      config.port,
    );
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Received %s, shutting down', signal);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    log.info('Vista MCP server stopped');
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  getLogger().error({ err: error }, 'Vista MCP server failed to start: %s', String(error));
  process.exit(1);
});
