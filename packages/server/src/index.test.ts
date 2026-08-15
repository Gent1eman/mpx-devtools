import { afterEach, describe, expect, it } from 'vitest';

import { createDebugServer, startDebugServer } from './index.js';

describe('debug server', () => {
  const servers: Array<Awaited<ReturnType<typeof startDebugServer>>> = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
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
});
