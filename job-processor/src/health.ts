import http from 'node:http';
import { loadConfig } from './config.js';
import { getLogger } from './lib/logger.js';
import { natsConnected } from './nats.js';

/**
 * Minimal HTTP server exposing /health and /ready for k8s probes. The worker
 * itself has no REST API; this keeps probes consistent with the other services.
 */
export function startHealthServer(): http.Server {
  const config = loadConfig();
  const log = getLogger();

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'vista-job-processor' }));
      return;
    }
    if (req.url === '/ready') {
      const ready = natsConnected();
      const code = ready ? 200 : 503;
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ status: ready ? 'ready' : 'not-ready', service: 'vista-job-processor' }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(config.port, config.host, () => {
    log.info({ host: config.host, port: config.port }, 'Health server listening on {host}:{port}');
  });
  return server;
}
