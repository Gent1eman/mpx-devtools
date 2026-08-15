import Fastify, { type FastifyInstance } from 'fastify';

export const DEBUG_SERVER_VERSION = '0.0.0';

export interface DebugServerOptions {
  host?: string;
  port?: number;
  version?: string;
}

export interface DebugServerHealth {
  status: 'running';
  version: string;
}

/** Creates the local debug HTTP server without opening a listening socket. */
export function createDebugServer(options: DebugServerOptions = {}): FastifyInstance {
  const server = Fastify({ logger: false });
  const version = options.version ?? DEBUG_SERVER_VERSION;

  server.get('/health', async (): Promise<DebugServerHealth> => ({
    status: 'running',
    version
  }));

  return server;
}

/** Starts the local debug HTTP server with loopback-only defaults. */
export async function startDebugServer(options: DebugServerOptions = {}): Promise<FastifyInstance> {
  const server = createDebugServer(options);

  await server.listen({
    host: options.host ?? '127.0.0.1',
    port: options.port ?? 4399
  });

  return server;
}
