import { randomBytes } from 'node:crypto';
import type { DebugTarget } from '@mpxjs/debug-protocol';

/** Connection state of the single active debug session. */
export interface DebugSessionState {
  sessionId: string;
  buildId: string;
  target: DebugTarget;
  connected: boolean;
  connectedAt: number;
  lastActivityAt: number;
}

/** Generates a unique identifier for a debug session. */
export function createSessionId(): string {
  return randomBytes(16).toString('hex');
}

/** Tracks the single runtime session supported by the MVP debug server. */
export class SessionManager {
  private current: DebugSessionState | null = null;

  /** Returns the active session state, or null when no session has been registered. */
  get(): DebugSessionState | null {
    return this.current;
  }

  /** Registers (or replaces) the active session and returns its state. */
  register(input: {
    sessionId: string;
    buildId: string;
    target: DebugTarget;
    now: number;
  }): DebugSessionState {
    this.current = {
      sessionId: input.sessionId,
      buildId: input.buildId,
      target: input.target,
      connected: true,
      connectedAt: input.now,
      lastActivityAt: input.now
    };
    return this.current;
  }

  /** Refreshes the last-activity timestamp of the active session. */
  touch(now: number): void {
    if (this.current !== null) {
      this.current.lastActivityAt = now;
    }
  }

  /** Marks the active session as disconnected. */
  disconnect(): void {
    if (this.current !== null) {
      this.current.connected = false;
    }
  }
}
