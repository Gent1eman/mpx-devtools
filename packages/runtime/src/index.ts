import type { DebugEvent, DebugTarget } from '@mpxjs/debug-protocol';

/** Configuration required to initialize a debug runtime. */
export interface RuntimeConfig {
  target: DebugTarget;
  buildId: string;
}

/** Core cross-platform debug runtime contract. */
export interface MpxDebugRuntime {
  initialize(config: RuntimeConfig): void;
  emit(event: DebugEvent): void;
  dispose(): void;
  isInitialized(): boolean;
}

/** Default in-memory debug runtime; transport is introduced in a later task. */
export class DebugRuntime implements MpxDebugRuntime {
  private config: RuntimeConfig | null = null;

  initialize(config: RuntimeConfig): void {
    this.config = config;
  }

  emit(_event: DebugEvent): void {
    // No transport yet; emitted events are currently dropped.
    void _event;
  }

  dispose(): void {
    this.config = null;
  }

  isInitialized(): boolean {
    return this.config !== null;
  }
}
