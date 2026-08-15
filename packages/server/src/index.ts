import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import {
  DebugEventSchema,
  PROTOCOL_VERSION,
  SessionHelloSchema,
  type DebugEvent
} from '@mpxjs/debug-protocol';
import type WebSocket from 'ws';
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
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; background: #f5f6f8; color: #1f2328; }
      h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
      .status { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
      .pill { padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.8rem; background: #e5e7eb; color: #374151; }
      .pill.connected { background: #dcfce7; color: #166534; }
      .pill.disconnected { background: #fee2e2; color: #991b1b; }
      #events { list-style: none; padding: 0; margin: 0; }
      #events li { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.5rem 0.75rem; margin-bottom: 0.4rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; }
      #events li .type { font-weight: 600; }
      .muted { color: #6b7280; font-size: 0.85rem; }
    </style>
  </head>
  <body>
    <h1>Mpx DevTools</h1>
    <div class="status">
      <span id="server" class="pill">server: …</span>
      <span id="session" class="pill">runtime: …</span>
      <span id="ws" class="pill">ui stream: connecting…</span>
    </div>
    <p class="muted">Runtime events appear below in real time (server push over /ws/ui).</p>
    <ul id="events"></ul>

    <script>
      var eventsEl = document.getElementById('events');
      var serverEl = document.getElementById('server');
      var sessionEl = document.getElementById('session');
      var wsEl = document.getElementById('ws');

      function addEvent(event) {
        var li = document.createElement('li');
        var time = new Date(event.timestamp).toISOString();
        var probe = event.probeId ? ' probe=' + event.probeId : '';
        var label = document.createElement('span');
        label.className = 'type';
        label.textContent = event.type;
        li.appendChild(label);
        li.appendChild(document.createTextNode('  id=' + event.eventId + probe + '  @' + time));
        eventsEl.prepend(li);
        while (eventsEl.children.length > 200) eventsEl.removeChild(eventsEl.lastChild);
      }

      async function refreshStatus() {
        try {
          var health = await fetch('/health').then(function (r) { return r.json(); });
          serverEl.textContent = 'server: ' + health.version;
          serverEl.className = 'pill connected';
        } catch (err) {
          serverEl.textContent = 'server: down';
          serverEl.className = 'pill disconnected';
        }
        try {
          var session = await fetch('/api/session').then(function (r) { return r.json(); });
          if (session && session.connected) {
            sessionEl.textContent = 'runtime: connected (' + session.target + ')';
            sessionEl.className = 'pill connected';
          } else {
            sessionEl.textContent = 'runtime: not connected';
            sessionEl.className = 'pill disconnected';
          }
        } catch (err) {
          sessionEl.textContent = 'runtime: ?';
          sessionEl.className = 'pill disconnected';
        }
      }

      async function loadHistory() {
        try {
          var events = await fetch('/api/events').then(function (r) { return r.json(); });
          events.slice().reverse().forEach(addEvent);
        } catch (err) {
          /* ignore */
        }
      }

      function connectStream() {
        var proto = location.protocol === 'https:' ? 'wss' : 'ws';
        var socket = new WebSocket(proto + '://' + location.host + '/ws/ui');
        socket.onopen = function () {
          wsEl.textContent = 'ui stream: live';
          wsEl.className = 'pill connected';
        };
        socket.onmessage = function (message) {
          var data = JSON.parse(message.data);
          if (data.type === 'event') addEvent(data.event);
        };
        socket.onclose = function () {
          wsEl.textContent = 'ui stream: reconnecting…';
          wsEl.className = 'pill disconnected';
          setTimeout(connectStream, 1000);
        };
        socket.onerror = function () {
          socket.close();
        };
      }

      loadHistory();
      refreshStatus();
      setInterval(refreshStatus, 2000);
      connectStream();
    </script>
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

/** Numeric `readyState` value for an open WebSocket connection. */
const WEBSOCKET_OPEN = 1;

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

    const uiClients = new Set<WebSocket>();

    function broadcastEvent(event: DebugEvent): void {
      const payload = JSON.stringify({ type: 'event', event });

      for (const client of uiClients) {
        if (client.readyState === WEBSOCKET_OPEN) {
          client.send(payload);
        }
      }
    }

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
          broadcastEvent(parsed.data);
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

    instance.get('/ws/ui', { websocket: true }, (socket) => {
      uiClients.add(socket);
      socket.on('close', () => {
        uiClients.delete(socket);
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
