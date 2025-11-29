// apps/api/src/ws/presence.service.ts
import { Injectable } from '@nestjs/common';

export type PresenceStatus = 'online' | 'idle' | 'offline';

type PresenceState = {
  lastActive: number; // timestamp in ms
};

@Injectable()
export class PresenceService {
  // in-memory store of active users
  private states = new Map<string, PresenceState>();

  // e.g. 5 minutes
  private readonly IDLE_THRESHOLD_MS = 5 * 60 * 1000;

  markOnline(userId: string) {
    // on connect / login
    this.states.set(userId, { lastActive: Date.now() });
  }

  touch(userId: string) {
    // on activity (typing, message, etc.)
    const existing = this.states.get(userId);
    if (existing) {
      existing.lastActive = Date.now();
    } else {
      // user was not yet in map → consider as online
      this.states.set(userId, { lastActive: Date.now() });
    }
  }

  markOffline(userId: string) {
    // on disconnect
    this.states.delete(userId);
  }

  getStatus(userId: string): PresenceStatus {
    const state = this.states.get(userId);
    if (!state) return 'offline';

    const diff = Date.now() - state.lastActive;
    if (diff > this.IDLE_THRESHOLD_MS) return 'idle';

    return 'online';
  }

  getOnlineWithStatus(): Array<{ userId: string; status: PresenceStatus }> {
    const now = Date.now();
    const res: Array<{ userId: string; status: PresenceStatus }> = [];

    for (const [userId, state] of this.states.entries()) {
      const diff = now - state.lastActive;
      const status: PresenceStatus =
        diff > this.IDLE_THRESHOLD_MS ? 'idle' : 'online';
      res.push({ userId, status });
    }
    return res;
  }
}
