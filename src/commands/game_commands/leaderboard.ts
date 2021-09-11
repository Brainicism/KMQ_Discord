import Eris from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getDebugLogHeader, getUserTag, sendErrorMessage, sendInfoMessage, sendPaginationedEmbed, EmbedGenerator } from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { chooseRandom, friendlyFormattedNumber, bold } from "../../helpers/utils";
import { state } from "../../kmq";
import { GuildTextableMessage } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("leaderboard");

enum LeaderboardType {
    GLOBAL = "global",
    SERVER = "server",
    GAME = "game",
}

enum LeaderboardDuration {
    INDEFINITE = "indefinite",
    DAILY = "daily",
    WEEKLY = "weekly",
    MONTHLY = "monthly",
}

enum LeaderboardAction {
    ENROLL = "enroll",
    UNENROLL = "unenroll",
    PAGE = "page",
    SERVER = "server",
    GAME = "game",
}

const TABLE_BY_DURATION = {
    [LeaderboardDuration.INDEFINITE]: "player_stats",
    [LeaderboardDuration.DAILY]: "daily_player_stats",
    [LeaderboardDuration.WEEKLY]: "weekly_player_stats",
    [LeaderboardDuration.MONTHLY]: "monthly_player_stats",
};

const leaderboardQuotes = [
    `Want your name to show up on the leaderboard? See ${process.env.BOT_PREFIX}help leaderboard`,
    `Want to see the next page of the leaderboard? See ${process.env.BOT_PREFIX}help leaderboard`,
];

export default class LeaderboardCommand implements BaseCommand {
    help = {
        name: "leaderboard",
        description: "View the KMQ leaderboard.",
        usage: ",leaderboard\n,leaderboard {server | game} {page_number} {daily | weekly | monthly}\n,leaderboard [enroll | unenroll]",
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
                explanation: "Shows the server-wide leaderboard",
            },
            {
                example: "`,leaderboard server 3`",
                explanation: "Shows the 3rd page of the server-wide leaderboard",
            },
            {
                example: "`,leaderboard game 2`",
                explanation: "Shows the 2nd page of the players with points in the current game",
            },
            {
                example: "`,leaderboard page 4 weekly`",
                explanation: "Shows the 4th page of the leaderboard, by EXP gain this week",
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

    call = async ({ message, parsedMessage }: CommandArgs) => {
        if (parsedMessage.components.length === 0) {
            this.showLeaderboard(message, 0, LeaderboardType.GLOBAL, LeaderboardDuration.INDEFINITE);
            return;
        }

        const action = parsedMessage.components[0] as LeaderboardAction;
        if (parsedMessage.components.length === 1) {
            switch (action) {
                case LeaderboardAction.ENROLL:
                    this.enrollLeaderboard(message);
                    break;
                case LeaderboardAction.UNENROLL:
                    this.unenrollLeaderboard(message);
                    break;
                case LeaderboardAction.PAGE:
                    this.showLeaderboard(message, 0, LeaderboardType.GLOBAL, LeaderboardDuration.INDEFINITE);
                    break;
                case LeaderboardAction.SERVER:
                    this.showLeaderboard(message, 0, LeaderboardType.SERVER, LeaderboardDuration.INDEFINITE);
                    break;
                case LeaderboardAction.GAME:
                    this.showLeaderboard(message, 0, LeaderboardType.GAME, LeaderboardDuration.INDEFINITE);
                    break;
                default:
                    break;
            }

            return;
        }

        if (parsedMessage.components.length === 2) {
            const pageOffset = parseInt(parsedMessage.components[1]) - 1;
            switch (action) {
                case LeaderboardAction.PAGE:
                    this.showLeaderboard(message, pageOffset, LeaderboardType.GLOBAL, LeaderboardDuration.INDEFINITE);
                    break;
                case LeaderboardAction.SERVER:
                    this.showLeaderboard(message, pageOffset, LeaderboardType.SERVER, LeaderboardDuration.INDEFINITE);
                    break;
                case LeaderboardAction.GAME:
                    this.showLeaderboard(message, pageOffset, LeaderboardType.GAME, LeaderboardDuration.INDEFINITE);
                    break;
                default:
                    sendErrorMessage(MessageContext.fromMessage(message), { title: "Incorrect Leaderboard Usage", description: `See \`${process.env.BOT_PREFIX}help leaderboard\` for more details` });
                    break;
            }
        }
    };

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

    private async getLeaderboardEmbeds(message: GuildTextableMessage, type: LeaderboardType, duration: LeaderboardDuration): Promise<Array<EmbedGenerator>> {
        const embedsFns: Array<EmbedGenerator> = [];
        const dbTable = TABLE_BY_DURATION[duration];

        let topPlayersQuery = dbContext.kmq(dbTable)
            .select(["exp", "level", "player_id"])
            .where("exp", ">", 0);

        if (type === LeaderboardType.SERVER) {
            const serverPlayers = (await dbContext.kmq("player_servers")
                .select("player_id")
                .where("server_id", "=", message.guildID)).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.whereIn("player_id", serverPlayers);
        } else if (type === LeaderboardType.GAME) {
            const participantIDs = state.gameSessions[message.guildID].participants;
            const gamePlayers = (await dbContext.kmq(dbTable)
                .select("player_id")
                .whereIn("player_id", [...participantIDs])).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.whereIn("player_id", gamePlayers);
        }

        const pages = await this.getPageCount(message, type, dbTable);
        for (let i = 0; i < pages; i++) {
            const offset = i * 10;
            embedsFns.push(() => new Promise(async (resolve) => {
                const topPlayers = await topPlayersQuery
                    .orderBy("exp", "DESC")
                    .offset(offset)
                    .limit(10);

                if (topPlayers.length === 0) {
                    resolve({ title: "😐", description: "The leaderboard doesn't go this far", thumbnail: { url: KmqImages.NOT_IMPRESSED } });
                }

                const fields: Array<Eris.EmbedField> = await Promise.all(topPlayers.map(async (player, relativeRank) => {
                    const rank = relativeRank + offset;
                    const enrolledPlayer = await dbContext.kmq("leaderboard_enrollment")
                        .where("player_id", "=", player.player_id)
                        .first();

                    const medalIcon = ["🥇", "🥈", "🥉"][rank] || "";
                    const displayName = enrolledPlayer ? enrolledPlayer.display_name : `Rank #${(rank) + 1}`;
                    return {
                        name: `${medalIcon} ${displayName}`,
                        value: `${friendlyFormattedNumber(player.exp)} EXP | Level ${friendlyFormattedNumber(player.level)} (${getRankNameByLevel(player.level)})`,
                    };
                }));

                let leaderboardType: string;
                switch (type) {
                    case LeaderboardType.GLOBAL:
                        leaderboardType = "Global";
                        break;
                    case LeaderboardType.SERVER:
                        leaderboardType = `${state.client.guilds.get(message.guildID).name}'s`;
                        break;
                    case LeaderboardType.GAME:
                        leaderboardType = "Current Game's";
                        break;
                    default:
                }

                resolve({
                    title: bold(`${leaderboardType} Leaderboard`),
                    fields,
                    timestamp: new Date(),
                    thumbnail: { url: KmqImages.THUMBS_UP },
                    footer: { text: chooseRandom(leaderboardQuotes) },
                });
            }));
        }

        return embedsFns;
    }

    private async getPageCount(message: GuildTextableMessage, type: LeaderboardType, dbTable: string): Promise<number> {
        let playerCount: number;
        switch(type) {
            case LeaderboardType.SERVER:
                const serverPlayers = (await dbContext.kmq("player_servers")
                    .select("player_id")
                    .where("server_id", "=", message.guildID)).map((x) => x.player_id);

                playerCount = serverPlayers.length;
                break;
            case LeaderboardType.GAME:
                const participantIDs = state.gameSessions[message.guildID].participants;
                const gamePlayers = (await dbContext.kmq(dbTable)
                    .select("player_id")
                    .whereIn("player_id", [...participantIDs])).map((x) => x.player_id);

                playerCount = gamePlayers.length;
                break;
            default:
                playerCount = ((await dbContext.kmq(dbTable).count("player_id as count")
                    .where("exp", ">", 0)
                    .first())["count"] as number);
                break;
        }

        return Math.ceil(playerCount / 10);
    }

    private async showLeaderboard(message: GuildTextableMessage, pageOffset: number, type: LeaderboardType, duration: LeaderboardDuration) {
        if (type === LeaderboardType.GAME) {
            if (!state.gameSessions[message.guildID]) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "No Active Game", description: "There is no game in progress.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
                return;
            }

            const participantIDs = state.gameSessions[message.guildID].participants;
            if (participantIDs.size === 0) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "No Participants", description: "Someone needs to score a point before this command works!", thumbnailUrl: KmqImages.NOT_IMPRESSED });
                return;
            }
        }

        const embeds: Array<EmbedGenerator> = await this.getLeaderboardEmbeds(message, type, duration);
        if (pageOffset + 1 > await this.getPageCount(message, type, TABLE_BY_DURATION[duration])) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "😐", description: "The leaderboard doesn't go this far", thumbnailUrl: KmqImages.NOT_IMPRESSED });
            return;
        }

        logger.info(`${getDebugLogHeader(message)} | Leaderboard retrieved (${type})`);
        sendPaginationedEmbed(message, embeds, null, pageOffset + 1);
    }
}
