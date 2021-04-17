import Axios from "axios";
import _logger from "../logger";
import state from "../kmq";
import dbContext from "../database_context";

const logger = _logger("bot_stats_poster");
const VOTE_COOLDOWN_HOURS = 12;
const VOTE_BONUS_DURATION = 1;
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
};
export default class BotStatsPoster {
    start() {
        setInterval(() => { this.postStats(); }, 1800000);
    }

    private async postStats() {
        for (const siteConfigKeyName of Object.keys(BOT_LISTING_SITES).filter((x) => x in process.env)) {
            this.postStat(siteConfigKeyName);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private async postStat(siteConfigKeyName: string) {
        const botListing = BOT_LISTING_SITES[siteConfigKeyName];
        const { client } = state;
        try {
            await Axios.post(botListing.endpoint.replace("%d", client.user.id), {
                [botListing.payloadKeyName]: client.guilds.size,
            }, {
                headers: {
                    Authorization: process.env[siteConfigKeyName],
                },
            });
            logger.info(`${botListing.name} server count posted`);
        } catch (e) {
            logger.error(`Error updating ${botListing.name} server count. error = ${e}`);
        }
    }
}

/**
 * @param userIDs - List of user IDs to check if vote bonus is active
 * @returns - list of user IDs with vote bonus active
 */
export async function usersQualifyForVoteBonus(userIDs: Array<string>): Promise<Array<string>> {
    const qualifiedIDs = (await dbContext.kmq("top_gg_user_votes")
        .whereIn("user_id", userIDs)
        .andWhere("last_voted", ">", new Date(Date.now() - (VOTE_BONUS_DURATION * 1000 * 60 * 60))))
        .map((x) => x["user_id"]);
    return qualifiedIDs;
}

/**
 * @param userID - The user's Discord ID
 * @returns the hours remaining until the user is eligible to vote again
 */
export async function userVoted(userID: string): Promise<number> {
    const userVoterStatus = await dbContext.kmq("top_gg_user_votes")
        .where("user_id", "=", userID)
        .first();
    if (userVoterStatus) {
        const lastVote = userVoterStatus["last_voted"];
        const hoursSinceLastVote = (Date.now() - lastVote) / (1000 * 60 * 60);
        if (hoursSinceLastVote < VOTE_COOLDOWN_HOURS) {
            const cooldownRemaining = (VOTE_COOLDOWN_HOURS - hoursSinceLastVote);
            logger.warn(`uid: ${userID} | User has already voted recently, try again in ${cooldownRemaining.toFixed(1)} hours`);
            return cooldownRemaining;
        }
    }
    const currentVotes = userVoterStatus ? userVoterStatus["total_votes"] : 0;
    await dbContext.kmq("top_gg_user_votes")
        .insert({
            user_id: userID,
            last_voted: new Date(),
            total_votes: currentVotes + 1,
        })
        .onConflict("user_id")
        .merge();

    logger.info(`uid: ${userID} | User vote recorded`);
    return 0;
}
