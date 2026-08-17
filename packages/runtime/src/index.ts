import { PROTOCOL_VERSION, type DebugEvent, type DebugTarget } from '@mpxjs/debug-protocol';
import type { DebugTransport, TransportEvent } from './wechat-transport.js';

/** Configuration required to initialize a debug runtime. */
export interface RuntimeConfig {
  target: DebugTarget;
  buildId: string;
  serverUrl: string;
  token: string;
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

  constructor(private readonly transport: DebugTransport) {
    this.transport.onEvent((event) => this.handleEvent(event));
  }

  initialize(config: RuntimeConfig): void {
    this.config = config;
    this.sessionId = null;
    this.transport.connect(config.serverUrl);
  }

  emit(event: DebugEvent): void {
    this.pendingEvents.push(event);
  }

  dispose(): void {
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
    }
  }
}
