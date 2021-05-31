import Eris from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getDebugLogHeader, getUserTag, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { chooseRandom } from "../../helpers/utils";
import state from "../../kmq";
import { GuildTextableMessage } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";

const logger = _logger("leaderboard");

enum LeaderboardAction {
    ENROLL = "enroll",
    UNEROLL = "unenroll",
    PAGE = "page",
    SERVER = "server",
}

const leaderboardQuotes = [
    `Want your name to show up on the leaderboard? See \`${process.env.BOT_PREFIX}help leaderboard\``,
    `Want to see the next page of the leaderboard? See \`${process.env.BOT_PREFIX}help leaderboard\``,
];

export default class LeaderboardCommand implements BaseCommand {
    help = {
        name: "leaderboard",
        description: "View the KMQ leaderboard.",
        usage: ",leaderboard",
        examples: [
            {
                example: "`,leaderboard`",
                explanation: "Show the global leaderboard",
            },
            {
                example: "`,leaderboard page 3`",
                explanation: "Shows the 3rd page of the global leaderboard",
            },
            {
                example: "`,leaderboard server`",
                explanation: "Show the server-wide leaderboard",
            },
            {
                example: "`,leaderboard server 3`",
                explanation: "Show the 3rd page of the server-wide leaderboard",
            },
            {
                example: "`,leaderboard enroll`",
                explanation: "Allows your name to be displayed on the leaderboard",
            },
            {
                example: "`,leaderboard unenroll`",
                explanation: "Hides your name from the leaderboard",
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
            this.showLeaderboard(message, 0, false);
            return;
        }
        const action = parsedMessage.components[0] as LeaderboardAction;
        if (parsedMessage.components.length === 1) {
            if (action === LeaderboardAction.ENROLL) {
                this.enrollLeaderboard(message);
            } else if (action === LeaderboardAction.UNEROLL) {
                this.unenrollLeaderboard(message);
            } else if (action === LeaderboardAction.PAGE) {
                this.showLeaderboard(message, 0, false);
            } else if (action === LeaderboardAction.SERVER) {
                this.showLeaderboard(message, 0, true);
            }
            return;
        }

        if (parsedMessage.components.length === 2) {
            const pageOffset = parseInt(parsedMessage.components[1]) - 1;
            if (action === LeaderboardAction.PAGE) {
                this.showLeaderboard(message, pageOffset, false);
            } else if (action === LeaderboardAction.SERVER) {
                this.showLeaderboard(message, pageOffset, true);
            } else {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "Incorrect Leaderboard Usage", description: `See \`${process.env.BOT_PREFIX}help leaderboard\` for more details` });
            }
        }
    }

    private async enrollLeaderboard(message: GuildTextableMessage) {
        const alreadyEnrolled = !!(await dbContext.kmq("leaderboard_enrollment")
            .where("player_id", "=", message.author.id)
            .first());

        if (alreadyEnrolled) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Player Already Enrolled", description: "You are already visible on the leaderboard. If you'd like to update your display name, unenroll and enroll again." });
            return;
        }

        await dbContext.kmq("leaderboard_enrollment")
            .insert({
                player_id: message.author.id,
                display_name: getUserTag(message.author),
            });
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Leaderboard Enrollment Complete", description: "Your name is now visible on the leaderboard" });
    }

    private async unenrollLeaderboard(message: GuildTextableMessage) {
        await dbContext.kmq("leaderboard_enrollment")
            .where("player_id", "=", message.author.id)
            .del();
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Leaderboard Unenrollment Complete", description: "You are no longer visible on the leaderboard" });
    }
    private async showLeaderboard(message: GuildTextableMessage, pageOffset: number, serverSpecific: boolean) {
        const offset = 10 * pageOffset;
        let topPlayersQuery = dbContext.kmq("player_stats")
            .select(["exp", "level", "player_id"])
            .where("exp", ">", 0);

        if (serverSpecific) {
            const serverPlayers = (await dbContext.kmq("player_servers")
                .select("player_id")
                .where("server_id", "=", message.guildID)).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.whereIn("player_id", serverPlayers);
        }

        const topPlayers = await topPlayersQuery
            .orderBy("exp", "DESC")
            .offset(offset)
            .limit(10);

        if (topPlayers.length === 0) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "😐", description: "The leaderboard doesn't go this far" });
            return;
        }

        logger.info(`${getDebugLogHeader(message)} | Leaderboard retrieved`);
        const fields: Array<Eris.EmbedField> = await Promise.all(topPlayers.map(async (player, relativeRank) => {
            const rank = relativeRank + offset;
            const enrolledPlayer = await dbContext.kmq("leaderboard_enrollment")
                .where("player_id", "=", player.player_id)
                .first();
            const medalIcon = ["🥇", "🥈", "🥉"][rank] || "";
            const displayName = enrolledPlayer ? enrolledPlayer.display_name : `Rank #${(rank) + 1}`;
            return {
                name: `${medalIcon} ${displayName}`,
                value: `${player.exp} EXP | Level ${player.level} (${getRankNameByLevel(player.level)})`,
            };
        }));

        const leaderboardType = serverSpecific ? `${state.client.guilds.get(message.guildID).name}'s` : "Global";
        const leaderboardTitle = `${leaderboardType} Leaderboard (Page ${pageOffset + 1})`;
        sendInfoMessage(MessageContext.fromMessage(message), {
            title: leaderboardTitle,
            fields,
            timestamp: new Date(),
            thumbnailUrl: KmqImages.THUMBS_UP,
            footerText: chooseRandom(leaderboardQuotes),
        });
    }
}
