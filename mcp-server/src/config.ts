/**
 * Environment-based configuration for the Vista MCP supervisor server.
 */
export interface Config {
  /** Base URL of the running Vista agent-bridge HTTP server. */
  agentBridgeUrl: string;
  /** Address the MCP (Streamable HTTP) server binds to. */
  host: string;
  /** Port the MCP server listens on. */
  port: number;
  logLevel: string;
  logFormat: 'json' | 'text';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    agentBridgeUrl: (env.AGENT_BRIDGE_URL || 'http://127.0.0.1:4200').replace(/\/$/, ''),
    host: env.MCP_HOST || '127.0.0.1',
    port: Number(env.MCP_PORT || 4300),
    logLevel: env.LOG_LEVEL || 'info',
    logFormat: (env.LOG_FORMAT || 'text') === 'json' ? 'json' : 'text',
  };
}
