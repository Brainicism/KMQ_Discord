/** A single web-room chat message (profanity-masked server-side). */
export default interface ChatMessage {
    /** Server-assigned id, used as the React key. */
    id: string;
    userID: string;
    username: string;
    avatarUrl: string | null;
    text: string;
    ts: number;
}
