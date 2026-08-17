import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventPriority, type DebugEvent } from '@mpxjs/debug-protocol';

import { DebugRuntime, type RuntimeConfig } from './index.js';
import type { DebugTransport, TransportEvent } from './wechat-transport.js';

const config: RuntimeConfig = {
  target: 'wx',
  buildId: 'wx-001',
  serverUrl: 'ws://127.0.0.1:4399/ws',
  token: 'test-token'
};

function makeFakeTransport() {
  let listener: ((event: TransportEvent) => void) | null = null;
  const connect = vi.fn();
  const send = vi.fn();
  const close = vi.fn();

  const transport: DebugTransport = {
    connect: (url) => connect(url),
    send: (data) => send(data),
    close: () => close(),
    onEvent: (next) => {
      listener = next;
    }
  };

  return {
    transport,
    connect,
    send,
    close,
    emit: (event: TransportEvent) => listener?.(event)
  };
}

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

describe('DebugRuntime lifecycle', () => {
  it('starts uninitialized', () => {
    const runtime = new DebugRuntime(makeFakeTransport().transport);

    expect(runtime.isInitialized()).toBe(false);
  });

  it('initializes with a config and connects to the server', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);

    runtime.initialize(config);

    expect(runtime.isInitialized()).toBe(true);
    expect(fake.connect).toHaveBeenCalledWith('ws://127.0.0.1:4399/ws');
  });

  it('can be disposed safely, including multiple times', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);
    runtime.initialize(config);

    runtime.dispose();
    expect(runtime.isInitialized()).toBe(false);

    expect(() => runtime.dispose()).not.toThrow();
    expect(runtime.isInitialized()).toBe(false);
  });

  it('can be re-initialized after disposal', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);

    runtime.initialize(config);
    runtime.dispose();
    runtime.initialize(config);

    expect(runtime.isInitialized()).toBe(true);
    expect(fake.connect).toHaveBeenCalledTimes(2);
  });

  it('emit never throws, even when not initialized or disposed', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);
    const event = makeEvent();

    expect(() => runtime.emit(event)).not.toThrow();

    runtime.initialize(config);
    expect(() => runtime.emit(event)).not.toThrow();

    runtime.dispose();
    expect(() => runtime.emit(event)).not.toThrow();
  });
});

describe('DebugRuntime event queue', () => {
  it('queues events when not initialized', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);
    const event = makeEvent();

    runtime.emit(event);

    expect(runtime.getPendingEvents()).toEqual([event]);
  });

  it('queues events after initialize but before the handshake', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);
    const event = makeEvent();

    runtime.initialize(config);
    runtime.emit(event);

    expect(runtime.getPendingEvents()).toEqual([event]);
    expect(fake.send).not.toHaveBeenCalled();
  });

  it('clears the pending queue on dispose', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);

    runtime.initialize(config);
    runtime.emit(makeEvent());
    runtime.dispose();

    expect(runtime.getPendingEvents()).toEqual([]);
  });
});

describe('DebugRuntime handshake', () => {
  it('sends session.hello when the transport opens', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);

    runtime.initialize(config);
    fake.emit({ type: 'open' });

    expect(fake.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'session.hello',
        protocolVersion: 1,
        token: 'test-token',
        buildId: 'wx-001',
        target: 'wx'
      })
    );
  });

  it('stores the session id after a successful handshake', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);

    runtime.initialize(config);
    expect(runtime.getSessionId()).toBeNull();

    fake.emit({
      type: 'message',
      data: JSON.stringify({ type: 'session.accepted', sessionId: 'session-123' })
    });

    expect(runtime.getSessionId()).toBe('session-123');
  });

  it('ignores messages that are not a session.accepted', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);

    runtime.initialize(config);
    fake.emit({
      type: 'message',
      data: JSON.stringify({ type: 'session.rejected', reason: 'invalid-session-token' })
    });

    expect(runtime.getSessionId()).toBeNull();
  });

  it('does not process transport events after disposal', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);

    runtime.initialize(config);
    runtime.dispose();
    fake.emit({ type: 'open' });

    expect(fake.send).not.toHaveBeenCalled();
  });

  it('resets the session on disconnect and re-handshakes after reconnect', () => {
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport);

    runtime.initialize(config);
    fake.emit({ type: 'open' });
    fake.emit({
      type: 'message',
      data: JSON.stringify({ type: 'session.accepted', sessionId: 'session-1' })
    });
    expect(runtime.getSessionId()).toBe('session-1');

    fake.emit({ type: 'close', code: 1006, reason: '' });
    expect(runtime.getSessionId()).toBeNull();

    fake.emit({ type: 'open' });
    fake.emit({
      type: 'message',
      data: JSON.stringify({ type: 'session.accepted', sessionId: 'session-2' })
    });
    expect(runtime.getSessionId()).toBe('session-2');
  });
});

describe('DebugRuntime batch send', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends queued events in batches smaller than the event count', () => {
    vi.useFakeTimers();
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport, { maxBatchSize: 10, flushIntervalMs: 50 });

    runtime.initialize(config);
    fake.emit({ type: 'open' });
    fake.emit({
      type: 'message',
      data: JSON.stringify({ type: 'session.accepted', sessionId: 'session-123' })
    });

    for (let i = 0; i < 100; i += 1) {
      runtime.emit({ ...makeEvent(), eventId: `event-${i}` });
    }

    vi.advanceTimersByTime(500);

    const batchCalls = fake.send.mock.calls.filter(([data]) => Array.isArray(JSON.parse(data)));

    expect(batchCalls.length).toBeLessThan(100);
    expect(batchCalls.length).toBe(10);
    expect(JSON.parse(batchCalls[0][0])).toHaveLength(10);
  });

  it('does not flush before the handshake completes', () => {
    vi.useFakeTimers();
    const fake = makeFakeTransport();
    const runtime = new DebugRuntime(fake.transport, { maxBatchSize: 10, flushIntervalMs: 50 });

    runtime.initialize(config);
    fake.emit({ type: 'open' });

    for (let i = 0; i < 10; i += 1) {
      runtime.emit({ ...makeEvent(), eventId: `event-${i}` });
    }

    vi.advanceTimersByTime(500);

    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(runtime.getPendingEvents()).toHaveLength(10);
  });
});
