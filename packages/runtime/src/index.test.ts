import { describe, expect, it } from 'vitest';
import { EventPriority, type DebugEvent } from '@mpxjs/debug-protocol';

import { DebugRuntime, type RuntimeConfig } from './index.js';

const config: RuntimeConfig = { target: 'wx', buildId: 'wx-001' };

function makeEvent(): DebugEvent {
  return {
    protocolVersion: 1,
    eventId: 'event-001',
    sessionId: 'session-001',
    buildId: 'wx-001',
    target: 'wx',
    timestamp: 1_725_000_000_000,
    priority: EventPriority.Normal,
    type: 'method'
  };
}

describe('DebugRuntime', () => {
  it('starts uninitialized', () => {
    expect(new DebugRuntime().isInitialized()).toBe(false);
  });

  it('initializes with a config', () => {
    const runtime = new DebugRuntime();

    runtime.initialize(config);

    expect(runtime.isInitialized()).toBe(true);
  });

  it('can be disposed safely, including multiple times', () => {
    const runtime = new DebugRuntime();
    runtime.initialize(config);

    runtime.dispose();
    expect(runtime.isInitialized()).toBe(false);

    expect(() => runtime.dispose()).not.toThrow();
    expect(runtime.isInitialized()).toBe(false);
  });

  it('can be re-initialized after disposal', () => {
    const runtime = new DebugRuntime();

    runtime.initialize(config);
    runtime.dispose();
    runtime.initialize(config);

    expect(runtime.isInitialized()).toBe(true);
  });

  it('emit is a safe no-op before initialization and after disposal', () => {
    const runtime = new DebugRuntime();
    const event = makeEvent();

    expect(() => runtime.emit(event)).not.toThrow();

    runtime.initialize(config);
    expect(() => runtime.emit(event)).not.toThrow();

    runtime.dispose();
    expect(() => runtime.emit(event)).not.toThrow();
  });
});
