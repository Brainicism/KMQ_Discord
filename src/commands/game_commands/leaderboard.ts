import Eris from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getUserTag,
    sendErrorMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
    EmbedGenerator,
    sendMessage,
} from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import {
    chooseRandom,
    friendlyFormattedNumber,
    bold,
    arrayToString,
} from "../../helpers/utils";
import { state } from "../../kmq_worker";
import { GuildTextableMessage, EnvType } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import { sendValidationErrorMessage } from "../../helpers/validate";

const logger = new IPCLogger("leaderboard");
export const ENTRIES_PER_PAGE = 10;

export enum LeaderboardType {
    EXP = "exp",
    GAMES_PLAYED = "games_played",
    SONGS_GUESSED = "songs_guessed",
}

export enum LeaderboardScope {
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
        usage: ",leaderboard {page_number}\n,leaderboard {games_played | songs_guessed} {server | game} {daily | weekly | monthly} {page_number}\n,leaderboard [enroll | unenroll]",
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
                example: "`,leaderboard game monthly 2`",
                explanation:
                    "Shows the 2nd page of the monthly scoreboard containing players with points in the current game",
            },
            {
                example: "`,leaderboard server`",
                explanation: "Shows the server-wide leaderboard",
            },
            {
                example: "`,leaderboard enroll`",
                explanation:
                    "Allows your name to be displayed on the leaderboard",
            },
            {
                example: "`,leaderboard unenroll`",
                explanation: "Hides your name from the leaderboard",
            },
            {
                example: "`,leaderboard songs_guessed server 3`",
                explanation:
                    "Shows the 3rd page of the server-wide leaderboard by total songs guessed",
            },
            {
                example: "`,leaderboard weekly 4`",
                explanation:
                    "Shows the 4th page of the leaderboard, by EXP gained this week",
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

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        if (parsedMessage.components.length === 0) {
            LeaderboardCommand.showLeaderboard(
                message,
                LeaderboardType.EXP,
                LeaderboardScope.GLOBAL,
                LeaderboardDuration.ALL_TIME
            );
            return;
        }

        let arg = parsedMessage.components[0];
        let action: LeaderboardAction;
        if (
            Object.values(LeaderboardAction).includes(arg as LeaderboardAction)
        ) {
            action = arg as LeaderboardAction;
            if (action === LeaderboardAction.ENROLL) {
                LeaderboardCommand.enrollLeaderboard(message);
            } else if (action === LeaderboardAction.UNENROLL) {
                LeaderboardCommand.unenrollLeaderboard(message);
            }

            return;
        }

        let type: LeaderboardType;
        let scope: LeaderboardScope;
        let duration: LeaderboardDuration;
        const lastArg =
            parsedMessage.components[parsedMessage.components.length - 1];

        const pageOffset =
            Number.isInteger(Number(lastArg)) && Number(lastArg) > 0
                ? Number(lastArg)
                : 0;

        if (Object.values(LeaderboardType).includes(arg as LeaderboardType)) {
            type = arg as LeaderboardType;
        }

        if (Object.values(LeaderboardScope).includes(arg as LeaderboardScope)) {
            scope = arg as LeaderboardScope;
        }

        if (
            Object.values(LeaderboardDuration).includes(
                arg as LeaderboardDuration
            )
        ) {
            duration = arg as LeaderboardDuration;
        }

        if (pageOffset === 0 && !type && !scope && !duration) {
            sendValidationErrorMessage(
                message,
                `Expected one of the following valid values for the first argument: (a positive number, ${arrayToString(
                    [
                        ...Object.values(LeaderboardType),
                        ...Object.values(LeaderboardScope),
                        ...Object.values(LeaderboardDuration),
                    ]
                )})`,
                arg,
                this.help.usage
            );
            return;
        }

        if (parsedMessage.components.length === 1) {
            LeaderboardCommand.showLeaderboard(
                message,
                type ?? LeaderboardType.EXP,
                scope ?? LeaderboardScope.GLOBAL,
                duration ?? LeaderboardDuration.ALL_TIME,
                pageOffset
            );
            return;
        }

        arg = parsedMessage.components[1];
        if (Object.values(LeaderboardScope).includes(arg as LeaderboardScope)) {
            scope = arg as LeaderboardScope;
        } else if (
            Object.values(LeaderboardDuration).includes(
                arg as LeaderboardDuration
            )
        ) {
            duration = arg as LeaderboardDuration;
        } else if (pageOffset === 0) {
            sendValidationErrorMessage(
                message,
                `Expected one of the following valid values for the second argument: (a positive number, ${arrayToString(
                    [
                        ...Object.values(LeaderboardScope),
                        ...Object.values(LeaderboardDuration),
                    ]
                )})`,
                arg,
                this.help.usage
            );
            return;
        }

        if (parsedMessage.components.length === 2) {
            LeaderboardCommand.showLeaderboard(
                message,
                type ?? LeaderboardType.EXP,
                scope ?? LeaderboardScope.GLOBAL,
                duration ?? LeaderboardDuration.ALL_TIME,
                pageOffset
            );
            return;
        }

        arg = parsedMessage.components[2];
        if (
            Object.values(LeaderboardDuration).includes(
                arg as LeaderboardDuration
            )
        ) {
            duration = arg as LeaderboardDuration;
        } else if (pageOffset === 0) {
            sendValidationErrorMessage(
                message,
                `Expected one of the following valid values for the second argument: (a positive number, ${arrayToString(
                    Object.values(LeaderboardDuration)
                )})`,
                arg,
                this.help.usage
            );
            return;
        }

        if (pageOffset === 0 && parsedMessage.components.length > 3) {
            sendValidationErrorMessage(
                message,
                "Expected one of the following valid values for the third argument: (a positive number)",
                arg,
                this.help.usage
            );
            return;
        }

        LeaderboardCommand.showLeaderboard(
            message,
            type ?? LeaderboardType.EXP,
            scope ?? LeaderboardScope.GLOBAL,
            duration ?? LeaderboardDuration.ALL_TIME,
            pageOffset
        );
    };

    public static async getLeaderboardEmbeds(
        messageContext: MessageContext,
        type: LeaderboardType,
        scope: LeaderboardScope,
        duration: LeaderboardDuration,
        date?: Date
    ): Promise<{ embeds: Array<EmbedGenerator>; pageCount: number }> {
        const embedsFns: Array<EmbedGenerator> = [];
        const permanentLb = duration === LeaderboardDuration.ALL_TIME;
        const dbTable = permanentLb
            ? "player_stats"
            : "player_game_session_stats";

        let topPlayersQuery = dbContext
            .kmq(dbTable)
            .where(permanentLb ? "exp" : "exp_gained", ">", 0);

        const d = date || new Date();
        switch (duration) {
            case LeaderboardDuration.DAILY:
                topPlayersQuery = topPlayersQuery.where(
                    "date",
                    ">",
                    new Date(d.getFullYear(), d.getMonth(), d.getDate())
                );
                break;
            case LeaderboardDuration.WEEKLY:
                topPlayersQuery = topPlayersQuery.where(
                    "date",
                    ">",
                    new Date(
                        d.getFullYear(),
                        d.getMonth(),
                        d.getDate() - d.getDay()
                    )
                );
                break;
            case LeaderboardDuration.MONTHLY:
                topPlayersQuery = topPlayersQuery.where(
                    "date",
                    ">",
                    new Date(d.getFullYear(), d.getMonth())
                );
                break;
            default:
                break;
        }

        if (scope === LeaderboardScope.SERVER) {
            const serverPlayers = (
                await dbContext
                    .kmq("player_servers")
                    .select("player_id")
                    .where("server_id", "=", messageContext.guildID)
            ).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.whereIn(
                "player_id",
                serverPlayers
            );
        } else if (scope === LeaderboardScope.GAME) {
            const participantIDs =
                state.gameSessions[messageContext.guildID].participants;

            const gamePlayers = (
                await dbContext
                    .kmq(dbTable)
                    .select("player_id")
                    .whereIn("player_id", [...participantIDs])
            ).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.whereIn("player_id", gamePlayers);
        }

        const pageCount = Math.ceil(
            ((
                await topPlayersQuery
                    .clone()
                    .countDistinct("player_id AS count")
                    .first()
            )["count"] as number) / ENTRIES_PER_PAGE
        );

        switch (type) {
            case LeaderboardType.EXP:
                if (permanentLb) {
                    topPlayersQuery = topPlayersQuery.select([
                        "exp",
                        "level",
                        "player_id",
                    ]);
                } else {
                    topPlayersQuery = topPlayersQuery.select(["player_id"]);
                    topPlayersQuery = topPlayersQuery
                        .sum("exp_gained AS exp")
                        .sum("levels_gained AS level")
                        .groupBy("player_id");
                }

                break;
            case LeaderboardType.GAMES_PLAYED:
                if (permanentLb) {
                    topPlayersQuery = topPlayersQuery.select([
                        "player_id",
                        "games_played AS game_count",
                        "level",
                    ]);
                } else {
                    topPlayersQuery = topPlayersQuery.count(
                        "player_id AS game_count"
                    );

                    topPlayersQuery = topPlayersQuery.select(["player_id"]);
                    topPlayersQuery = topPlayersQuery.sum(
                        "levels_gained AS level"
                    );

                    topPlayersQuery = topPlayersQuery.groupBy("player_id");
                }

                break;
            case LeaderboardType.SONGS_GUESSED:
                if (permanentLb) {
                    topPlayersQuery = topPlayersQuery.select([
                        "songs_guessed",
                        "player_id",
                        "level",
                    ]);
                } else {
                    topPlayersQuery = topPlayersQuery.select(["player_id"]);
                    topPlayersQuery = topPlayersQuery.sum(
                        "levels_gained AS level"
                    );

                    topPlayersQuery = topPlayersQuery
                        .sum("songs_guessed")
                        .groupBy("player_id");
                }

                break;
            default:
                break;
        }

        for (let i = 0; i < pageCount; i++) {
            const offset = i * ENTRIES_PER_PAGE;
            embedsFns.push(
                () =>
                    new Promise(async (resolve) => {
                        let topPlayers;
                        switch (type) {
                            case LeaderboardType.EXP:
                                topPlayers = await topPlayersQuery
                                    .orderBy("exp", "DESC")
                                    .offset(offset)
                                    .limit(ENTRIES_PER_PAGE);
                                break;
                            case LeaderboardType.GAMES_PLAYED:
                                topPlayers = await topPlayersQuery
                                    .orderBy("game_count", "DESC")
                                    .offset(offset)
                                    .limit(ENTRIES_PER_PAGE);
                                break;
                            case LeaderboardType.SONGS_GUESSED:
                                topPlayers = await topPlayersQuery
                                    .orderBy("songs_guessed", "DESC")
                                    .offset(offset)
                                    .limit(ENTRIES_PER_PAGE);
                                break;
                            default:
                                break;
                        }

                        const fields: Array<Eris.EmbedField> =
                            await Promise.all(
                                topPlayers.map(async (player, relativeRank) => {
                                    const rank = relativeRank + offset;
                                    const enrolledPlayer = await dbContext
                                        .kmq("leaderboard_enrollment")
                                        .where(
                                            "player_id",
                                            "=",
                                            player.player_id
                                        )
                                        .first();

                                    const medalIcon =
                                        ["🥇", "🥈", "🥉"][rank] || "";

                                    const displayName = enrolledPlayer
                                        ? enrolledPlayer.display_name
                                        : `Rank #${rank + 1}`;

                                    let value: string;
                                    switch (type) {
                                        case LeaderboardType.EXP:
                                            if (permanentLb) {
                                                const exp = `${friendlyFormattedNumber(
                                                    player.exp
                                                )} EXP`;

                                                const level = `Level ${friendlyFormattedNumber(
                                                    player.level
                                                )} (${getRankNameByLevel(
                                                    player.level
                                                )})`;

                                                value = `${exp} | ${level}`;
                                            } else {
                                                const expGained = `+${friendlyFormattedNumber(
                                                    player.exp
                                                )} EXP`;

                                                const level = `${friendlyFormattedNumber(
                                                    player.level
                                                )} levels gained`;

                                                value = `${expGained} | ${level}`;
                                            }

                                            break;
                                        case LeaderboardType.GAMES_PLAYED: {
                                            const games = `${friendlyFormattedNumber(
                                                player.game_count
                                            )} games played`;

                                            let level: string;
                                            if (permanentLb) {
                                                level = `Level ${friendlyFormattedNumber(
                                                    player.level
                                                )} (${getRankNameByLevel(
                                                    player.level
                                                )})`;
                                            } else {
                                                level = `${friendlyFormattedNumber(
                                                    player.level
                                                )} levels gained`;
                                            }

                                            value = `${games} | ${level}`;
                                            break;
                                        }

                                        case LeaderboardType.SONGS_GUESSED: {
                                            const guesses = `${friendlyFormattedNumber(
                                                player.songs_guessed
                                            )} songs guessed`;

                                            let level: string;
                                            if (permanentLb) {
                                                level = `Level ${friendlyFormattedNumber(
                                                    player.level
                                                )} (${getRankNameByLevel(
                                                    player.level
                                                )})`;
                                            } else {
                                                level = `${friendlyFormattedNumber(
                                                    player.level
                                                )} levels gained`;
                                            }

                                            value = `${guesses} | ${level}`;
                                            break;
                                        }

                                        default:
                                            break;
                                    }

                                    return {
                                        name: `${medalIcon} ${displayName}`,
                                        value,
                                    };
                                })
                            );

                        let leaderboardScope: string;
                        switch (scope) {
                            case LeaderboardScope.GLOBAL:
                                leaderboardScope = "Global";
                                break;
                            case LeaderboardScope.SERVER:
                                if (process.env.NODE_ENV !== EnvType.TEST) {
                                    leaderboardScope = `${
                                        state.client.guilds.get(
                                            messageContext.guildID
                                        ).name
                                    }'s`;
                                } else {
                                    leaderboardScope = "Server's";
                                }

                                break;
                            case LeaderboardScope.GAME:
                                leaderboardScope = "Current Game's";
                                break;
                            default:
                                break;
                        }

                        const durationString = !permanentLb
                            ? ` ${duration[0].toUpperCase()}${duration.slice(
                                  1
                              )} `
                            : " ";

                        let leaderboardType: string;
                        switch (type) {
                            case LeaderboardType.EXP:
                                leaderboardType = "";
                                break;
                            case LeaderboardType.GAMES_PLAYED:
                                leaderboardType = " (by games played)";
                                break;
                            case LeaderboardType.SONGS_GUESSED:
                                leaderboardType = " (by songs guessed)";
                                break;
                            default:
                                break;
                        }

                        resolve({
                            title: bold(
                                `${leaderboardScope}${durationString}Leaderboard${leaderboardType}`
                            ),
                            fields,
                            timestamp: new Date(),
                            thumbnail: { url: KmqImages.THUMBS_UP },
                            footer: { text: chooseRandom(leaderboardQuotes) },
                        });
                    })
            );
        }

        return { embeds: embedsFns, pageCount };
    }

    private static async enrollLeaderboard(
        message: GuildTextableMessage
    ): Promise<void> {
        const alreadyEnrolled = !!(await dbContext
            .kmq("leaderboard_enrollment")
            .where("player_id", "=", message.author.id)
            .first());

        if (alreadyEnrolled) {
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: "Player Already Enrolled",
                description:
                    "You are already visible on the leaderboard. If you'd like to update your display name, unenroll and enroll again.",
            });
            return;
        }

        await dbContext.kmq("leaderboard_enrollment").insert({
            player_id: message.author.id,
            display_name: getUserTag(message.author),
        });

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Leaderboard Enrollment Complete",
            description: "Your name is now visible on the leaderboard",
        });
    }

    private static async unenrollLeaderboard(
        message: GuildTextableMessage
    ): Promise<void> {
        await dbContext
            .kmq("leaderboard_enrollment")
            .where("player_id", "=", message.author.id)
            .del();

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Leaderboard Unenrollment Complete",
            description: "You are no longer visible on the leaderboard",
        });
    }

    private static async showLeaderboard(
        message: GuildTextableMessage | MessageContext,
        type: LeaderboardType,
        scope: LeaderboardScope,
        duration: LeaderboardDuration,
        pageOffset: number = 0
    ): Promise<void> {
        const messageContext: MessageContext =
            message instanceof MessageContext
                ? message
                : MessageContext.fromMessage(message);

        if (scope === LeaderboardScope.GAME) {
            if (!state.gameSessions[message.guildID]) {
                sendErrorMessage(messageContext, {
                    title: "No Active Game",
                    description: "There is no game in progress.",
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                });
                return;
            }

            const participantIDs =
                state.gameSessions[message.guildID].participants;

            if (participantIDs.size === 0) {
                sendErrorMessage(messageContext, {
                    title: "No Participants",
                    description:
                        "Someone needs to score a point before this command works!",
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                });
                return;
            }
        }

        const { embeds, pageCount } =
            await LeaderboardCommand.getLeaderboardEmbeds(
                messageContext,
                type,
                scope,
                duration
            );

        if (pageCount === 0) {
            sendErrorMessage(messageContext, {
                title: "Empty Leaderboard",
                description:
                    "No one has earned EXP in this time interval. Now's your chance to go for first place!",
                thumbnailUrl: KmqImages.DEAD,
            });
            return;
        }

        if (pageOffset > pageCount) {
            sendErrorMessage(messageContext, {
                title: "😐",
                description: "The leaderboard doesn't go this far.",
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            });
            return;
        }

        logger.info(
            `${getDebugLogHeader(message)} | Leaderboard retrieved (${scope})`
        );
        if (!(message instanceof MessageContext)) {
            await sendPaginationedEmbed(message, embeds, null, pageOffset);
            logger.info(
                `${getDebugLogHeader(message)} | Leaderboard retrieved.`
            );
        } else {
            // Used only in sending leaderboard in debug channel before reset
            await sendMessage(process.env.DEBUG_TEXT_CHANNEL_ID, {
                embeds: [await embeds[pageOffset]()],
            });

            logger.info(
                `${getDebugLogHeader(message)} | Debug leaderboard retrieved..`
            );
        }
    }
}
