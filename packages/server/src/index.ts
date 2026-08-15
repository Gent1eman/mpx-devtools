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

const DEBUG_HOME_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Mpx DevTools</title>
  </head>
  <body>
    <main>
      <h1>Mpx DevTools</h1>
      <p>Local debug server is running.</p>
      <p>Health endpoint: <a href="/health">/health</a></p>
    </main>
  </body>
</html>`;

/** Creates the local debug HTTP server without opening a listening socket. */
export function createDebugServer(options: DebugServerOptions = {}): FastifyInstance {
  const server = Fastify({ logger: false });
  const version = options.version ?? DEBUG_SERVER_VERSION;

  server.get('/', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(DEBUG_HOME_HTML);
  });

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
