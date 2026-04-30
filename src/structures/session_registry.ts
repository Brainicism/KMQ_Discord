import { Mutex } from "async-mutex";

/**
 * Global registry of active sessions, with per-guild creation locks.
 * Provides per-guild creation locks to prevent TOCTOU double-creation.
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
     * Clean up the creation lock for a guild.
     * Prevents memory leak for guilds that only play once.
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
