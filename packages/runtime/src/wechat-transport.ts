/** Subset of the WeChat mini-program socket API consumed by the transport. */
export interface WeChatSocketApi {
  connectSocket(options: { url: string }): void;
  sendSocketMessage(options: { data: string }): void;
  closeSocket(options?: { code?: number; reason?: string }): void;
  onSocketOpen(callback: () => void): void;
  onSocketMessage(callback: (result: { data: string }) => void): void;
  onSocketClose(callback: (result: { code: number; reason: string }) => void): void;
  onSocketError(callback: (error: unknown) => void): void;
}

/** Normalized event emitted by a DebugTransport. */
export type TransportEvent =
  | { type: 'open' }
  | { type: 'message'; data: string }
  | { type: 'close'; code: number; reason: string }
  | { type: 'error'; error: unknown };

/** Platform-agnostic WebSocket transport contract used by the runtime. */
export interface DebugTransport {
  connect(url: string): void;
  send(data: string): void;
  close(): void;
  onEvent(listener: (event: TransportEvent) => void): void;
}

/** Default reconnect delay after the first unexpected close (design §14.3). */
export const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;

/** Upper bound for the exponential reconnect backoff. */
export const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;

/** Tunable reconnect-backoff options for the transport. */
export interface ReconnectOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/** WeChat transport backed by the mini-program `wx` socket API. */
export class WeChatTransport implements DebugTransport {
  private listener: ((event: TransportEvent) => void) | null = null;
  private url: string | null = null;
  private manuallyClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(
    private readonly socket: WeChatSocketApi,
    private readonly options: ReconnectOptions = {}
  ) {
    this.socket.onSocketOpen(() => {
      this.attempt = 0;
      this.emit({ type: 'open' });
    });
    this.socket.onSocketMessage((result) => this.emit({ type: 'message', data: result.data }));
    this.socket.onSocketClose((result) => {
      this.emit({ type: 'close', code: result.code, reason: result.reason });
      this.scheduleReconnect();
    });
    this.socket.onSocketError((error) => this.emit({ type: 'error', error }));
  }

  connect(url: string): void {
    this.url = url;
    this.manuallyClosed = false;
    this.attempt = 0;
    this.stopReconnect();
    this.socket.connectSocket({ url });
  }

  send(data: string): void {
    this.socket.sendSocketMessage({ data });
  }

  close(): void {
    this.manuallyClosed = true;
    this.stopReconnect();
    this.socket.closeSocket();
  }

  onEvent(listener: (event: TransportEvent) => void): void {
    this.listener = listener;
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || this.url === null || this.reconnectTimer !== null) {
      return;
    }

    const delay = this.backoffDelay();
    this.attempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manuallyClosed || this.url === null) {
        return;
      }
      this.socket.connectSocket({ url: this.url });
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer === null) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private backoffDelay(): number {
    const base = this.options.baseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
    const max = this.options.maxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
    return Math.min(base * 2 ** this.attempt, max);
  }

  private emit(event: TransportEvent): void {
    this.listener?.(event);
  }
}
