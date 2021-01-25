import Eris, { GuildTextableChannel } from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getDebugLogHeader, getUserTag, sendEmbed, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { bold, chooseRandom } from "../../helpers/utils";

const logger = _logger("leaderboard");

enum LeaderboardAction {
    ENROLL = "enroll",
    UNEROLL = "unenroll",
    PAGE = "page",
}

const leaderboardQuotes = [
    `Want your name to show up on the leaderboard? See \`${process.env.BOT_PREFIX}help leaderboard\``,
    `Want to see the next page of the leaderboard? See \`${process.env.BOT_PREFIX}help leaderboard\``,
];

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
                explanation: "Allows your name to be displayed on the leaderboard",
            },
            {
                example: "`!leaderboard unenroll`",
                explanation: "Hides your name from the leaderboard",
            },
            {
                example: "`!leaderboard page 3`",
                explanation: "Shows the 3rd page of the leaderboard",
            },
        ],
        priority: 50,
    };

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "action",
                type: "enum" as const,
                enums: Object.values(LeaderboardAction),
            },
            {
                name: "page_number",
                type: "number" as const,
                minValue: 1,
            },
        ],
    };

    aliases = ["lb"];

    async call({ message, parsedMessage }: CommandArgs) {
        if (parsedMessage.components.length === 0) {
            this.showLeaderboard(message, 0);
            return;
        }
        const action = parsedMessage.components[0] as LeaderboardAction;
        if (parsedMessage.components.length === 1) {
            if (action === LeaderboardAction.ENROLL) {
                this.enrollLeaderboard(message);
            } else if (action === LeaderboardAction.UNEROLL) {
                this.unenrollLeaderboard(message);
            } else if (action === LeaderboardAction.PAGE) {
                this.showLeaderboard(message, 0);
            }
            return;
        }

        if (parsedMessage.components.length === 2) {
            if (action === LeaderboardAction.PAGE) {
                this.showLeaderboard(message, 10 * (parseInt(parsedMessage.components[1], 10) - 1));
            } else {
                sendErrorMessage(message, "Incorrect Leaderboard Usage", `See \`${process.env.BOT_PREFIX}help leaderboard\` for more details`);
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
        sendInfoMessage(message, "Leaderboard Enrollment Complete", "Your name is now visible on the leaderboard");
    }

    private async unenrollLeaderboard(message: Eris.Message<GuildTextableChannel>) {
        await dbContext.kmq("leaderboard_enrollment")
            .where("player_id", "=", message.author.id)
            .del();
        sendInfoMessage(message, "Leaderboard Unenrollment Complete", "You are no longer visible on the leaderboard");
    }

    private async showLeaderboard(message: Eris.Message<GuildTextableChannel>, offset: number) {
        const topPlayers = await dbContext.kmq("player_stats")
            .select(["exp", "level", "player_id"])
            .orderBy("exp", "DESC")
            .where("exp", ">", 0)
            .offset(offset)
            .limit(10);

        if (topPlayers.length === 0) {
            sendErrorMessage(message, "😐", "The leaderboard doesn't go this far");
            return;
        }
        logger.info(`${getDebugLogHeader(message)} | Leaderboard retrieved`);
        const fields: Array<Eris.EmbedField> = await Promise.all(topPlayers.map(async (player, rank) => {
            const enrolledPlayer = await dbContext.kmq("leaderboard_enrollment")
                .where("player_id", "=", player.player_id)
                .first();
            const medalIcon = ["🥇", "🥈", "🥉"][rank] || "";
            const displayName = enrolledPlayer ? enrolledPlayer.display_name : `Rank #${(rank + offset) + 1}`;
            return {
                name: `${medalIcon} ${displayName}`,
                value: `${player.exp} xp | Level ${player.level} (${getRankNameByLevel(player.level)})`,
            };
        }));

        sendEmbed(message.channel, {
            title: bold("Leaderboard"),
            fields,
            timestamp: new Date(),
            footer: {
                text: chooseRandom(leaderboardQuotes),
            },
        });
    }
}
