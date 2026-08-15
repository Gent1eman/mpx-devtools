import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { EventPriority } from '@mpxjs/debug-protocol';

import { createDebugServer, startDebugServer } from './index.js';

function receiveWelcome(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    const timeout = setTimeout(() => {
      client.terminate();
      reject(new Error('Timed out waiting for the WebSocket welcome message.'));
    }, 2_000);

    client.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    client.once('message', (message) => {
      clearTimeout(timeout);
      client.close();
      resolve(message.toString());
    });
  });
}

function exchangeSessionHello(url: string, hello: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    const timeout = setTimeout(() => {
      client.terminate();
      reject(new Error('Timed out waiting for the session handshake response.'));
    }, 2_000);
    let receivedWelcome = false;

    client.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    client.on('message', (message) => {
      if (!receivedWelcome) {
        receivedWelcome = true;
        client.send(JSON.stringify(hello));
        return;
      }

      clearTimeout(timeout);
      client.close();
      resolve(message.toString());
    });
  });
}

interface EstablishedSession {
  client: WebSocket;
  accepted: { type: string; sessionId: string };
}

function establishSession(url: string, hello: unknown): Promise<EstablishedSession> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    const timeout = setTimeout(() => {
      client.terminate();
      reject(new Error('Timed out waiting for the session handshake response.'));
    }, 2_000);
    let receivedWelcome = false;

    client.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    client.on('message', (message) => {
      if (!receivedWelcome) {
        receivedWelcome = true;
        client.send(JSON.stringify(hello));
        return;
      }

      clearTimeout(timeout);
      resolve({
        client,
        accepted: JSON.parse(message.toString()) as EstablishedSession['accepted']
      });
    });
  });
}

function sendAndAwait(client: WebSocket, message: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.terminate();
      reject(new Error('Timed out waiting for a server message.'));
    }, 2_000);

    client.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    client.once('message', (data) => {
      clearTimeout(timeout);
      resolve(data.toString());
    });

    client.send(JSON.stringify(message));
  });
}

describe('debug server', () => {
  const servers: Array<Awaited<ReturnType<typeof startDebugServer>>> = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
  });

  it('returns a minimal debug home page from GET /', async () => {
    const server = createDebugServer();

    const response = await server.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<h1>Mpx DevTools</h1>');

    await server.close();
  });

  it('returns its version and running status from GET /health', async () => {
    const server = createDebugServer({ version: 'test-version' });

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'running', version: 'test-version' });

    await server.close();
  });

  it('listens on a configurable port', async () => {
    const server = await startDebugServer({ port: 0 });
    servers.push(server);

    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    expect(address.port).toBeTypeOf('number');
  });

  it('accepts a WebSocket client and sends a welcome message', async () => {
    const server = await startDebugServer({ port: 0 });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    await expect(receiveWelcome(`ws://127.0.0.1:${address.port}/ws`)).resolves.toBe(
      JSON.stringify({ type: 'server.welcome' })
    );
  });

  it('accepts a valid session.hello handshake', async () => {
    const server = await startDebugServer({ port: 0, token: 'test-token' });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    const accepted = JSON.parse(
      await exchangeSessionHello(`ws://127.0.0.1:${address.port}/ws`, {
        type: 'session.hello',
        protocolVersion: 1,
        token: 'test-token',
        buildId: 'wx-development-001',
        target: 'wx'
      })
    );

    expect(accepted.type).toBe('session.accepted');
    expect(accepted.sessionId).toBeTypeOf('string');
    expect(accepted.sessionId.length).toBeGreaterThan(0);
  });

  it('registers a connected session served by GET /api/session', async () => {
    const server = await startDebugServer({ port: 0, token: 'test-token' });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    const { client, accepted } = await establishSession(`ws://127.0.0.1:${address.port}/ws`, {
      type: 'session.hello',
      protocolVersion: 1,
      token: 'test-token',
      buildId: 'wx-development-001',
      target: 'wx'
    });

    const response = await server.inject({ method: 'GET', url: '/api/session' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionId: accepted.sessionId,
      buildId: 'wx-development-001',
      target: 'wx',
      connected: true
    });
    expect(response.json().lastActivityAt).toBeTypeOf('number');
    expect(response.json().connectedAt).toBeTypeOf('number');

    client.close();
  });

  it('marks the session as disconnected when the socket closes', async () => {
    const server = await startDebugServer({ port: 0, token: 'test-token' });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    const { client } = await establishSession(`ws://127.0.0.1:${address.port}/ws`, {
      type: 'session.hello',
      protocolVersion: 1,
      token: 'test-token',
      buildId: 'wx-development-001',
      target: 'wx'
    });

    const closed = new Promise<void>((resolve) => {
      client.once('close', () => resolve());
    });

    client.close();
    await closed;

    await vi.waitFor(async () => {
      const response = await server.inject({ method: 'GET', url: '/api/session' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ connected: false });
    });
  });

  it('rejects a session.hello handshake with the wrong token', async () => {
    const server = await startDebugServer({ port: 0, token: 'test-token' });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    await expect(
      exchangeSessionHello(`ws://127.0.0.1:${address.port}/ws`, {
        type: 'session.hello',
        protocolVersion: 1,
        token: 'wrong-token',
        buildId: 'wx-development-001',
        target: 'wx'
      })
    ).resolves.toBe(JSON.stringify({ type: 'session.rejected', reason: 'invalid-session-token' }));
  });

  it('rejects a session.hello handshake with an unsupported protocol version', async () => {
    const server = await startDebugServer({ port: 0, token: 'test-token' });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    await expect(
      exchangeSessionHello(`ws://127.0.0.1:${address.port}/ws`, {
        type: 'session.hello',
        protocolVersion: 0,
        token: 'test-token',
        buildId: 'wx-development-001',
        target: 'wx'
      })
    ).resolves.toBe(JSON.stringify({ type: 'session.rejected', reason: 'invalid-session-hello' }));
  });

  it('generates a unique session token for every server instance', async () => {
    const firstServer = await startDebugServer({ port: 0 });
    servers.push(firstServer);
    const secondServer = await startDebugServer({ port: 0 });
    servers.push(secondServer);

    expect(firstServer.debugToken).toBeTypeOf('string');
    expect(firstServer.debugToken.length).toBeGreaterThanOrEqual(32);
    expect(firstServer.debugToken).not.toBe(secondServer.debugToken);
  });

  it('stores a valid debug event received after the handshake', async () => {
    const server = await startDebugServer({ port: 0, token: 'test-token' });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    const { client, accepted } = await establishSession(`ws://127.0.0.1:${address.port}/ws`, {
      type: 'session.hello',
      protocolVersion: 1,
      token: 'test-token',
      buildId: 'wx-development-001',
      target: 'wx'
    });

    client.send(
      JSON.stringify({
        protocolVersion: 1,
        eventId: 'event-001',
        sessionId: accepted.sessionId,
        buildId: 'wx-development-001',
        target: 'wx',
        timestamp: 1_725_000_000_000,
        priority: EventPriority.Normal,
        type: 'method',
        probeId: 'probe-001'
      })
    );

    await vi.waitFor(() => {
      const stored = server.eventStore.list();

      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        eventId: 'event-001',
        sessionId: accepted.sessionId,
        type: 'method'
      });
    });

    client.close();
  });

  it('rejects an invalid debug event with a protocol error', async () => {
    const server = await startDebugServer({ port: 0, token: 'test-token' });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    const { client } = await establishSession(`ws://127.0.0.1:${address.port}/ws`, {
      type: 'session.hello',
      protocolVersion: 1,
      token: 'test-token',
      buildId: 'wx-development-001',
      target: 'wx'
    });

    await expect(sendAndAwait(client, { type: 'method' })).resolves.toBe(
      JSON.stringify({ type: 'event.rejected', reason: 'invalid-event' })
    );

    expect(server.eventStore.list()).toHaveLength(0);

    client.close();
  });

  it('returns an empty list from GET /api/events before any events arrive', async () => {
    const server = createDebugServer();

    const response = await server.inject({ method: 'GET', url: '/api/events' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

    await server.close();
  });

  it('returns buffered events in order from GET /api/events', async () => {
    const server = await startDebugServer({ port: 0, token: 'test-token' });
    servers.push(server);
    const address = server.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected the server to listen on a TCP port.');
    }

    const { client, accepted } = await establishSession(`ws://127.0.0.1:${address.port}/ws`, {
      type: 'session.hello',
      protocolVersion: 1,
      token: 'test-token',
      buildId: 'wx-development-001',
      target: 'wx'
    });

    const baseEvent = {
      protocolVersion: 1,
      sessionId: accepted.sessionId,
      buildId: 'wx-development-001',
      target: 'wx',
      timestamp: 1_725_000_000_000,
      priority: EventPriority.Normal,
      type: 'method'
    };

    client.send(JSON.stringify({ ...baseEvent, eventId: 'event-001' }));
    client.send(JSON.stringify({ ...baseEvent, eventId: 'event-002' }));

    await vi.waitFor(() => {
      expect(server.eventStore.list()).toHaveLength(2);
    });

    const response = await server.inject({ method: 'GET', url: '/api/events' });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((event: { eventId: string }) => event.eventId)).toEqual([
      'event-001',
      'event-002'
    ]);

    client.close();
  });
});
