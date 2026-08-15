import { startDebugServer } from './index.js';

/** Starts the local debug server from the command line, using env overrides. */
async function main(): Promise<void> {
  const host = process.env.MPX_DEBUG_HOST ?? '127.0.0.1';
  const port = Number(process.env.MPX_DEBUG_PORT ?? 4399);
  const token = process.env.MPX_DEBUG_TOKEN;

  const server = await startDebugServer({ host, port, token });

  console.log(`Mpx debug server listening on http://${host}:${port}`);
  console.log(`Session token: ${server.debugToken}`);
  console.log('Press Ctrl+C to stop.');

  const shutdown = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
