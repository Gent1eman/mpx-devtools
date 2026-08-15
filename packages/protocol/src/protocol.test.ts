import { describe, expect, it } from 'vitest';

import {
  isSupportedProtocolVersion,
  PROTOCOL_VERSION,
  SessionHelloSchema,
  type ProtocolVersion,
  type ProtocolVersioned
} from './index.js';

describe('protocol version', () => {
  it('exports the current version as the supported version', () => {
    const version: ProtocolVersion = PROTOCOL_VERSION;
    const message: ProtocolVersioned = { protocolVersion: version };

    expect(message.protocolVersion).toBe(1);
    expect(isSupportedProtocolVersion(PROTOCOL_VERSION)).toBe(true);
  });

  it('rejects unsupported versions', () => {
    expect(isSupportedProtocolVersion(0)).toBe(false);
    expect(isSupportedProtocolVersion(2)).toBe(false);
  });
});

describe('session.hello', () => {
  const validHello = {
    type: 'session.hello',
    protocolVersion: PROTOCOL_VERSION,
    buildId: 'wx-development-001',
    target: 'wx'
  } as const;

  it('accepts a valid runtime handshake', () => {
    expect(SessionHelloSchema.safeParse(validHello).success).toBe(true);
  });

  it('rejects a handshake without buildId', () => {
    const helloWithoutBuildId = {
      type: validHello.type,
      protocolVersion: validHello.protocolVersion,
      target: validHello.target
    };

    expect(SessionHelloSchema.safeParse(helloWithoutBuildId).success).toBe(false);
  });

  it('rejects a blank buildId', () => {
    expect(SessionHelloSchema.safeParse({ ...validHello, buildId: '  ' }).success).toBe(false);
  });
});
