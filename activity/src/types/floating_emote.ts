// A transient emote drifting up the screen after a player flung it.
export default interface FloatingEmote {
    /** Unique key for React + dismissal. */
    id: string;
    emote: string;
    /** Horizontal anchor as a viewport percentage (0–100). */
    left: number;
}
