import { IPCLogger } from "../logger";
import { Mutex } from "async-mutex";
import type Session from "./session";
import type GameSession from "./game_session";
import type ListeningSession from "./listening_session";

const logger = new IPCLogger("session_registry");

/**
 * Global registry of active sessions, with per-guild creation locks.
 * Canonical source of truth for session lookups. State.gameSessions and
 * State.listeningSessions are still written to for backward compatibility.
 */
export class SessionRegistry {
    private creationLocks = new Map<string, Mutex>();
    private sessions = new Map<string, Session>();

    // ── Session Map ────────────────────────────────────────────────

    get(guildID: string): Session | undefined {
        return this.sessions.get(guildID);
    }

    set(guildID: string, session: Session): void {
        this.sessions.set(guildID, session);
        logger.info(
            `gid: ${guildID} | Registered ${session.sessionName()} session`,
        );
    }

    delete(guildID: string): boolean {
        const existed = this.sessions.delete(guildID);
        if (existed) {
            logger.info(`gid: ${guildID} | Session removed from registry`);
        }

        return existed;
    }

    has(guildID: string): boolean {
        return this.sessions.has(guildID);
    }

    getAllSessions(): Session[] {
        return Array.from(this.sessions.values());
    }

    getGameSessions(): GameSession[] {
        return this.getAllSessions().filter(
            (s): s is GameSession => s.isGameSession(),
        );
    }

    getListeningSessions(): ListeningSession[] {
        return this.getAllSessions().filter(
            (s): s is ListeningSession => s.isListeningSession(),
        );
    }

    get size(): number {
        return this.sessions.size;
    }

    // ── Creation Locks ──────────────────────────────────────────────

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
