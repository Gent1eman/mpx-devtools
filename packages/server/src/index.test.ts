import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

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

    await expect(
      exchangeSessionHello(`ws://127.0.0.1:${address.port}/ws`, {
        type: 'session.hello',
        protocolVersion: 1,
        token: 'test-token',
        buildId: 'wx-development-001',
        target: 'wx'
      })
    ).resolves.toBe(JSON.stringify({ type: 'session.accepted' }));
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
});
