import { afterEach, describe, expect, it, vi } from 'vitest';

import { WeChatTransport, type TransportEvent, type WeChatSocketApi } from './wechat-transport.js';

function makeFakeSocket() {
  let openCallback: (() => void) | null = null;
  let messageCallback: ((result: { data: string }) => void) | null = null;
  let closeCallback: ((result: { code: number; reason: string }) => void) | null = null;
  let errorCallback: ((error: unknown) => void) | null = null;

  const connectSocket = vi.fn();
  const sendSocketMessage = vi.fn();
  const closeSocket = vi.fn();

  const socket: WeChatSocketApi = {
    connectSocket,
    sendSocketMessage,
    closeSocket,
    onSocketOpen: (callback) => {
      openCallback = callback;
    },
    onSocketMessage: (callback) => {
      messageCallback = callback;
    },
    onSocketClose: (callback) => {
      closeCallback = callback;
    },
    onSocketError: (callback) => {
      errorCallback = callback;
    }
  };

  return {
    socket,
    connectSocket,
    sendSocketMessage,
    closeSocket,
    emitOpen: () => openCallback?.(),
    emitMessage: (data: string) => messageCallback?.({ data }),
    emitClose: (code: number, reason: string) => closeCallback?.({ code, reason }),
    emitError: (error: unknown) => errorCallback?.(error)
  };
}

describe('WeChatTransport', () => {
  it('connects to the given URL', () => {
    const fake = makeFakeSocket();
    const transport = new WeChatTransport(fake.socket);

    transport.connect('ws://127.0.0.1:4399/ws');

    expect(fake.connectSocket).toHaveBeenCalledWith({ url: 'ws://127.0.0.1:4399/ws' });
  });

  it('sends string data over the socket', () => {
    const fake = makeFakeSocket();
    const transport = new WeChatTransport(fake.socket);

    transport.send('hello');

    expect(fake.sendSocketMessage).toHaveBeenCalledWith({ data: 'hello' });
  });

  it('closes the socket', () => {
    const fake = makeFakeSocket();
    const transport = new WeChatTransport(fake.socket);

    transport.close();

    expect(fake.closeSocket).toHaveBeenCalled();
  });

  it('forwards socket open and message events to the listener', () => {
    const fake = makeFakeSocket();
    const transport = new WeChatTransport(fake.socket);
    const events: TransportEvent[] = [];

    transport.onEvent((event) => events.push(event));
    transport.connect('ws://127.0.0.1:4399/ws');
    fake.emitOpen();
    fake.emitMessage('{"type":"session.accepted","sessionId":"s1"}');

    expect(events).toEqual([
      { type: 'open' },
      { type: 'message', data: '{"type":"session.accepted","sessionId":"s1"}' }
    ]);
  });

  it('forwards socket close and error events to the listener', () => {
    const fake = makeFakeSocket();
    const transport = new WeChatTransport(fake.socket);
    const events: TransportEvent[] = [];

    transport.onEvent((event) => events.push(event));
    transport.connect('ws://127.0.0.1:4399/ws');
    fake.emitClose(1000, 'done');
    fake.emitError(new Error('boom'));

    expect(events).toEqual([
      { type: 'close', code: 1000, reason: 'done' },
      { type: 'error', error: new Error('boom') }
    ]);
  });
});

describe('WeChatTransport reconnect', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconnects after an unexpected close with exponential backoff', () => {
    vi.useFakeTimers();
    const fake = makeFakeSocket();
    const transport = new WeChatTransport(fake.socket, { baseDelayMs: 1000, maxDelayMs: 4000 });

    transport.connect('ws://127.0.0.1:4399/ws');
    expect(fake.connectSocket).toHaveBeenCalledTimes(1);

    fake.emitClose(1006, 'gone');
    vi.advanceTimersByTime(999);
    expect(fake.connectSocket).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(fake.connectSocket).toHaveBeenCalledTimes(2);

    // the reconnect failed again, so the backoff grows to 2000ms
    fake.emitClose(1006, 'gone');
    vi.advanceTimersByTime(1000);
    expect(fake.connectSocket).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    expect(fake.connectSocket).toHaveBeenCalledTimes(3);

    // a successful open resets the backoff to the base delay
    fake.emitOpen();
    fake.emitClose(1006, 'gone');
    vi.advanceTimersByTime(1000);
    expect(fake.connectSocket).toHaveBeenCalledTimes(4);
  });

  it('does not reconnect after an explicit close', () => {
    vi.useFakeTimers();
    const fake = makeFakeSocket();
    const transport = new WeChatTransport(fake.socket);

    transport.connect('ws://127.0.0.1:4399/ws');
    transport.close();
    fake.emitClose(1000, 'done');

    vi.advanceTimersByTime(60_000);

    expect(fake.connectSocket).toHaveBeenCalledTimes(1);
  });
});
