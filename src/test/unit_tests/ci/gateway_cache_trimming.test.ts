import {
    trimGuildPayload,
    uncacheCategoryChannel,
} from "../../../helpers/gateway_cache_trimming";
import Eris from "eris";
import KmqClient from "../../../kmq_client";
import assert from "assert";

const GUILD_ID = "100000000000000000";
const TEXT_ID = "100000000000000001";
const VOICE_ID = "100000000000000002";
const CATEGORY_ID = "100000000000000003";

/**
 * @param client - the Eris client
 * @returns a shard whose packets go through the same path as the gateway's
 */
function shardFor(client: Eris.Client): Eris.Shard {
    const shard = new Eris.Shard(0, client);
    client.shards.set(0, shard);
    return shard;
}

const guildCreate = (): Eris.RawPacket =>
    ({
        op: 0,
        t: "GUILD_CREATE",
        s: 1,
        d: {
            id: GUILD_ID,
            name: "guild",
            roles: [],
            members: [],
            voice_states: [],
            emojis: [{ id: "1", name: "pepe", roles: [] }],
            stickers: [{ id: "2", name: "sticker" }],
            channels: [
                {
                    id: TEXT_ID,
                    type: 0,
                    name: "general",
                    parent_id: CATEGORY_ID,
                },
                {
                    id: VOICE_ID,
                    type: 2,
                    name: "voice",
                    parent_id: CATEGORY_ID,
                },
                { id: CATEGORY_ID, type: 4, name: "Category" },
            ],
        },
    }) as unknown as Eris.RawPacket;

describe("gateway cache trimming", () => {
    let client: Eris.Client;
    let shard: Eris.Shard;
    beforeEach(() => {
        client = new Eris.Client("Bot token", {
            restMode: true,
            messageLimit: 0,
        });

        client.on("rawWS", trimGuildPayload);
        client.on("channelCreate", (channel) =>
            uncacheCategoryChannel(client, channel),
        );

        shard = shardFor(client);
    });

    it("caches guilds without emojis, stickers, or category channels", () => {
        shard.onPacket(guildCreate());
        const guild = client.guilds.get(GUILD_ID)!;

        assert.deepStrictEqual(guild.emojis, []);
        assert.deepStrictEqual(guild.stickers, []);
        assert.deepStrictEqual(
            [...guild.channels.keys()].sort(),
            [TEXT_ID, VOICE_ID].sort(),
        );

        assert.strictEqual(client.channelGuildMap[CATEGORY_ID], undefined);
        assert.strictEqual(client.channelGuildMap[TEXT_ID], GUILD_ID);
    });

    it("drops categories created later, but keeps other new channels", () => {
        shard.onPacket(guildCreate());
        shard.onPacket({
            op: 0,
            t: "CHANNEL_CREATE",
            s: 2,
            d: {
                id: "100000000000000004",
                type: 4,
                guild_id: GUILD_ID,
                name: "c2",
            },
        } as unknown as Eris.RawPacket);

        shard.onPacket({
            op: 0,
            t: "CHANNEL_CREATE",
            s: 3,
            d: {
                id: "100000000000000005",
                type: 0,
                guild_id: GUILD_ID,
                name: "t2",
            },
        } as unknown as Eris.RawPacket);

        const guild = client.guilds.get(GUILD_ID)!;
        assert.strictEqual(guild.channels.has("100000000000000004"), false);
        assert.strictEqual(guild.channels.has("100000000000000005"), true);
    });

    it("ignores updates and deletes for the uncached category", () => {
        shard.onPacket(guildCreate());
        assert.doesNotThrow(() => {
            shard.onPacket({
                op: 0,
                t: "CHANNEL_UPDATE",
                s: 2,
                d: {
                    id: CATEGORY_ID,
                    type: 4,
                    guild_id: GUILD_ID,
                    name: "renamed",
                },
            } as unknown as Eris.RawPacket);

            shard.onPacket({
                op: 0,
                t: "CHANNEL_DELETE",
                s: 3,
                d: { id: CATEGORY_ID, type: 4, guild_id: GUILD_ID },
            } as unknown as Eris.RawPacket);
        });

        assert.strictEqual(client.guilds.get(GUILD_ID)!.channels.size, 2);
    });

    it("leaves other packets alone", () => {
        const packet = {
            op: 0,
            t: "MESSAGE_CREATE",
            d: { emojis: ["x"], channels: [{ type: 4 }] },
        } as unknown as Eris.RawPacket;

        trimGuildPayload(packet);
        assert.deepStrictEqual(packet.d, {
            emojis: ["x"],
            channels: [{ type: 4 }],
        });
    });

    it("is registered by KmqClient before any shard connects", () => {
        const kmqClient = new KmqClient("Bot token", {
            restMode: true,
            messageLimit: 0,
        });

        assert.ok(kmqClient.listeners("rawWS").includes(trimGuildPayload));
    });
});
