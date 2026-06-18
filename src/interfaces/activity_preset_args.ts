/** Which preset operation the Activity is requesting. */
export type ActivityPresetAction = "list" | "save" | "load" | "delete";

/**
 * Payload for the "preset" admiral-to-worker IPC op. `name` is required for
 * save / load / delete and ignored for list.
 */
export default interface ActivityPresetArgs {
    guildID: string;
    userID: string;
    action: ActivityPresetAction;
    name?: string;
}
