import type { DebugEvent } from '@mpxjs/debug-protocol';

/** Default number of events retained by the debug server (design §16.4). */
export const DEFAULT_EVENT_BUFFER_CAPACITY = 10_000;

/** Fixed-capacity ring buffer that drops the oldest event once full. */
export class EventStore {
  private readonly capacity: number;
  private readonly buffer: Array<DebugEvent | undefined>;
  private head = 0;
  private size = 0;

  constructor(capacity: number = DEFAULT_EVENT_BUFFER_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('Event buffer capacity must be a positive integer.');
    }
    this.capacity = capacity;
    this.buffer = new Array<DebugEvent | undefined>(capacity);
  }

  /** Appends an event, overwriting the oldest event once the buffer is full. */
  append(event: DebugEvent): void {
    if (this.size < this.capacity) {
      this.buffer[(this.head + this.size) % this.capacity] = event;
      this.size += 1;
      return;
    }

    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
  }

  /** Returns the stored events in insertion order, oldest first. */
  list(): DebugEvent[] {
    const events: DebugEvent[] = [];

    for (let index = 0; index < this.size; index += 1) {
      const event = this.buffer[(this.head + index) % this.capacity];
      if (event !== undefined) {
        events.push(event);
      }
    }

    return events;
  }
}
