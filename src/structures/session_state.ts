import { IPCLogger } from "../logger";

const logger = new IPCLogger("session_state");

/**
 * Explicit session lifecycle states, replacing scattered boolean flags
 * (`finished`, `sessionInitialized`, `round !== null`, `round.finished`).
 */
export enum SessionState {
    /** Session object created, not yet registered */
    CREATED = "CREATED",

    /** First round is being prepared (song selection, VC join) */
    INITIALIZING = "INITIALIZING",

    /** Teams mode: waiting for players to /join teams before game starts */
    LOBBY = "LOBBY",

    /** Between rounds: delay period, preparing next song */
    BETWEEN_ROUNDS = "BETWEEN_ROUNDS",

    /** Round starting: joining VC, selecting song */
    ROUND_STARTING = "ROUND_STARTING",

    /** Round active: song playing, accepting guesses/skips */
    ROUND_ACTIVE = "ROUND_ACTIVE",

    /** Round ending: processing results, updating scores */
    ROUND_ENDING = "ROUND_ENDING",

    /** Session ending: persisting stats, sending end-game message */
    ENDING = "ENDING",

    /** Terminal: all cleanup complete */
    ENDED = "ENDED",
}

/** Valid state transitions. Maps from-state → set of allowed to-states. */
const VALID_TRANSITIONS: Record<SessionState, Set<SessionState>> = {
    [SessionState.CREATED]: new Set([
        SessionState.INITIALIZING,
        SessionState.LOBBY,
        SessionState.ENDING,
    ]),
    [SessionState.INITIALIZING]: new Set([
        SessionState.ROUND_STARTING,
        SessionState.ROUND_ACTIVE,
        SessionState.BETWEEN_ROUNDS,
        SessionState.ENDING,
    ]),
    [SessionState.LOBBY]: new Set([
        SessionState.INITIALIZING,
        SessionState.ENDING,
    ]),
    [SessionState.BETWEEN_ROUNDS]: new Set([
        SessionState.ROUND_STARTING,
        SessionState.ROUND_ACTIVE,
        SessionState.ENDING,
    ]),
    [SessionState.ROUND_STARTING]: new Set([
        SessionState.ROUND_ACTIVE,
        SessionState.ENDING,
    ]),
    [SessionState.ROUND_ACTIVE]: new Set([
        SessionState.ROUND_ENDING,
        SessionState.ENDING,
    ]),
    [SessionState.ROUND_ENDING]: new Set([
        SessionState.BETWEEN_ROUNDS,
        SessionState.ENDING,
    ]),
    [SessionState.ENDING]: new Set([SessionState.ENDED]),
    [SessionState.ENDED]: new Set([]),
};

/**
 * Manages session state transitions with validation and logging.
 * Invalid transitions are logged as warnings but still applied
 * to avoid breaking existing behavior during rollout.
 */
export class SessionStateMachine {
    private currentState: SessionState = SessionState.CREATED;
    private readonly guildID: string;

    constructor(guildID: string) {
        this.guildID = guildID;
    }

    get state(): SessionState {
        return this.currentState;
    }

    /**
     * Attempt a state transition. Returns true if valid and applied,
     * false if rejected (invalid transition).
     */
    transition(to: SessionState): boolean {
        const allowed = VALID_TRANSITIONS[this.currentState];
        const isValid = allowed.has(to);
        const from = this.currentState;

        if (!isValid) {
            logger.warn(
                `gid: ${this.guildID} | Invalid state transition rejected: ${from} → ${to}`,
            );
            return false;
        }

        this.currentState = to;
        logger.info(`gid: ${this.guildID} | State: ${from} → ${to}`);
        return isValid;
    }

    /**
     * Check if a transition would be valid without performing it
     * @param to - The target state to check
     * @returns whether the transition would be valid
     */
    canTransition(to: SessionState): boolean {
        return VALID_TRANSITIONS[this.currentState].has(to);
    }

    /** Convenience: is the session in an "alive" (non-terminal) state? */
    get isAlive(): boolean {
        return (
            this.currentState !== SessionState.ENDING &&
            this.currentState !== SessionState.ENDED
        );
    }

    /** Is the session in a state where rounds can be active? */
    get isRoundCapable(): boolean {
        return (
            this.currentState === SessionState.ROUND_ACTIVE ||
            this.currentState === SessionState.ROUND_ENDING
        );
    }

    /** Is the session accepting commands (guesses, skips, hints)? */
    get isAcceptingInput(): boolean {
        return this.currentState === SessionState.ROUND_ACTIVE;
    }
}
