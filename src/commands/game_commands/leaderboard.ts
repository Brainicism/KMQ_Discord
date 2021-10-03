import Eris from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getDebugLogHeader, getUserTag, sendErrorMessage, sendInfoMessage, sendPaginationedEmbed, EmbedGenerator, sendMessage } from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { chooseRandom, friendlyFormattedNumber, bold, arrayToString } from "../../helpers/utils";
import { state } from "../../kmq";
import { GuildTextableMessage, EnvType } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import { sendValidationErrorMessage } from "../../helpers/validate";
import KmqMember from "../../structures/kmq_member";

const logger = new IPCLogger("leaderboard");
export const ENTRIES_PER_PAGE = 10;

export enum LeaderboardType {
    GLOBAL = "global",
    SERVER = "server",
    GAME = "game",
}

export enum LeaderboardDuration {
    ALL_TIME = "all-time",
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
        usage: ",leaderboard {page_number}\n,leaderboard {server | game} {daily | weekly | monthly} {page_number}\n,leaderboard [enroll | unenroll]",
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
                example: "`,leaderboard enroll`",
                explanation: "Allows your name to be displayed on the leaderboard",
            },
            {
                example: "`,leaderboard unenroll`",
                explanation: "Hides your name from the leaderboard",
            },
            {
                example: "`,leaderboard game monthly 2`",
                explanation: "Shows the 2nd page of the monthly scoreboard containing players with points in the current game",
            },
            {
                example: "`,leaderboard weekly 4`",
                explanation: "Shows the 4th page of the leaderboard, by EXP gained this week",
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
            LeaderboardCommand.showLeaderboard(message, LeaderboardType.GLOBAL, LeaderboardDuration.ALL_TIME);
            return;
        }

        let arg = parsedMessage.components[0];
        let action: LeaderboardAction;
        if (Object.values(LeaderboardAction).includes(arg as LeaderboardAction)) {
            action = arg as LeaderboardAction;
            if (action === LeaderboardAction.ENROLL) {
                LeaderboardCommand.enrollLeaderboard(message);
            } else if (action === LeaderboardAction.UNENROLL) {
                LeaderboardCommand.unenrollLeaderboard(message);
            }

            return;
        }

        let type: LeaderboardType;
        let duration: LeaderboardDuration;
        const lastArg = parsedMessage.components[parsedMessage.components.length - 1];
        const pageOffset = Number.isInteger(Number(lastArg)) && Number(lastArg) > 0 ? Number(lastArg) : 0;

        if (Object.values(LeaderboardType).includes(arg as LeaderboardType)) {
            type = arg as LeaderboardType;
        }

        if (Object.values(LeaderboardDuration).includes(arg as LeaderboardDuration)) {
            duration = arg as LeaderboardDuration;
        }

        if (pageOffset === 0 && !type && !duration) {
            sendValidationErrorMessage(message, `Expected one of the following valid values for the first argument: (a positive number, ${arrayToString([...Object.values(LeaderboardType), ...Object.values(LeaderboardDuration)])})`, arg, this.help.usage);
            return;
        }

        if (parsedMessage.components.length === 1) {
            LeaderboardCommand.showLeaderboard(message, type ?? LeaderboardType.GLOBAL, duration ?? LeaderboardDuration.ALL_TIME, pageOffset);
            return;
        }

        arg = parsedMessage.components[1];
        if (Object.values(LeaderboardDuration).includes(arg as LeaderboardDuration)) {
            duration = arg as LeaderboardDuration;
        } else if (pageOffset === 0) {
            sendValidationErrorMessage(message, `Expected one of the following valid values for the second argument: (a positive number, ${arrayToString(Object.values(LeaderboardDuration))})`, arg, this.help.usage);
            return;
        }

        if (pageOffset === 0 && parsedMessage.components.length > 2) {
            sendValidationErrorMessage(message, "Expected one of the following valid values for the third argument: (a positive number)", arg, this.help.usage);
            return;
        }

        LeaderboardCommand.showLeaderboard(message, type ?? LeaderboardType.GLOBAL, duration ?? LeaderboardDuration.ALL_TIME, pageOffset);
    };

    public static async sendDebugLeaderboard(duration: LeaderboardDuration) {
        LeaderboardCommand.showLeaderboard(new MessageContext(process.env.DEBUG_TEXT_CHANNEL_ID, KmqMember.fromUser(state.client.user), process.env.DEBUG_SERVER_ID), LeaderboardType.GLOBAL, duration);
    }

    public static async getLeaderboardEmbeds(messageContext: MessageContext, type: LeaderboardType, duration: LeaderboardDuration, date?: Date):
    Promise<{ embeds: Array<EmbedGenerator>, pageCount: number }> {
        const embedsFns: Array<EmbedGenerator> = [];
        const permanentLb = duration === LeaderboardDuration.ALL_TIME;
        const dbTable = permanentLb ? "player_stats" : "player_game_session_stats";

        let topPlayersQuery = dbContext.kmq(dbTable)
            .where(permanentLb ? "exp" : "exp_gained", ">", 0);

        const d = date || new Date();
        switch (duration) {
            // Give an extra 10 seconds to send temporary leaderboards to debug channel
            case LeaderboardDuration.DAILY:
                topPlayersQuery = topPlayersQuery
                    .where("date", ">", new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 10));
                break;
            case LeaderboardDuration.WEEKLY:
                topPlayersQuery = topPlayersQuery
                    .where("date", ">", new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay(), 0, 0, 10));
                break;
            case LeaderboardDuration.MONTHLY:
                topPlayersQuery = topPlayersQuery
                    .where("date", ">", new Date(d.getFullYear(), d.getMonth(), 0, 0, 0, 10));
                break;
            default:
                break;
        }

        if (type === LeaderboardType.SERVER) {
            const serverPlayers = (await dbContext.kmq("player_servers")
                .select("player_id")
                .where("server_id", "=", messageContext.guildID)).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery
                .whereIn("player_id", serverPlayers);
        } else if (type === LeaderboardType.GAME) {
            const participantIDs = state.gameSessions[messageContext.guildID].participants;
            const gamePlayers = (await dbContext.kmq(dbTable)
                .select("player_id")
                .whereIn("player_id", [...participantIDs])).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery
                .whereIn("player_id", gamePlayers);
        }

        const pageCount = Math.ceil((await topPlayersQuery
            .clone()
            .countDistinct("player_id as count")
            .first())["count"] as number / ENTRIES_PER_PAGE);

        topPlayersQuery = topPlayersQuery
            .select(permanentLb ? ["exp", "level", "player_id"] : ["player_id"]);

        if (!permanentLb) {
            topPlayersQuery = topPlayersQuery
                .sum("exp_gained as exp")
                .sum("levels_gained as level")
                .groupBy("player_id");
        }

        for (let i = 0; i < pageCount; i++) {
            const offset = i * ENTRIES_PER_PAGE;
            embedsFns.push(() => new Promise(async (resolve) => {
                const topPlayers = await topPlayersQuery
                    .orderBy("exp", "DESC")
                    .offset(offset)
                    .limit(ENTRIES_PER_PAGE);

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
                        value: `${!permanentLb ? "+" : ""}${friendlyFormattedNumber(player.exp)} EXP | ${permanentLb ? "Level" : ""} ${friendlyFormattedNumber(player.level)} ${rankOrLevelsGained}`,
                    };
                }));

                let leaderboardType: string;
                switch (type) {
                    case LeaderboardType.GLOBAL:
                        leaderboardType = "Global";
                        break;
                    case LeaderboardType.SERVER:
                        if (process.env.NODE_ENV !== EnvType.TEST) {
                            leaderboardType = `${state.client.guilds.get(messageContext.guildID).name}'s`;
                        } else {
                            leaderboardType = "Server's";
                        }

                        break;
                    case LeaderboardType.GAME:
                        leaderboardType = "Current Game's";
                        break;
                    default:
                        break;
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

        return { embeds: embedsFns, pageCount };
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

        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, type, duration);
        if (pageCount === 0) {
            sendErrorMessage(messageContext, { title: "Empty Leaderboard", description: "No one has earned EXP in this time interval. Now's your chance to go for first place!", thumbnailUrl: KmqImages.DEAD });
            return;
        }

        if (pageOffset > pageCount) {
            sendErrorMessage(messageContext, { title: "😐", description: "The leaderboard doesn't go this far.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
            return;
        }

        logger.info(`${getDebugLogHeader(message)} | Leaderboard retrieved (${type})`);
        if (!(message instanceof MessageContext)) {
            sendPaginationedEmbed(message, embeds, null, pageOffset + 1);
        } else {
            // Used only in sending leaderboard in debug channel before reset
            sendMessage(process.env.DEBUG_TEXT_CHANNEL_ID, { embeds: [await embeds[pageOffset]()] });
        }
    }
}
