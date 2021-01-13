import Eris from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getDebugLogHeader, sendEmbed } from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { bold } from "../../helpers/utils";

const logger = _logger("leaderboard");

export default class LeaderboardCommand implements BaseCommand {
    help = {
        name: "leaderboard",
        description: "View the global KMQ leaderboard.",
        usage: "!leaderboard",
        examples: [],
        priority: 50,
    };

    async call({ message }: CommandArgs) {
        const topPlayers = await dbContext.kmq("player_stats")
            .select(["exp", "level"])
            .orderBy("exp", "DESC")
            .limit(10);

        logger.info(`${getDebugLogHeader(message)} | Leaderboard retrieved`);
        const fields: Array<Eris.EmbedField> = topPlayers.map((player, rank) => ({
            name: `Rank #${rank + 1}`,
            value: `${player.exp} xp | Level ${player.level} (${getRankNameByLevel(player.level)})`,
        }));

        sendEmbed(message.channel, {
            title: bold("Leaderboard"),
            fields,
            timestamp: new Date(),
        });
    }
}
