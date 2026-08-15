import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { DebugEventSchema, PROTOCOL_VERSION, SessionHelloSchema } from '@mpxjs/debug-protocol';
import { EventStore } from './events.js';
import { createSessionId, SessionManager } from './session.js';

export const DEBUG_SERVER_VERSION = '0.0.0';

export interface DebugServerOptions {
  host?: string;
  port?: number;
  version?: string;
  token?: string;
}

export interface DebugServerHealth {
  status: 'running';
  version: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    debugToken: string;
    eventStore: EventStore;
  }
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

const DEBUG_SERVER_WELCOME = JSON.stringify({ type: 'server.welcome' });
const SESSION_REJECTED = JSON.stringify({
  type: 'session.rejected',
  reason: 'invalid-session-hello'
});
const SESSION_TOKEN_REJECTED = JSON.stringify({
  type: 'session.rejected',
  reason: 'invalid-session-token'
});
const EVENT_REJECTED = JSON.stringify({
  type: 'event.rejected',
  reason: 'invalid-event'
});

/** Generates a high-entropy token used to authenticate runtime connections. */
function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** Creates the local debug HTTP server without opening a listening socket. */
export function createDebugServer(options: DebugServerOptions = {}): FastifyInstance {
  const server = Fastify({ logger: false });
  const version = options.version ?? DEBUG_SERVER_VERSION;
  const token = options.token ?? generateSessionToken();
  const sessions = new SessionManager();
  const events = new EventStore();

  server.decorate('debugToken', token);
  server.decorate('eventStore', events);

  server.get('/', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(DEBUG_HOME_HTML);
  });

  server.get('/health', async (): Promise<DebugServerHealth> => ({
    status: 'running',
    version
  }));

  server.get('/api/session', async () => sessions.get());

  server.get('/api/events', async () => events.list());

  server.register(async (instance) => {
    await instance.register(websocket);

    instance.get('/ws', { websocket: true }, (socket) => {
      socket.send(DEBUG_SERVER_WELCOME);
      socket.on('message', (rawMessage) => {
        const now = Date.now();

        if (sessions.get() !== null) {
          let event: unknown;

          try {
            event = JSON.parse(rawMessage.toString());
          } catch {
            socket.send(EVENT_REJECTED);
            return;
          }

          const parsed = DebugEventSchema.safeParse(event);

          if (!parsed.success) {
            socket.send(EVENT_REJECTED);
            return;
          }

          events.append(parsed.data);
          sessions.touch(now);
          return;
        }

        let message: unknown;

        try {
          message = JSON.parse(rawMessage.toString());
        } catch {
          socket.send(SESSION_REJECTED);
          socket.close(1008, 'Invalid session hello.');
          return;
        }

        const hello = SessionHelloSchema.safeParse(message);

        if (!hello.success || hello.data.protocolVersion !== PROTOCOL_VERSION) {
          socket.send(SESSION_REJECTED);
          socket.close(1008, 'Invalid session hello.');
          return;
        }

        if (hello.data.token !== token) {
          socket.send(SESSION_TOKEN_REJECTED);
          socket.close(1008, 'Invalid session token.');
          return;
        }

        const session = sessions.register({
          sessionId: createSessionId(),
          buildId: hello.data.buildId,
          target: hello.data.target,
          now
        });

        socket.send(JSON.stringify({ type: 'session.accepted', sessionId: session.sessionId }));
      });

      socket.on('close', () => {
        sessions.disconnect();
      });
    });
  });

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
