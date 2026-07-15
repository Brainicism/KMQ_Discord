export default interface ActivityChatArgs {
    guildID: string;
    userID: string;
    /** The raw message text; trimmed, length-checked, and profanity-masked
     *  server-side before it is broadcast to the room. */
    text: string;
}
