export default interface ActivityMcGuessArgs {
    guildID: string;
    userID: string;
    /** The round button custom_id (uuid) the player tapped. */
    choiceID: string;
    ts: number;
}
