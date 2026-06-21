export default interface ActivityProfileArgs {
    guildID: string;
    /** The requesting user (used for locale + buff calculation context). */
    userID: string;
    /**
     * Whose profile to fetch. Defaults to `userID` when omitted. The web layer
     * validates that this is a participant of the activity instance before
     * forwarding, so the worker can trust it.
     */
    targetUserID?: string;
}
