import { describe, expect, it } from 'vitest';

import { SessionManager } from './session.js';

describe('SessionManager', () => {
  it('returns null before any session is registered', () => {
    expect(new SessionManager().get()).toBeNull();
  });

  it('registers a session as connected with its activity timestamp', () => {
    const sessions = new SessionManager();

    const session = sessions.register({
      sessionId: 'session-001',
      buildId: 'wx-001',
      target: 'wx',
      now: 1000
    });

    expect(session).toEqual({
      sessionId: 'session-001',
      buildId: 'wx-001',
      target: 'wx',
      connected: true,
      connectedAt: 1000,
      lastActivityAt: 1000
    });
    expect(sessions.get()).toBe(session);
  });

  it('refreshes the last-activity timestamp', () => {
    const sessions = new SessionManager();

    sessions.register({ sessionId: 'session-001', buildId: 'wx-001', target: 'wx', now: 1000 });
    sessions.touch(2000);

    expect(sessions.get()?.lastActivityAt).toBe(2000);
  });

  it('marks a session as disconnected', () => {
    const sessions = new SessionManager();

    sessions.register({ sessionId: 'session-001', buildId: 'wx-001', target: 'wx', now: 1000 });
    sessions.disconnect();

    expect(sessions.get()?.connected).toBe(false);
  });
});
