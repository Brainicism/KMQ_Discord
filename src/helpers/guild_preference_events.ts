import { EventEmitter } from "events";

/**
 * Module-level pub/sub for GuildPreference writes. Lives outside of
 * `structures/guild_preference.ts` to avoid a cyclic import with the Activity
 * bridge, which subscribes to these events to broadcast option changes to
 * open Activity sockets.
 *
 * Fired once per successful `updateGuildPreferences` call (i.e. any setter
 * or reset that persists to the DB), so Activity listeners see the same
 * guildID for writes coming from both slash commands and Activity IPC ops.
 */
const guildPreferenceEvents = new EventEmitter();

/**
 * Fires a "changed" event for the given guild. Called by
 * GuildPreference.updateGuildPreferences after persistence.
 * @param guildID - The guild whose preferences were just written.
 */
export function emitGuildPreferenceChanged(guildID: string): void {
    guildPreferenceEvents.emit("changed", guildID);
}

/**
 * Registers a listener for GuildPreference write events.
 * @param listener - Called with the guildID of the write.
 */
export function onGuildPreferenceChanged(
    listener: (guildID: string) => void,
): void {
    guildPreferenceEvents.on("changed", listener);
}
