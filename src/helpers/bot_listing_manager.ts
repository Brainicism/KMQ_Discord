import { IPCLogger } from "../logger";
import { VOTE_BONUS_DURATION } from "../constants";
import Axios from "axios";
import dbContext from "../database_context";
import type { IPC } from "eris-fleet";

const logger = new IPCLogger("bot_stats_poster");
interface BotListing {
    endpoint: string;
    payloadKeyName: string;
    name: string;
}

const BOT_LISTING_SITES: { [siteName: string]: BotListing } = {
    TOP_GG_TOKEN: {
        endpoint: "https://top.gg/api/bots/%d/stats",
        payloadKeyName: "server_count",
        name: "top.gg",
    },
    DISCORD_BOTS_GG_TOKEN: {
        endpoint: "https://discord.bots.gg/api/v1/bots/%d/stats",
        payloadKeyName: "guildCount",
        name: "discord.bots.gg",
    },
    DISCORD_BOT_LIST_TOKEN: {
        endpoint: "https://discordbotlist.com/api/v1/bots/%d/stats",
        payloadKeyName: "guilds",
        name: "discordbotlist.com",
    },
    KOREAN_BOTS_TOKEN: {
        endpoint: "https://koreanbots.dev/api/v2/bots/%d/stats",
        payloadKeyName: "servers",
        name: "koreanbots.dev",
    },
};

/**
 * @param userID - The user's Discord ID
 */
export async function userVoted(userID: string): Promise<void> {
    const userVoterStatus = await dbContext.kmq
        .selectFrom("top_gg_user_votes")
        .select(["total_votes"])
        .where("user_id", "=", userID)
        .executeTakeFirst();

    const currentVotes = userVoterStatus ? userVoterStatus["total_votes"] : 0;
    const updatePayload = {
        user_id: userID,
        buff_expiry_date: new Date(
            Date.now() + VOTE_BONUS_DURATION * 1000 * 60 * 60,
        ),
        total_votes: currentVotes + 1,
    };

    await dbContext.kmq
        .insertInto("top_gg_user_votes")
        .values(updatePayload)
        .onDuplicateKeyUpdate(updatePayload)
        .execute();

    logger.info(`uid: ${userID} | User vote recorded`);
}

export default class BotListingManager {
    private ipc: IPC;

    constructor(ipc: IPC) {
        this.ipc = ipc;
    }

    start(): void {
        setInterval(() => {
            this.postStats();
        }, 1800000);
    }

    private postStats(): void {
        for (const siteConfigKeyName of Object.keys(BOT_LISTING_SITES).filter(
            (x) => x in process.env,
        )) {
            this.postStat(siteConfigKeyName);
        }
    }

    private async postStat(siteConfigKeyName: string): Promise<void> {
        const botListing = BOT_LISTING_SITES[siteConfigKeyName];
        try {
            await Axios.post(
                botListing.endpoint.replace(
                    "%d",
                    process.env.BOT_CLIENT_ID as string,
                ),
                {
                    [botListing.payloadKeyName]: (await this.ipc.getStats())
                        .guilds,
                },
                {
                    headers: {
                        Authorization: process.env[siteConfigKeyName] as string,
                    },
                },
            );
            logger.info(`${botListing.name} server count posted`);
        } catch (e) {
            logger.error(
                `Error updating ${botListing.name} server count. error = ${e}`,
            );
        }
    }
}
