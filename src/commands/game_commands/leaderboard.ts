import Eris from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getDebugLogHeader, getUserTag, sendErrorMessage, sendInfoMessage, sendPaginationedEmbed, EmbedGenerator, getSqlDateString } from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { chooseRandom, friendlyFormattedNumber, bold, arrayToString } from "../../helpers/utils";
import { state } from "../../kmq";
import { GuildTextableMessage } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import { sendValidationErrorMessage } from "../../helpers/validate";
import KmqMember from "../../structures/kmq_member";

const logger = new IPCLogger("leaderboard");

export enum LeaderboardType {
    GLOBAL = "global",
    SERVER = "server",
    GAME = "game",
}

export enum LeaderboardDuration {
    PERMANENT = "permanent",
    DAILY = "daily",
    WEEKLY = "weekly",
    MONTHLY = "monthly",
}

enum LeaderboardAction {
    ENROLL = "enroll",
    UNENROLL = "unenroll",
}

const leaderboardQuotes = [
    `Want your name to show up on the leaderboard? See ${process.env.BOT_PREFIX}help leaderboard`,
    `Want to see the next page of the leaderboard? See ${process.env.BOT_PREFIX}help leaderboard`,
];

export default class LeaderboardCommand implements BaseCommand {
    help = {
        name: "leaderboard",
        description: "View the KMQ leaderboard.",
        usage: ",leaderboard {server | game} {page_number} {daily | weekly | monthly}\n,leaderboard [enroll | unenroll]",
        examples: [
            {
                example: "`,leaderboard`",
                explanation: "Show the global leaderboard",
            },
            {
                example: "`,leaderboard 3`",
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
                example: "`,leaderboard weekly 4`",
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
        maxArgCount: 3,
        arguments: [],
    };

    aliases = ["lb"];

    call = async ({ message, parsedMessage }: CommandArgs) => {
        if (parsedMessage.components.length === 0) {
            LeaderboardCommand.showLeaderboard(message, LeaderboardType.GLOBAL, LeaderboardDuration.PERMANENT);
            return;
        }

        let type = LeaderboardType.GLOBAL;
        let duration = LeaderboardDuration.PERMANENT;
        let pageOffset = 0;

        for (const arg of parsedMessage.components) {
            if (Object.values(LeaderboardAction).includes(arg as LeaderboardAction)) {
                const action = arg as LeaderboardAction;
                if (action === LeaderboardAction.ENROLL) {
                    LeaderboardCommand.enrollLeaderboard(message);
                } else if (action === LeaderboardAction.UNENROLL) {
                    LeaderboardCommand.unenrollLeaderboard(message);
                }

                return;
            }

            if (Object.values(LeaderboardType).includes(arg as LeaderboardType)) {
                type = arg as LeaderboardType;
            } else if (Object.values(LeaderboardDuration).includes(arg as LeaderboardDuration)) {
                duration = arg as LeaderboardDuration;
            } else if (Number.isInteger(Number(arg)) && Number(arg) > 0) {
                pageOffset = Number(arg) - 1;
            } else if (arg === "page") {
                continue;
            } else {
                const allEnums = arrayToString([...Object.values(LeaderboardType), ...Object.values(LeaderboardDuration), ...Object.values(LeaderboardAction)]);
                sendValidationErrorMessage(message, `Expected one of the following valid values: (a positive number, ${allEnums})`, arg, this.help.usage);
                return;
            }
        }

        LeaderboardCommand.showLeaderboard(message, type, duration, pageOffset);
    };

    public static async sendDebugLeaderboard(duration: LeaderboardDuration) {
        LeaderboardCommand.showLeaderboard(new MessageContext(process.env.DEBUG_TEXT_CHANNEL_ID, KmqMember.fromUser(state.client.user), process.env.DEBUG_SERVER_ID), LeaderboardType.GLOBAL, duration);
    }

    private static async enrollLeaderboard(message: GuildTextableMessage) {
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

    private static async unenrollLeaderboard(message: GuildTextableMessage) {
        await dbContext.kmq("leaderboard_enrollment")
            .where("player_id", "=", message.author.id)
            .del();
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Leaderboard Unenrollment Complete", description: "You are no longer visible on the leaderboard" });
    }

    private static async getLeaderboardEmbeds(messageContext: MessageContext, type: LeaderboardType, duration: LeaderboardDuration): Promise<Array<EmbedGenerator>> {
        const embedsFns: Array<EmbedGenerator> = [];
        const permanentLb = duration === LeaderboardDuration.PERMANENT;
        const dbTable = permanentLb ? "player_stats" : "temporary_player_stats";

        let topPlayersQuery = dbContext.kmq(dbTable)
            .select(permanentLb ? ["exp", "level", "player_id"] : ["player_id"])
            .where(permanentLb ? "exp" : "exp_gained", ">", 0)
            .groupBy("player_id");

        if (!permanentLb) {
            topPlayersQuery = topPlayersQuery
                .sum("exp_gained as exp")
                .sum("levels_gained as level");
        }

        const d = new Date();
        switch (duration) {
            // Give an extra second to send temporary leaderboards to debug channel
            case LeaderboardDuration.DAILY:
                topPlayersQuery = topPlayersQuery
                    .where("date", ">", getSqlDateString(new Date().setHours(0, 0, 1, 0)));
                break;
            case LeaderboardDuration.WEEKLY:
                topPlayersQuery = topPlayersQuery
                    .where("date", ">", getSqlDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay(), 0, 0, 1).getTime()));
                break;
            case LeaderboardDuration.MONTHLY:
                topPlayersQuery = topPlayersQuery
                    .where("date", ">", getSqlDateString(new Date(d.getFullYear(), d.getMonth(), 0, 0, 0, 1).getTime()));
                break;
            default:
                break;
        }

        if (type === LeaderboardType.SERVER) {
            const serverPlayers = (await dbContext.kmq("player_servers")
                .select("player_id")
                .where("server_id", "=", messageContext.guildID)).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.whereIn("player_id", serverPlayers);
        } else if (type === LeaderboardType.GAME) {
            const participantIDs = state.gameSessions[messageContext.guildID].participants;
            const gamePlayers = (await dbContext.kmq(dbTable)
                .select("player_id")
                .whereIn("player_id", [...participantIDs])).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.whereIn("player_id", gamePlayers);
        }

        const pages = await LeaderboardCommand.getPageCount(messageContext, type, duration);
        for (let i = 0; i < pages; i++) {
            const offset = i * 10;
            embedsFns.push(() => new Promise(async (resolve) => {
                const topPlayers = await topPlayersQuery
                    .orderBy("exp", "DESC")
                    .offset(offset)
                    .limit(10);

                const fields: Array<Eris.EmbedField> = await Promise.all(topPlayers.map(async (player, relativeRank) => {
                    const rank = relativeRank + offset;
                    const enrolledPlayer = await dbContext.kmq("leaderboard_enrollment")
                        .where("player_id", "=", player.player_id)
                        .first();

                    const medalIcon = ["🥇", "🥈", "🥉"][rank] || "";
                    const displayName = enrolledPlayer ? enrolledPlayer.display_name : `Rank #${(rank) + 1}`;
                    const rankOrLevelsGained = permanentLb ? `${getRankNameByLevel(player.level)}` : "levels gained";
                    return {
                        name: `${medalIcon} ${displayName}`,
                        value: `${duration !== LeaderboardDuration.PERMANENT ? "+" : ""}${friendlyFormattedNumber(player.exp)} EXP | ${permanentLb ? "Level" : ""} ${friendlyFormattedNumber(player.level)} ${rankOrLevelsGained}`,
                    };
                }));

                let leaderboardType: string;
                switch (type) {
                    case LeaderboardType.GLOBAL:
                        leaderboardType = "Global";
                        break;
                    case LeaderboardType.SERVER:
                        leaderboardType = `${state.client.guilds.get(messageContext.guildID).name}'s`;
                        break;
                    case LeaderboardType.GAME:
                        leaderboardType = "Current Game's";
                        break;
                    default:
                }

                const durationString = !permanentLb ? ` ${duration[0].toUpperCase()}${duration.slice(1)} ` : " ";

                resolve({
                    title: bold(`${leaderboardType}${durationString}Leaderboard`),
                    fields,
                    timestamp: new Date(),
                    thumbnail: { url: KmqImages.THUMBS_UP },
                    footer: { text: chooseRandom(leaderboardQuotes) },
                });
            }));
        }

        return embedsFns;
    }

    private static async getPageCount(messageContext: MessageContext, type: LeaderboardType, duration: LeaderboardDuration): Promise<number> {
        const dbTable = duration === LeaderboardDuration.PERMANENT ? "player_stats" : "temporary_player_stats";
        let playerCountQuery = dbContext.kmq(dbTable)
            .count("* as count")
            .where(duration === LeaderboardDuration.PERMANENT ? "exp" : "exp_gained", ">", 0)
            .distinct("player_id");

        const d = new Date();
        switch (duration) {
            case LeaderboardDuration.DAILY:
                playerCountQuery = playerCountQuery
                    .where("date", ">", getSqlDateString(new Date().setHours(0, 0, 0, 0)));
                break;
            case LeaderboardDuration.WEEKLY:
                playerCountQuery = playerCountQuery
                    .where("date", ">", getSqlDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime()));
                break;
            case LeaderboardDuration.MONTHLY:
                playerCountQuery = playerCountQuery
                    .where("date", ">", getSqlDateString(new Date(d.getFullYear(), d.getMonth()).getTime()));
                break;
            default:
                break;
        }

        switch (type) {
            case LeaderboardType.SERVER:
            {
                const serverPlayers = (await dbContext.kmq("player_servers")
                    .select("player_id")
                    .where("server_id", "=", messageContext.guildID)).map((x) => x.player_id);

                playerCountQuery = playerCountQuery.whereIn("player_id", serverPlayers);
                break;
            }

            case LeaderboardType.GAME:
            {
                const participantIDs = state.gameSessions[messageContext.guildID].participants;
                const gamePlayers = (await dbContext.kmq(dbTable)
                    .select("player_id")
                    .whereIn("player_id", [...participantIDs])).map((x) => x.player_id);

                playerCountQuery = playerCountQuery.whereIn("player_id", gamePlayers);
                break;
            }

            default:
                break;
        }

        const playerCount = (await playerCountQuery.first())["count"] as number;
        return Math.ceil(playerCount / 10);
    }

    private static async showLeaderboard(message: GuildTextableMessage | MessageContext, type: LeaderboardType, duration: LeaderboardDuration, pageOffset: number = 0) {
        const messageContext: MessageContext = message instanceof MessageContext ? message : MessageContext.fromMessage(message);
        if (type === LeaderboardType.GAME) {
            if (!state.gameSessions[message.guildID]) {
                sendErrorMessage(messageContext, { title: "No Active Game", description: "There is no game in progress.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
                return;
            }

            const participantIDs = state.gameSessions[message.guildID].participants;
            if (participantIDs.size === 0) {
                sendErrorMessage(messageContext, { title: "No Participants", description: "Someone needs to score a point before this command works!", thumbnailUrl: KmqImages.NOT_IMPRESSED });
                return;
            }
        }

        const embeds: Array<EmbedGenerator> = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, type, duration);
        if (pageOffset + 1 > await LeaderboardCommand.getPageCount(messageContext, type, duration)) {
            sendErrorMessage(messageContext, { title: "😐", description: "The leaderboard doesn't go this far.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
            return;
        }

        logger.info(`${getDebugLogHeader(message)} | Leaderboard retrieved (${type})`);
        if (!(message instanceof MessageContext)) {
            sendPaginationedEmbed(message, embeds, null, pageOffset + 1);
        } else {
            // Used only in sending leaderboard in debug channel before reset
            state.client.createMessage(process.env.DEBUG_TEXT_CHANNEL_ID, { embeds: [await embeds[pageOffset]()] });
        }
    }
}
