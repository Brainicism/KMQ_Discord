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
     * @param guildID - The guild ID to get or create a lock for
     * @returns the per-guild Mutex
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
     * @param guildID - The guild ID whose lock to release
     */
    releaseLock(guildID: string): void {
        const lock = this.creationLocks.get(guildID);
        if (lock && !lock.isLocked()) {
            this.creationLocks.delete(guildID);
        }
    }

    /**
     * Get the number of active creation locks (for diagnostics / admin commands).
     * @returns the number of active per-guild locks
     */
    getLockCount(): number {
        return this.creationLocks.size;
    }
}

/** Singleton instance */
const sessionRegistry = new SessionRegistry();
// eslint-disable-next-line import/no-unused-modules
export default sessionRegistry;
