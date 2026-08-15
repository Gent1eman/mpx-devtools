import { describe, expect, it } from 'vitest';

import {
  ComponentEventSchema,
  DebugEventSchema,
  EventPriority,
  isSupportedProtocolVersion,
  MethodProbeEventSchema,
  ProbeUpdateCommandSchema,
  PageEventSchema,
  PROTOCOL_VERSION,
  SessionHelloSchema,
  type ProtocolVersion,
  type ProtocolVersioned,
  VariableSnapshotSchema
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
    token: 'debug-token-001',
    buildId: 'wx-development-001',
    target: 'wx'
  } as const;

  it('accepts a valid runtime handshake', () => {
    expect(SessionHelloSchema.safeParse(validHello).success).toBe(true);
  });

  it('rejects a handshake without token', () => {
    const helloWithoutToken = {
      type: validHello.type,
      protocolVersion: validHello.protocolVersion,
      buildId: validHello.buildId,
      target: validHello.target
    };

    expect(SessionHelloSchema.safeParse(helloWithoutToken).success).toBe(false);
  });

  it('rejects a blank token', () => {
    expect(SessionHelloSchema.safeParse({ ...validHello, token: '  ' }).success).toBe(false);
  });

  it('rejects a handshake without buildId', () => {
    const helloWithoutBuildId = {
      type: validHello.type,
      protocolVersion: validHello.protocolVersion,
      token: validHello.token,
      target: validHello.target
    };

    expect(SessionHelloSchema.safeParse(helloWithoutBuildId).success).toBe(false);
  });

  it('rejects a blank buildId', () => {
    expect(SessionHelloSchema.safeParse({ ...validHello, buildId: '  ' }).success).toBe(false);
  });
});

describe('debug event', () => {
  const validEvent = {
    protocolVersion: PROTOCOL_VERSION,
    eventId: 'event-001',
    sessionId: 'session-001',
    buildId: 'wx-development-001',
    target: 'wx',
    timestamp: 1_725_000_000_000,
    priority: EventPriority.Normal,
    type: 'method'
  } as const;

  it('accepts an event with every required base field', () => {
    expect(DebugEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it.each(['eventId', 'sessionId', 'buildId', 'target', 'timestamp'] as const)(
    'rejects an event without %s',
    (requiredField) => {
      const eventWithoutRequiredField = { ...validEvent } as Record<string, unknown>;

      delete eventWithoutRequiredField[requiredField];

      expect(DebugEventSchema.safeParse(eventWithoutRequiredField).success).toBe(false);
    }
  );
});

describe('page event', () => {
  const pageEventBase = {
    protocolVersion: PROTOCOL_VERSION,
    eventId: 'event-page-001',
    sessionId: 'session-001',
    buildId: 'wx-development-001',
    target: 'wx',
    timestamp: 1_725_000_000_000,
    priority: EventPriority.Normal,
    pageInstanceId: 'page-001',
    payload: {
      route: '/pages/index'
    }
  } as const;

  it.each(['page.create', 'page.show', 'page.hide', 'page.unload'] as const)(
    'accepts %s',
    (type) => {
      expect(PageEventSchema.safeParse({ ...pageEventBase, type }).success).toBe(true);
    }
  );
});

describe('component event', () => {
  const componentEventBase = {
    protocolVersion: PROTOCOL_VERSION,
    eventId: 'event-component-001',
    sessionId: 'session-001',
    buildId: 'wx-development-001',
    target: 'wx',
    timestamp: 1_725_000_000_000,
    priority: EventPriority.Normal,
    pageInstanceId: 'page-001',
    componentInstanceId: 'component-child-001',
    parentComponentInstanceId: 'component-parent-001'
  } as const;

  it('accepts component.create with page and parent component associations', () => {
    expect(
      ComponentEventSchema.safeParse({ ...componentEventBase, type: 'component.create' }).success
    ).toBe(true);
  });

  it('accepts component.destroy for a page-root component without a parent', () => {
    const rootComponentEvent = {
      protocolVersion: componentEventBase.protocolVersion,
      eventId: componentEventBase.eventId,
      sessionId: componentEventBase.sessionId,
      buildId: componentEventBase.buildId,
      target: componentEventBase.target,
      timestamp: componentEventBase.timestamp,
      priority: componentEventBase.priority,
      pageInstanceId: componentEventBase.pageInstanceId,
      componentInstanceId: 'component-root-001'
    };

    expect(
      ComponentEventSchema.safeParse({ ...rootComponentEvent, type: 'component.destroy' }).success
    ).toBe(true);
  });
});

describe('method probe event', () => {
  const methodProbeEventBase = {
    protocolVersion: PROTOCOL_VERSION,
    eventId: 'event-probe-001',
    sessionId: 'session-001',
    buildId: 'wx-development-001',
    target: 'wx',
    timestamp: 1_725_000_000_000,
    priority: EventPriority.Normal,
    type: 'method',
    probeId: 'probe-001'
  } as const;

  it('accepts a method hit without a snapshot', () => {
    expect(MethodProbeEventSchema.safeParse(methodProbeEventBase).success).toBe(true);
  });

  it('accepts a method hit with a snapshot association', () => {
    expect(
      MethodProbeEventSchema.safeParse({ ...methodProbeEventBase, snapshotId: 'snapshot-001' })
        .success
    ).toBe(true);
  });

  it('rejects a method hit without probeId', () => {
    const eventWithoutProbeId = {
      protocolVersion: methodProbeEventBase.protocolVersion,
      eventId: methodProbeEventBase.eventId,
      sessionId: methodProbeEventBase.sessionId,
      buildId: methodProbeEventBase.buildId,
      target: methodProbeEventBase.target,
      timestamp: methodProbeEventBase.timestamp,
      priority: methodProbeEventBase.priority,
      type: methodProbeEventBase.type
    };

    expect(MethodProbeEventSchema.safeParse(eventWithoutProbeId).success).toBe(false);
  });
});

describe('variable snapshot', () => {
  const snapshotBase = {
    snapshotId: 'snapshot-001',
    capturedAt: 1_725_000_000_000,
    probeId: 'probe-001'
  } as const;

  it.each([
    ['arguments', { arguments: { orderId: 'A-1001' } }],
    ['locals', { locals: { discount: 20 } }],
    ['component state', { componentState: { loading: false } }],
    ['return value', { returnValue: { accepted: true } }],
    ['error', { error: { message: 'Request failed' } }]
  ] as const)('distinguishes %s snapshots', (_kind, value) => {
    expect(VariableSnapshotSchema.safeParse({ ...snapshotBase, ...value }).success).toBe(true);
  });
});

describe('probe.update command', () => {
  const validProbeUpdate = {
    type: 'probe.update',
    requestId: 'request-001',
    probeId: 'probe-001',
    enabled: true,
    capture: {
      arguments: true,
      componentState: true,
      stack: false
    }
  } as const;

  it('accepts a complete probe update command', () => {
    expect(ProbeUpdateCommandSchema.safeParse(validProbeUpdate).success).toBe(true);
  });

  it.each(['probeId', 'enabled', 'capture'] as const)(
    'rejects a command without %s',
    (requiredField) => {
      const commandWithoutRequiredField = { ...validProbeUpdate } as Record<string, unknown>;

      delete commandWithoutRequiredField[requiredField];

      expect(ProbeUpdateCommandSchema.safeParse(commandWithoutRequiredField).success).toBe(false);
    }
  );
});
