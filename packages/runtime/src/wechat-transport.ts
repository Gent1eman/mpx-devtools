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

/** WeChat transport backed by the mini-program `wx` socket API. */
export class WeChatTransport implements DebugTransport {
  private listener: ((event: TransportEvent) => void) | null = null;

  constructor(private readonly socket: WeChatSocketApi) {
    this.socket.onSocketOpen(() => this.emit({ type: 'open' }));
    this.socket.onSocketMessage((result) => this.emit({ type: 'message', data: result.data }));
    this.socket.onSocketClose((result) =>
      this.emit({ type: 'close', code: result.code, reason: result.reason })
    );
    this.socket.onSocketError((error) => this.emit({ type: 'error', error }));
  }

  connect(url: string): void {
    this.socket.connectSocket({ url });
  }

  send(data: string): void {
    this.socket.sendSocketMessage({ data });
  }

  close(): void {
    this.socket.closeSocket();
  }

  onEvent(listener: (event: TransportEvent) => void): void {
    this.listener = listener;
  }

  private emit(event: TransportEvent): void {
    this.listener?.(event);
  }
}
