import Eris from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getDebugLogHeader, getUserTag, sendErrorMessage, sendInfoMessage, sendPaginationedEmbed, EmbedGenerator } from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { chooseRandom, friendlyFormattedNumber, bold, arrayToString } from "../../helpers/utils";
import { state } from "../../kmq";
import { GuildTextableMessage } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import { sendValidationErrorMessage } from "../../helpers/validate";

const logger = new IPCLogger("leaderboard");

export enum LeaderboardType {
    GLOBAL = "global",
    SERVER = "server",
    GAME = "game",
}

export enum LeaderboardDuration {
    INDEFINITE = "indefinite",
    DAILY = "daily",
    WEEKLY = "weekly",
    MONTHLY = "monthly",
}

enum LeaderboardAction {
    ENROLL = "enroll",
    UNENROLL = "unenroll",
}

export const TABLE_BY_DURATION = {
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
                example: "`,leaderboard 3`",
                explanation: "Shows the 3rd page of the global leaderboard",
            },
            {
                example: "`,leaderboard server`",
                explanation: "Shows the server-wide leaderboard",
            },
            {
                example: "`,leaderboard 3 server`",
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
            this.showLeaderboard(message, 0, LeaderboardType.GLOBAL, LeaderboardDuration.INDEFINITE);
            return;
        }

        let type = LeaderboardType.GLOBAL;
        let duration = LeaderboardDuration.INDEFINITE;
        let pageOffset = 0;

        for (const arg of parsedMessage.components) {
            if (Object.values(LeaderboardAction).includes(arg as LeaderboardAction)) {
                const action = arg as LeaderboardAction;
                if (action === LeaderboardAction.ENROLL) {
                    this.enrollLeaderboard(message);
                } else if (action === LeaderboardAction.UNENROLL) {
                    this.unenrollLeaderboard(message);
                }

                return;
            }

            if (Object.values(LeaderboardType).includes(arg as LeaderboardType)) {
                type = arg as LeaderboardType;
            } else if (Object.values(LeaderboardDuration).includes(arg as LeaderboardDuration)) {
                duration = arg as LeaderboardDuration;
            } else if (Number.isInteger(Number(arg)) && Number(arg) > 0) {
                pageOffset = Number(arg) - 1;
            } else {
                const allEnums = arrayToString([...Object.values(LeaderboardType), ...Object.values(LeaderboardDuration), ...Object.values(LeaderboardAction)]);
                sendValidationErrorMessage(message, `Expected one of the following valid values: (a positive number, ${allEnums})`, arg, this.help.usage);
                return;
            }
        }

        this.showLeaderboard(message, pageOffset, type, duration);
    };

    public async showLeaderboard(message: GuildTextableMessage | MessageContext, pageOffset: number, type: LeaderboardType, duration: LeaderboardDuration) {
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

        const embeds: Array<EmbedGenerator> = await this.getLeaderboardEmbeds(messageContext, type, duration);
        if (pageOffset + 1 > await this.getPageCount(messageContext, type, TABLE_BY_DURATION[duration])) {
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

    private async getLeaderboardEmbeds(messageContext: MessageContext, type: LeaderboardType, duration: LeaderboardDuration): Promise<Array<EmbedGenerator>> {
        const embedsFns: Array<EmbedGenerator> = [];
        const dbTable = TABLE_BY_DURATION[duration];

        let topPlayersQuery = dbContext.kmq(dbTable)
            .select(["exp", "level", "player_id"])
            .where("exp", ">", 0);

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

        const pages = await this.getPageCount(messageContext, type, dbTable);
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
                    const rankOrLevelsGained = duration === LeaderboardDuration.INDEFINITE ? `${getRankNameByLevel(player.level)}` : "levels gained";
                    return {
                        name: `${medalIcon} ${displayName}`,
                        value: `${duration !== LeaderboardDuration.INDEFINITE ? "+" : ""}${friendlyFormattedNumber(player.exp)} EXP | ${duration === LeaderboardDuration.INDEFINITE ? "Level" : ""} ${friendlyFormattedNumber(player.level)} ${rankOrLevelsGained}`,
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

                const durationString = duration !== LeaderboardDuration.INDEFINITE ? ` ${duration[0].toUpperCase()}${duration.slice(1)} ` : " ";

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

    private async getPageCount(messageContext: MessageContext, type: LeaderboardType, dbTable: string): Promise<number> {
        let playerCount: number;
        switch (type) {
            case LeaderboardType.SERVER:
            {
                const serverPlayers = (await dbContext.kmq("player_servers")
                    .select("player_id")
                    .where("server_id", "=", messageContext.guildID)).map((x) => x.player_id);

                playerCount = serverPlayers.length;
                break;
            }

            case LeaderboardType.GAME:
            {
                const participantIDs = state.gameSessions[messageContext.guildID].participants;
                const gamePlayers = (await dbContext.kmq(dbTable)
                    .select("player_id")
                    .whereIn("player_id", [...participantIDs])).map((x) => x.player_id);

                playerCount = gamePlayers.length;
                break;
            }

            default:
                playerCount = ((await dbContext.kmq(dbTable).count("player_id as count")
                    .where("exp", ">", 0)
                    .first())["count"] as number);
                break;
        }

        return Math.ceil(playerCount / 10);
    }
}
