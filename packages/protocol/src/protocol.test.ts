import { describe, expect, it } from 'vitest';

import {
  isSupportedProtocolVersion,
  PROTOCOL_VERSION,
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
