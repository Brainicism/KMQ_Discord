export default interface ActivityEmoteArgs {
    guildID: string;
    userID: string;
    /** One of ACTIVITY_EMOTES; validated server-side before broadcast. */
    emote: string;
}
