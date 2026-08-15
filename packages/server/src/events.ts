import type { DebugEvent } from '@mpxjs/debug-protocol';

/** In-memory store for debug events received from the runtime. */
export class EventStore {
  private readonly events: DebugEvent[] = [];

  /** Appends a validated event to the store. */
  append(event: DebugEvent): void {
    this.events.push(event);
  }

  /** Returns the stored events in insertion order. */
  list(): DebugEvent[] {
    return [...this.events];
  }
}
