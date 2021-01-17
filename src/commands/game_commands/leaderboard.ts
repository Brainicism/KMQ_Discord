import Eris, { GuildTextableChannel } from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getDebugLogHeader, getUserTag, sendEmbed, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { bold } from "../../helpers/utils";

const logger = _logger("leaderboard");

enum LeaderboardAction {
    ENROLL = "enroll",
    UNEROLL = "unenroll",
}

export default class LeaderboardCommand implements BaseCommand {
    help = {
        name: "leaderboard",
        description: "View the global KMQ leaderboard.",
        usage: "!leaderboard",
        examples: [
            {
                example: "`!leaderboard`",
                explanation: "Show the KMQ leaderboard",
            },
            {
                example: "`!leaderboard enroll`",
                explanation: "Displays your name on the leaderboard if you are in the top 10",
            },
            {
                example: "`!leaderboard unenroll`",
                explanation: "Hides your name from the leaderboard if you are in the top 10",
            },
        ],
        priority: 50,
    };

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "action",
                type: "enum" as const,
                enums: Object.values(LeaderboardAction),
            },
        ],
    };

    async call({ message, parsedMessage }: CommandArgs) {
        if (parsedMessage.components.length === 0) {
            this.showLeaderboard(message);
        } else {
            const action = parsedMessage.components[0] as LeaderboardAction;
            if (action === LeaderboardAction.ENROLL) {
                this.enrollLeaderboard(message);
            } else {
                this.unenrollLeaderboard(message);
            }
        }
    }

    private async enrollLeaderboard(message: Eris.Message<GuildTextableChannel>) {
        const alreadyEnrolled = !!(await dbContext.kmq("leaderboard_enrollment")
            .where("player_id", "=", message.author.id)
            .first());

        if (alreadyEnrolled) {
            sendErrorMessage(message, "Player Already Enrolled", "You are already visible on the leaderboard. If you'd like to update your display name, unenroll and enroll again.");
            return;
        }

        await dbContext.kmq("leaderboard_enrollment")
            .insert({
                player_id: message.author.id,
                display_name: getUserTag(message.author),
            });
        sendInfoMessage(message, "Leaderboard Enrollment Complete", "You are now visible on the leaderboard if you are in the Top 10");
    }

    private async unenrollLeaderboard(message: Eris.Message<GuildTextableChannel>) {
        await dbContext.kmq("leaderboard_enrollment")
            .where("player_id", "=", message.author.id)
            .del();
        sendInfoMessage(message, "Leaderboard Unenrollment Complete", "You are no longer visible on the leaderboard");
    }
    private async showLeaderboard(message: Eris.Message<GuildTextableChannel>) {
        const topPlayers = await dbContext.kmq("player_stats")
            .select(["exp", "level", "player_id"])
            .orderBy("exp", "DESC")
            .limit(10);

        logger.info(`${getDebugLogHeader(message)} | Leaderboard retrieved`);
        const fields: Array<Eris.EmbedField> = await Promise.all(topPlayers.map(async (player, rank) => {
            const enrolledPlayer = await dbContext.kmq("leaderboard_enrollment")
                .where("player_id", "=", player.player_id)
                .first();
            return {
                name: enrolledPlayer ? enrolledPlayer.display_name : `Rank #${rank + 1}`,
                value: `${player.exp} xp | Level ${player.level} (${getRankNameByLevel(player.level)})`,
            };
        }));

        sendEmbed(message.channel, {
            title: bold("Leaderboard"),
            fields,
            timestamp: new Date(),
            footer: {
                text: `On this list and want your name to show up? See \`${process.env.BOT_PREFIX}help leaderboard\``,
            },
        });
    }
}
