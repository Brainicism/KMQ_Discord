import Eris from "eris";
import dbContext from "../../database_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
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
    GAMES_PLAYED = "gamesplayed",
    SONGS_GUESSED = "songsguessed",
}

export enum LeaderboardScope {
    GLOBAL = "global",
    SERVER = "server",
    GAME = "game",
}

export enum LeaderboardDuration {
    TODAY = "today",
    DAILY = "daily",
    WEEK = "week",
    WEEKLY = "weekly",
    MONTH = "month",
    MONTHLY = "monthly",
    YEAR = "year",
    YEARLY = "yearly",
    ALL_TIME = "alltime",
}

enum LeaderboardAction {
    ENROLL = "enroll",
    UNENROLL = "unenroll",
}

const leaderboardQuotes = [
    "command.leaderboard.quote.name",
    "command.leaderboard.quote.nextPage",
];

export default class LeaderboardCommand implements BaseCommand {
    aliases = ["lb"];

    validations = {
        minArgCount: 0,
        maxArgCount: 3,
        arguments: [],
    };

    help = (guildID: string): Help => ({
        name: "leaderboard",
        description: state.localizer.translate(
            guildID,
            "command.leaderboard.help.description"
        ),
        usage: `,leaderboard {${state.localizer.translate(
            guildID,
            "command.leaderboard.help.usage.pageNumber"
        )}}\n,leaderboard {gamesplayed | songsguessed} {server | game} {daily | weekly | monthly | yearly} {${state.localizer.translate(
            guildID,
            "command.leaderboard.help.usage.pageNumber"
        )}}\n,leaderboard [enroll | unenroll]`,
        examples: [
            {
                example: "`,leaderboard`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.leaderboard.help.example.global"
                ),
            },
            {
                example: "`,leaderboard 3`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.leaderboard.help.example.globalPage"
                ),
            },
            {
                example: "`,leaderboard game monthly 2`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.leaderboard.help.example.gameMonthlyPage"
                ),
            },
            {
                example: "`,leaderboard songsguessed server 3`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.leaderboard.help.example.serverSongsGuessedPage"
                ),
            },
            {
                example: "`,leaderboard enroll`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.leaderboard.help.example.enroll"
                ),
            },
            {
                example: "`,leaderboard unenroll`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.leaderboard.help.example.unenroll"
                ),
            },
            {
                example: "`,leaderboard server`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.leaderboard.help.example.server"
                ),
            },
            {
                example: "`,leaderboard weekly 4`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.leaderboard.help.example.globalWeeklyPage"
                ),
            },
        ],
        priority: 50,
    });

    call = ({ message, parsedMessage }: CommandArgs): Promise<void> => {
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
        if (
            Object.values(LeaderboardAction).includes(arg as LeaderboardAction)
        ) {
            const action = arg as LeaderboardAction;
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
                state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.validation.firstArg",
                    {
                        typeOrScopeOrDuration: arrayToString([
                            ...Object.values(LeaderboardType),
                            ...Object.values(LeaderboardScope),
                            ...Object.values(LeaderboardDuration),
                        ]),
                    }
                ),
                arg,
                this.help(message.guildID).usage
            );
            return;
        }

        if (parsedMessage.components.length === 1) {
            LeaderboardCommand.showLeaderboard(
                message,
                type,
                scope,
                duration,
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
                state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.validation.secondArg",
                    {
                        argument: arrayToString([
                            ...Object.values(LeaderboardScope),
                            ...Object.values(LeaderboardDuration),
                        ]),
                    }
                ),
                arg,
                this.help(message.guildID).usage
            );
            return;
        }

        if (parsedMessage.components.length === 2) {
            LeaderboardCommand.showLeaderboard(
                message,
                type,
                scope,
                duration,
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
                state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.validation.secondArg",
                    {
                        argument: arrayToString(
                            Object.values(LeaderboardDuration)
                        ),
                    }
                ),
                arg,
                this.help(message.guildID).usage
            );
            return;
        }

        if (pageOffset === 0 && parsedMessage.components.length > 3) {
            sendValidationErrorMessage(
                message,
                state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.validation.thirdArg"
                ),
                arg,
                this.help(message.guildID).usage
            );
            return;
        }

        LeaderboardCommand.showLeaderboard(
            message,
            type,
            scope,
            duration,
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
            case LeaderboardDuration.TODAY:
            case LeaderboardDuration.DAILY:
                topPlayersQuery = topPlayersQuery.where(
                    "date",
                    ">",
                    new Date(d.getFullYear(), d.getMonth(), d.getDate())
                );
                break;
            case LeaderboardDuration.WEEK:
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
            case LeaderboardDuration.MONTH:
            case LeaderboardDuration.MONTHLY:
                topPlayersQuery = topPlayersQuery.where(
                    "date",
                    ">",
                    new Date(d.getFullYear(), d.getMonth())
                );
                break;
            case LeaderboardDuration.YEAR:
            case LeaderboardDuration.YEARLY:
                topPlayersQuery = topPlayersQuery.where(
                    "date",
                    ">",
                    new Date(d.getFullYear(), 0)
                );
                break;
            case LeaderboardDuration.ALL_TIME:
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
                state.gameSessions[
                    messageContext.guildID
                ].scoreboard.getPlayerIDs();

            const gamePlayers = (
                await dbContext
                    .kmq(dbTable)
                    .select("player_id")
                    .whereIn("player_id", participantIDs)
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
                        .sum("songs_guessed AS songs_guessed")
                        .groupBy("player_id");
                }

                break;
            default:
                break;
        }

        for (let i = 0; i < pageCount; i++) {
            const offset = i * ENTRIES_PER_PAGE;
            embedsFns.push(
                // eslint-disable-next-line @typescript-eslint/no-loop-func
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

                                    const displayedRank =
                                        ["🥇", "🥈", "🥉"][rank] ||
                                        `${rank + 1}.`;

                                    const displayName = enrolledPlayer
                                        ? enrolledPlayer.display_name
                                        : state.localizer.translate(
                                              messageContext.guildID,
                                              "command.leaderboard.rankNumber",
                                              {
                                                  rank: friendlyFormattedNumber(
                                                      rank + 1
                                                  ),
                                              }
                                          );

                                    let level: string;
                                    if (permanentLb) {
                                        level = state.localizer.translate(
                                            messageContext.guildID,
                                            "command.leaderboard.levelEntry.permanent",
                                            {
                                                level: state.localizer.translate(
                                                    messageContext.guildID,
                                                    "misc.level"
                                                ),
                                                formattedNumber:
                                                    friendlyFormattedNumber(
                                                        player.level
                                                    ),
                                                rankName: getRankNameByLevel(
                                                    player.level,
                                                    messageContext.guildID
                                                ),
                                            }
                                        );
                                    } else {
                                        const levelPluralized =
                                            state.localizer.translateN(
                                                messageContext.guildID,
                                                "command.leaderboard.level",
                                                player.level
                                            );

                                        level = state.localizer.translate(
                                            messageContext.guildID,
                                            "command.leaderboard.levelEntry.temporary",
                                            {
                                                formattedNumber:
                                                    friendlyFormattedNumber(
                                                        player.level
                                                    ),
                                                levelPluralized,
                                            }
                                        );
                                    }

                                    let value: string;
                                    switch (type) {
                                        case LeaderboardType.EXP:
                                            if (permanentLb) {
                                                const exp = `${friendlyFormattedNumber(
                                                    player.exp
                                                )} EXP`;

                                                value = `${exp} | ${level}`;
                                            } else {
                                                const expGained = `+${friendlyFormattedNumber(
                                                    player.exp
                                                )} EXP`;

                                                value = `${expGained} | ${level}`;
                                            }

                                            break;
                                        case LeaderboardType.GAMES_PLAYED: {
                                            const games =
                                                state.localizer.translate(
                                                    messageContext.guildID,
                                                    "command.leaderboard.gamesPlayed",
                                                    {
                                                        gameCount:
                                                            friendlyFormattedNumber(
                                                                player.game_count
                                                            ),
                                                    }
                                                );

                                            value = `${games} | ${level}`;
                                            break;
                                        }

                                        case LeaderboardType.SONGS_GUESSED: {
                                            const guesses =
                                                state.localizer.translate(
                                                    messageContext.guildID,
                                                    "command.leaderboard.songsGuessed",
                                                    {
                                                        songsGuessed:
                                                            friendlyFormattedNumber(
                                                                player.songs_guessed
                                                            ),
                                                    }
                                                );

                                            value = `${guesses} | ${level}`;
                                            break;
                                        }

                                        default:
                                            break;
                                    }

                                    return {
                                        name: `${displayedRank} ${displayName}`,
                                        value,
                                    };
                                })
                            );

                        let leaderboardScope: string;
                        switch (scope) {
                            case LeaderboardScope.GLOBAL:
                                leaderboardScope = state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.scope.global"
                                );
                                break;
                            case LeaderboardScope.SERVER:
                                if (process.env.NODE_ENV !== EnvType.TEST) {
                                    leaderboardScope =
                                        state.localizer.translate(
                                            messageContext.guildID,
                                            "command.leaderboard.scope.server.withName",
                                            {
                                                serverName:
                                                    state.client.guilds.get(
                                                        messageContext.guildID
                                                    ).name,
                                            }
                                        );
                                } else {
                                    leaderboardScope =
                                        state.localizer.translate(
                                            messageContext.guildID,
                                            "command.leaderboard.scope.server.noName"
                                        );
                                }

                                break;
                            case LeaderboardScope.GAME:
                                leaderboardScope = state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.scope.currentGame"
                                );
                                break;
                            default:
                                break;
                        }

                        let leaderboardDuration: string;
                        switch (duration) {
                            case LeaderboardDuration.TODAY:
                            case LeaderboardDuration.DAILY:
                                leaderboardDuration = state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.daily"
                                );
                                break;
                            case LeaderboardDuration.WEEK:
                            case LeaderboardDuration.WEEKLY:
                                leaderboardDuration = state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.weekly"
                                );
                                break;
                            case LeaderboardDuration.MONTH:
                            case LeaderboardDuration.MONTHLY:
                                leaderboardDuration = state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.monthly"
                                );
                                break;
                            case LeaderboardDuration.YEAR:
                            case LeaderboardDuration.YEARLY:
                                leaderboardDuration = state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.yearly"
                                );
                                break;
                            case LeaderboardDuration.ALL_TIME:
                                leaderboardDuration = state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.allTime"
                                );
                                break;
                            default:
                                break;
                        }

                        let leaderboardType: string;
                        switch (type) {
                            case LeaderboardType.EXP:
                                leaderboardType = "";
                                break;
                            case LeaderboardType.GAMES_PLAYED:
                                leaderboardType = `(${state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.type.byGamesPlayed"
                                )})`;
                                break;
                            case LeaderboardType.SONGS_GUESSED:
                                leaderboardType = `(${state.localizer.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.type.bySongsGuessed"
                                )})`;
                                break;
                            default:
                                break;
                        }

                        resolve({
                            title: bold(
                                state.localizer
                                    .translate(
                                        messageContext.guildID,
                                        "command.leaderboard.title",
                                        {
                                            leaderboardScope,
                                            leaderboardDuration,
                                            leaderboardType,
                                        }
                                    )
                                    .trimEnd()
                            ),
                            fields,
                            timestamp: new Date(),
                            thumbnail: { url: KmqImages.THUMBS_UP },
                            footer: {
                                text: state.localizer.translate(
                                    messageContext.guildID,
                                    chooseRandom(leaderboardQuotes),
                                    {
                                        command: `${process.env.BOT_PREFIX}help leaderboard`,
                                    }
                                ),
                            },
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
                title: state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.failure.alreadyEnrolled.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.failure.alreadyEnrolled.description"
                ),
            });
            return;
        }

        await dbContext.kmq("leaderboard_enrollment").insert({
            player_id: message.author.id,
            display_name: getUserTag(message.author),
        });

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "command.leaderboard.enrolled.title"
            ),
            description: state.localizer.translate(
                message.guildID,
                "command.leaderboard.enrolled.description"
            ),
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
            title: state.localizer.translate(
                message.guildID,
                "command.leaderboard.unenrolled.title"
            ),
            description: state.localizer.translate(
                message.guildID,
                "command.leaderboard.unenrolled.description"
            ),
        });
    }

    private static async showLeaderboard(
        message: GuildTextableMessage | MessageContext,
        type: LeaderboardType = LeaderboardType.EXP,
        scope: LeaderboardScope = LeaderboardScope.GLOBAL,
        duration: LeaderboardDuration = LeaderboardDuration.ALL_TIME,
        pageOffset: number = 0
    ): Promise<void> {
        const messageContext: MessageContext =
            message instanceof MessageContext
                ? message
                : MessageContext.fromMessage(message);

        if (scope === LeaderboardScope.GAME) {
            if (!state.gameSessions[message.guildID]) {
                sendErrorMessage(messageContext, {
                    title: state.localizer.translate(
                        message.guildID,
                        "misc.failure.game.noneInProgress.title"
                    ),
                    description: state.localizer.translate(
                        message.guildID,
                        "command.leaderboard.failure.game.noneInProgress.description"
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                });
                return;
            }

            const participantIDs =
                state.gameSessions[
                    messageContext.guildID
                ].scoreboard.getPlayerIDs();

            if (participantIDs.length === 0) {
                sendErrorMessage(messageContext, {
                    title: state.localizer.translate(
                        message.guildID,
                        "command.leaderboard.failure.game.noParticipants.title"
                    ),
                    description: state.localizer.translate(
                        message.guildID,
                        "command.leaderboard.failure.game.noParticipants.description"
                    ),
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
                title: state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.failure.empty.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.failure.empty.description"
                ),
                thumbnailUrl: KmqImages.DEAD,
            });
            return;
        }

        if (pageOffset > pageCount) {
            sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.failure.outOfRange.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.leaderboard.failure.outOfRange.description"
                ),
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
