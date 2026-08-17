import { PROTOCOL_VERSION, type DebugEvent, type DebugTarget } from '@mpxjs/debug-protocol';
import type { DebugTransport, TransportEvent } from './wechat-transport.js';

/** Configuration required to initialize a debug runtime. */
export interface RuntimeConfig {
  target: DebugTarget;
  buildId: string;
  serverUrl: string;
  token: string;
}

/** Default maximum number of events sent in one WebSocket batch (design §14.3). */
export const DEFAULT_MAX_BATCH_SIZE = 50;

/** Default flush interval in milliseconds (design §14.3). */
export const DEFAULT_FLUSH_INTERVAL_MS = 50;

/** Tunable batch-send options for the runtime. */
export interface DebugRuntimeOptions {
  maxBatchSize?: number;
  flushIntervalMs?: number;
}

/** Core cross-platform debug runtime contract. */
export interface MpxDebugRuntime {
  initialize(config: RuntimeConfig): void;
  emit(event: DebugEvent): void;
  dispose(): void;
  isInitialized(): boolean;
}

/** Debug runtime that connects to the server and performs the session handshake. */
export class DebugRuntime implements MpxDebugRuntime {
  private config: RuntimeConfig | null = null;
  private sessionId: string | null = null;
  private readonly pendingEvents: DebugEvent[] = [];
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly transport: DebugTransport,
    options: DebugRuntimeOptions = {}
  ) {
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.transport.onEvent((event) => this.handleEvent(event));
  }

  initialize(config: RuntimeConfig): void {
    this.stopFlushTimer();
    this.config = config;
    this.sessionId = null;
    this.transport.connect(config.serverUrl);
  }

  emit(event: DebugEvent): void {
    this.pendingEvents.push(event);
  }

  dispose(): void {
    this.stopFlushTimer();
    this.transport.close();
    this.sessionId = null;
    this.config = null;
    this.pendingEvents.length = 0;
  }

  isInitialized(): boolean {
    return this.config !== null;
  }

  /** Returns the session id assigned by the server after a successful handshake. */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Returns the queued events awaiting transport, in insertion order. */
  getPendingEvents(): DebugEvent[] {
    return [...this.pendingEvents];
  }

  private handleEvent(event: TransportEvent): void {
    if (this.config === null) {
      return;
    }

    if (event.type === 'open') {
      this.sendHello();
    } else if (event.type === 'message') {
      this.handleMessage(event.data);
    } else if (event.type === 'close') {
      this.sessionId = null;
    }
  }

  private sendHello(): void {
    const config = this.config;

    if (config === null) {
      return;
    }

    this.transport.send(
      JSON.stringify({
        type: 'session.hello',
        protocolVersion: PROTOCOL_VERSION,
        token: config.token,
        buildId: config.buildId,
        target: config.target
      })
    );
  }

  private handleMessage(data: string): void {
    let message: unknown;

    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === 'session.accepted'
    ) {
      this.sessionId = (message as { sessionId?: unknown }).sessionId as string | null;
      this.startFlushTimer();
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer === null) {
      return;
    }

    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  private flush(): void {
    if (this.sessionId === null || this.pendingEvents.length === 0) {
      return;
    }

    const batch = this.pendingEvents.splice(0, this.maxBatchSize);
    this.transport.send(JSON.stringify(batch));
  }
}
