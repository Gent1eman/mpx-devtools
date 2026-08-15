import { describe, expect, it } from 'vitest';

import { EventPriority, type DebugEvent } from '@mpxjs/debug-protocol';

import { EventStore } from './events.js';

function makeEvent(eventId: string): DebugEvent {
  return {
    protocolVersion: 1,
    eventId,
    sessionId: 'session-001',
    buildId: 'wx-001',
    target: 'wx',
    timestamp: 1_725_000_000_000,
    priority: EventPriority.Normal,
    type: 'method',
    probeId: 'probe-001'
  };
}

describe('EventStore', () => {
  it('starts empty', () => {
    expect(new EventStore().list()).toEqual([]);
  });

  it('appends events in insertion order', () => {
    const events = new EventStore();
    const first = makeEvent('event-001');
    const second = makeEvent('event-002');

    events.append(first);
    events.append(second);

    expect(events.list()).toEqual([first, second]);
  });

  it('returns a copy so callers cannot mutate the stored events', () => {
    const events = new EventStore();
    events.append(makeEvent('event-001'));

    events.list().push(makeEvent('event-002'));

    expect(events.list()).toHaveLength(1);
  });
});
