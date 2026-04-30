import { IPCLogger } from "../logger";
import { Mutex } from "async-mutex";
import type Session from "./session";

const logger = new IPCLogger("session_registry");

/**
 * Global registry of active sessions, with per-guild creation locks.
 * Wraps the existing State.gameSessions / State.listeningSessions maps
 * with atomic create-or-get semantics.
 *
 * Phase 1: Provides read-only convenience methods alongside existing State maps.
 * Phase 8 will replace State maps entirely.
 *
 * See session-redesign-proposal.md §4.4 for full design rationale.
 */
export class SessionRegistry {
    private creationLocks = new Map<string, Mutex>();

    /**
     * Get or create a per-guild creation lock.
     * Used by /play to prevent TOCTOU double-creation (RACE-03).
     */
    getOrCreateLock(guildID: string): Mutex {
        let lock = this.creationLocks.get(guildID);
        if (!lock) {
            lock = new Mutex();
            this.creationLocks.set(guildID, lock);
        }

        return lock;
    }

    /**
     * Clean up the creation lock for a guild (optional, prevents memory leak
     * for guilds that only play once). Called from endSession.
     */
    releaseLock(guildID: string): void {
        const lock = this.creationLocks.get(guildID);
        if (lock && !lock.isLocked()) {
            this.creationLocks.delete(guildID);
        }
    }

    /** Get all creation locks (for diagnostics / admin commands). */
    getLockCount(): number {
        return this.creationLocks.size;
    }
}

/** Singleton instance */
const sessionRegistry = new SessionRegistry();
export default sessionRegistry;
