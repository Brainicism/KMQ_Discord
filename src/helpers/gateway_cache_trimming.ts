import type Eris from "eris";

const GUILD_CATEGORY_CHANNEL_TYPE = 4;

/**
 * Strips data KMQ never reads from guild gateway payloads before Eris caches
 * it. With ~17k guilds per cluster, Eris's cache is most of a worker's heap:
 * per cluster that's ~90k category channels (+overwrites) and ~375k emoji
 * objects, none of which KMQ or Eris use (Eris's permission checks don't read
 * the parent category; KMQ's one emoji check fetches them over REST).
 *
 * Mutates the packet in place; Eris emits `rawWS` synchronously before it
 * processes the packet.
 * @param packet - the raw gateway packet
 */
export function trimGuildPayload(packet: Eris.RawPacket): void {
    if (packet.t !== "GUILD_CREATE" && packet.t !== "GUILD_UPDATE") {
        return;
    }

    const data = packet.d as {
        channels?: Array<{ type: number }>;
        emojis?: Array<unknown>;
        stickers?: Array<unknown>;
    } | null;

    if (!data) return;
    if (data.emojis) data.emojis = [];
    if (data.stickers) data.stickers = [];
    if (data.channels) {
        data.channels = data.channels.filter(
            (channel) => channel.type !== GUILD_CATEGORY_CHANNEL_TYPE,
        );
    }
}

/**
 * Drops a newly created category channel from Eris's cache (CHANNEL_CREATE
 * can't be filtered before Eris builds the channel). Later CHANNEL_UPDATE /
 * CHANNEL_DELETE events for uncached channels are no-ops in Eris.
 * @param client - the Eris client
 * @param channel - the created channel
 */
export function uncacheCategoryChannel(
    client: Eris.Client,
    channel: Eris.AnyChannel,
): void {
    if (channel.type !== GUILD_CATEGORY_CHANNEL_TYPE) return;
    const guildChannel = channel as Eris.CategoryChannel;
    guildChannel.guild.channels.remove(guildChannel);
    delete client.channelGuildMap[guildChannel.id];
}
