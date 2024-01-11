import { IPCLogger } from "../../logger";
import { KmqImages, LEADERBOARD_ENTRIES_PER_PAGE } from "../../constants";
import {
    arrayToString,
    chooseRandom,
    clickableSlashCommand,
    friendlyFormattedNumber,
} from "../../helpers/utils";
import {
    getAllClickableSlashCommands,
    getDebugLogHeader,
    getInteractionValue,
    getUserTag,
    sendErrorMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
} from "../../helpers/discord_utils";
import { getRankNameByLevel } from "./profile";
import { sendValidationErrorMessage } from "../../helpers/validate";
import EnvType from "../../enums/env_type";
import Eris from "eris";
import KmqMember from "../../structures/kmq_member";
import LeaderboardDuration from "../../enums/option_types/leaderboard_duration";
import LeaderboardScope from "../../enums/option_types/leaderboard_scope";
import LeaderboardType from "../../enums/option_types/leaderboard_type";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import dbContext from "../../database_context";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { EmbedGenerator, GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "leaderboard";
const logger = new IPCLogger(COMMAND_NAME);

enum LeaderboardAction {
    SHOW = "show",
    ENROLL = "enroll",
    UNENROLL = "unenroll",
}

const leaderboardQuotes = [
    "command.leaderboard.quote.name",
    "command.leaderboard.quote.nextPage",
];

interface TopPlayerBase {
    player_id: string;
    level: number;
}

type TopExpGainPlayer = TopPlayerBase & { exp: number };
type TopGamesPlayedPlayer = TopPlayerBase & { game_count: number };
type TopSongsGuessedPlayer = TopPlayerBase & {
    songs_guessed: number;
};

export default class LeaderboardCommand implements BaseCommand {
    aliases = ["lb"];

    validations = {
        minArgCount: 0,
        maxArgCount: 3,
        arguments: [],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.leaderboard.help.description",
        ),
        examples: [
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    LeaderboardAction.SHOW,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.leaderboard.help.example.global",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    LeaderboardAction.SHOW,
                )} page:3`,
                explanation: i18n.translate(
                    guildID,
                    "command.leaderboard.help.example.globalPage",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    LeaderboardAction.SHOW,
                )} scope:game duration:monthly page:2`,
                explanation: i18n.translate(
                    guildID,
                    "command.leaderboard.help.example.gameMonthlyPage",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    LeaderboardAction.SHOW,
                )} type:songsguessed scope:server page:3`,
                explanation: i18n.translate(
                    guildID,
                    "command.leaderboard.help.example.serverSongsGuessedPage",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    LeaderboardAction.ENROLL,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.leaderboard.help.example.enroll",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    LeaderboardAction.UNENROLL,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.leaderboard.help.example.unenroll",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    LeaderboardAction.SHOW,
                )} scope:server`,
                explanation: i18n.translate(
                    guildID,
                    "command.leaderboard.help.example.server",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    LeaderboardAction.SHOW,
                )} duration:weekly page:4`,
                explanation: i18n.translate(
                    guildID,
                    "command.leaderboard.help.example.globalWeeklyPage",
                ),
            },
        ],
        priority: 50,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: LeaderboardAction.ENROLL,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.leaderboard.help.example.enroll",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.leaderboard.help.example.enroll",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                },
                {
                    name: LeaderboardAction.UNENROLL,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.leaderboard.help.example.unenroll",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.leaderboard.help.example.unenroll",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                },
                {
                    name: LeaderboardAction.SHOW,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.leaderboard.help.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.leaderboard.help.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "type",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.leaderboard.interaction.type",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.leaderboard.interaction.type",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            choices: Object.values(LeaderboardType).map(
                                (type) => ({
                                    name: type,
                                    value: type,
                                    default: type === LeaderboardType.EXP,
                                }),
                            ),
                        },
                        {
                            name: "duration",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.leaderboard.interaction.duration",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.leaderboard.interaction.duration",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            choices: [
                                LeaderboardDuration.ALL_TIME,
                                LeaderboardDuration.YEARLY,
                                LeaderboardDuration.MONTHLY,
                                LeaderboardDuration.WEEKLY,
                                LeaderboardDuration.DAILY,
                            ].map((duration) => ({
                                name: duration,
                                value: duration,
                                default:
                                    duration === LeaderboardDuration.ALL_TIME,
                            })),
                        },
                        {
                            name: "scope",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.leaderboard.interaction.scope",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.leaderboard.interaction.scope",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            choices: Object.values(LeaderboardScope).map(
                                (scope) => ({
                                    name: scope,
                                    value: scope,
                                    default: scope === LeaderboardScope.GLOBAL,
                                }),
                            ),
                        },
                        {
                            name: "page",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.leaderboard.interaction.page",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.leaderboard.interaction.page",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                        },
                    ],
                },
            ],
        },
    ];

    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionOptions, interactionName } =
            getInteractionValue(interaction);

        if (interactionName === LeaderboardAction.ENROLL) {
            LeaderboardCommand.enrollLeaderboard(messageContext, interaction);
        } else if (interactionName === LeaderboardAction.UNENROLL) {
            LeaderboardCommand.unenrollLeaderboard(messageContext, interaction);
        } else {
            await LeaderboardCommand.showLeaderboard(
                interaction,
                interactionOptions["type"],
                interactionOptions["scope"],
                interactionOptions["duration"],
                interactionOptions["page"],
            );
        }
    }

    call = ({ message, parsedMessage }: CommandArgs): void => {
        if (parsedMessage.components.length === 0) {
            LeaderboardCommand.showLeaderboard(
                message,
                LeaderboardType.EXP,
                LeaderboardScope.GLOBAL,
                LeaderboardDuration.ALL_TIME,
            );
            return;
        }

        let arg = parsedMessage.components[0];
        const messageContext = MessageContext.fromMessage(message);
        if (
            Object.values(LeaderboardAction).includes(arg as LeaderboardAction)
        ) {
            const action = arg as LeaderboardAction;
            if (action === LeaderboardAction.ENROLL) {
                LeaderboardCommand.enrollLeaderboard(messageContext);
                return;
            } else if (action === LeaderboardAction.UNENROLL) {
                LeaderboardCommand.unenrollLeaderboard(messageContext);
                return;
            }
        }

        let type: LeaderboardType | undefined;
        let scope: LeaderboardScope | undefined;
        let duration: LeaderboardDuration | undefined;
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
                arg as LeaderboardDuration,
            )
        ) {
            duration = arg as LeaderboardDuration;
        }

        if (pageOffset === 0 && !type && !scope && !duration) {
            sendValidationErrorMessage(
                messageContext,
                i18n.translate(
                    message.guildID,
                    "command.leaderboard.validation.firstArg",
                    {
                        typeOrScopeOrDuration: arrayToString([
                            ...Object.values(LeaderboardType),
                            ...Object.values(LeaderboardScope),
                            ...Object.values(LeaderboardDuration),
                        ]),
                    },
                ),
                arg,
                getAllClickableSlashCommands(COMMAND_NAME),
            );
            return;
        }

        if (parsedMessage.components.length === 1) {
            LeaderboardCommand.showLeaderboard(
                message,
                type,
                scope,
                duration,
                pageOffset,
            );
            return;
        }

        arg = parsedMessage.components[1];
        if (Object.values(LeaderboardScope).includes(arg as LeaderboardScope)) {
            scope = arg as LeaderboardScope;
        } else if (
            Object.values(LeaderboardDuration).includes(
                arg as LeaderboardDuration,
            )
        ) {
            duration = arg as LeaderboardDuration;
        } else if (pageOffset === 0) {
            sendValidationErrorMessage(
                messageContext,
                i18n.translate(
                    message.guildID,
                    "command.leaderboard.validation.secondArg",
                    {
                        argument: arrayToString([
                            ...Object.values(LeaderboardScope),
                            ...Object.values(LeaderboardDuration),
                        ]),
                    },
                ),
                arg,
                getAllClickableSlashCommands(COMMAND_NAME),
            );
            return;
        }

        if (parsedMessage.components.length === 2) {
            LeaderboardCommand.showLeaderboard(
                message,
                type,
                scope,
                duration,
                pageOffset,
            );
            return;
        }

        arg = parsedMessage.components[2];
        if (
            Object.values(LeaderboardDuration).includes(
                arg as LeaderboardDuration,
            )
        ) {
            duration = arg as LeaderboardDuration;
        } else if (pageOffset === 0) {
            sendValidationErrorMessage(
                messageContext,
                i18n.translate(
                    message.guildID,
                    "command.leaderboard.validation.secondArg",
                    {
                        argument: arrayToString(
                            Object.values(LeaderboardDuration),
                        ),
                    },
                ),
                arg,
                getAllClickableSlashCommands(COMMAND_NAME),
            );
            return;
        }

        if (pageOffset === 0 && parsedMessage.components.length > 3) {
            sendValidationErrorMessage(
                messageContext,
                i18n.translate(
                    message.guildID,
                    "command.leaderboard.validation.thirdArg",
                ),
                arg,
                getAllClickableSlashCommands(COMMAND_NAME),
            );
            return;
        }

        LeaderboardCommand.showLeaderboard(
            message,
            type,
            scope,
            duration,
            pageOffset,
        );
    };

    public static async getLeaderboardEmbeds(
        messageContext: MessageContext,
        type: LeaderboardType,
        scope: LeaderboardScope,
        duration: LeaderboardDuration,
        invokerId: string,
        date?: Date,
    ): Promise<{ embeds: Array<EmbedGenerator>; pageCount: number }> {
        const embedsFns: Array<EmbedGenerator> = [];
        const permanentLb = duration === LeaderboardDuration.ALL_TIME;
        const dbTable = permanentLb
            ? "player_stats"
            : "player_game_session_stats";

        let topPlayersQuery = dbContext.kmq.selectFrom(dbTable);

        const d = date || new Date();
        let resetDate: Date | null = null;
        let futureResetDate: Date | null = null;
        switch (duration) {
            case LeaderboardDuration.TODAY:
            case LeaderboardDuration.DAILY:
                resetDate = new Date(
                    d.getFullYear(),
                    d.getMonth(),
                    d.getDate(),
                );

                futureResetDate = new Date(
                    d.getFullYear(),
                    d.getMonth(),
                    d.getDate() + 1,
                );
                topPlayersQuery = topPlayersQuery.where("date", ">", resetDate);
                break;
            case LeaderboardDuration.WEEK:
            case LeaderboardDuration.WEEKLY:
                resetDate = new Date(
                    d.getFullYear(),
                    d.getMonth(),
                    d.getDate() - d.getDay(),
                );

                futureResetDate = new Date(
                    d.getFullYear(),
                    d.getMonth(),
                    d.getDate() - d.getDay() + 7,
                );

                topPlayersQuery = topPlayersQuery.where("date", ">", resetDate);
                break;
            case LeaderboardDuration.MONTH:
            case LeaderboardDuration.MONTHLY:
                resetDate = new Date(d.getFullYear(), d.getMonth());
                topPlayersQuery = topPlayersQuery.where("date", ">", resetDate);

                futureResetDate = new Date(d.getFullYear(), d.getMonth() + 1);
                break;
            case LeaderboardDuration.YEAR:
            case LeaderboardDuration.YEARLY:
                resetDate = new Date(d.getFullYear(), 0);
                topPlayersQuery = topPlayersQuery.where("date", ">", resetDate);

                futureResetDate = new Date(d.getFullYear() + 1, 0);
                break;
            case LeaderboardDuration.ALL_TIME:
            default:
                break;
        }

        if (scope === LeaderboardScope.SERVER) {
            const serverPlayers = (
                await dbContext.kmq
                    .selectFrom("player_servers")
                    .select("player_id")
                    .where("server_id", "=", messageContext.guildID)
                    .execute()
            ).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.where(
                "player_id",
                "in",
                serverPlayers,
            );
        } else if (scope === LeaderboardScope.GAME) {
            const participantIDs =
                State.gameSessions[
                    messageContext.guildID
                ].scoreboard.getPlayerIDs();

            const gamePlayers = (
                await dbContext.kmq
                    .selectFrom(dbTable)
                    .select("player_id")
                    .where("player_id", "in", participantIDs)
                    .execute()
            ).map((x) => x.player_id);

            topPlayersQuery = topPlayersQuery.where(
                "player_id",
                "in",
                gamePlayers,
            );
        }

        const pageCount = Math.ceil(
            (((await topPlayersQuery
                .select((eb) =>
                    eb.fn.count<number>("player_id").distinct().as("count"),
                )
                .executeTakeFirst()) ?? {})["count"] as number) /
                LEADERBOARD_ENTRIES_PER_PAGE,
        );

        for (let i = 0; i < pageCount; i++) {
            const offset = i * LEADERBOARD_ENTRIES_PER_PAGE;
            embedsFns.push(
                // eslint-disable-next-line @typescript-eslint/no-loop-func
                () =>
                    new Promise(async (resolve) => {
                        let topPlayers: (
                            | TopExpGainPlayer
                            | TopGamesPlayedPlayer
                            | TopSongsGuessedPlayer
                        )[];

                        switch (type) {
                            case LeaderboardType.EXP:
                                if (permanentLb) {
                                    topPlayers = await topPlayersQuery
                                        .select(["exp", "level", "player_id"])
                                        .orderBy("exp", "desc")
                                        .offset(offset)
                                        .limit(LEADERBOARD_ENTRIES_PER_PAGE)
                                        .execute();
                                } else {
                                    topPlayers = await topPlayersQuery
                                        .select(["player_id"])
                                        .select((eb) =>
                                            eb.fn
                                                .sum<number>("exp_gained")
                                                .as("exp"),
                                        )
                                        .select((eb) =>
                                            eb.fn
                                                .sum<number>("levels_gained")
                                                .as("level"),
                                        )
                                        .groupBy("player_id")
                                        .orderBy("exp", "desc")
                                        .offset(offset)
                                        .limit(LEADERBOARD_ENTRIES_PER_PAGE)
                                        .execute();
                                }

                                break;
                            case LeaderboardType.GAMES_PLAYED:
                                if (permanentLb) {
                                    topPlayers = await topPlayersQuery
                                        .select([
                                            "player_id",
                                            "games_played as game_count",
                                            "level",
                                        ])
                                        .orderBy("game_count", "desc")
                                        .offset(offset)
                                        .limit(LEADERBOARD_ENTRIES_PER_PAGE)
                                        .execute();
                                } else {
                                    topPlayers = await topPlayersQuery
                                        .select(["player_id"])
                                        .select((eb) =>
                                            eb.fn
                                                .count<number>("player_id")
                                                .as("game_count"),
                                        )
                                        .select((eb) =>
                                            eb.fn
                                                .sum<number>("levels_gained")
                                                .as("level"),
                                        )
                                        .groupBy("player_id")
                                        .orderBy("game_count", "desc")
                                        .offset(offset)
                                        .limit(LEADERBOARD_ENTRIES_PER_PAGE)
                                        .execute();
                                }

                                break;
                            case LeaderboardType.SONGS_GUESSED:
                                if (permanentLb) {
                                    topPlayers = await topPlayersQuery
                                        .select([
                                            "songs_guessed",
                                            "player_id",
                                            "level",
                                            "exp",
                                        ])
                                        .orderBy("songs_guessed", "desc")
                                        .offset(offset)
                                        .limit(LEADERBOARD_ENTRIES_PER_PAGE)
                                        .execute();
                                } else {
                                    topPlayers = await topPlayersQuery
                                        .select(["player_id"])
                                        .select((eb) =>
                                            eb.fn
                                                .sum<number>("levels_gained")
                                                .as("level"),
                                        )
                                        .select((eb) =>
                                            eb.fn
                                                .sum<number>("songs_guessed")
                                                .as("songs_guessed"),
                                        )

                                        .groupBy("player_id")
                                        .orderBy("songs_guessed", "desc")
                                        .offset(offset)
                                        .limit(LEADERBOARD_ENTRIES_PER_PAGE)
                                        .execute();
                                }

                                break;
                            default:
                                topPlayers = [];
                                logger.error(
                                    `Unexpected leaderboard type: ${type}`,
                                );
                                break;
                        }

                        const fields: Array<Eris.EmbedField> =
                            await Promise.all(
                                topPlayers.map(async (player, relativeRank) => {
                                    const rank = relativeRank + offset;
                                    const enrolledPlayer = await dbContext.kmq
                                        .selectFrom("leaderboard_enrollment")
                                        .select(["display_name"])
                                        .where(
                                            "player_id",
                                            "=",
                                            player.player_id,
                                        )
                                        .executeTakeFirst();

                                    const displayedRank =
                                        ["🥇", "🥈", "🥉"][rank] ||
                                        `${rank + 1}.`;

                                    const displayName = enrolledPlayer
                                        ? enrolledPlayer.display_name
                                        : i18n.translate(
                                              messageContext.guildID,
                                              "command.leaderboard.rankNumber",
                                              {
                                                  rank: friendlyFormattedNumber(
                                                      rank + 1,
                                                  ),
                                              },
                                          );

                                    let level: string;
                                    if (permanentLb) {
                                        level = i18n.translate(
                                            messageContext.guildID,
                                            "command.leaderboard.levelEntry.permanent",
                                            {
                                                level: i18n.translate(
                                                    messageContext.guildID,
                                                    "misc.level",
                                                ),
                                                formattedNumber:
                                                    friendlyFormattedNumber(
                                                        player.level,
                                                    ),
                                                rankName: getRankNameByLevel(
                                                    player.level,
                                                    messageContext.guildID,
                                                ),
                                            },
                                        );
                                    } else {
                                        const levelPluralized = i18n.translateN(
                                            messageContext.guildID,
                                            "misc.plural.level",
                                            player.level,
                                        );

                                        level = i18n.translate(
                                            messageContext.guildID,
                                            "command.leaderboard.levelEntry.temporary",
                                            {
                                                formattedNumber:
                                                    friendlyFormattedNumber(
                                                        player.level,
                                                    ),
                                                levelPluralized,
                                            },
                                        );
                                    }

                                    let value: string;
                                    switch (type) {
                                        case LeaderboardType.EXP:
                                            if (permanentLb) {
                                                const exp = `${friendlyFormattedNumber(
                                                    (player as TopExpGainPlayer)
                                                        .exp,
                                                )} EXP`;

                                                value = `${exp} | ${level}`;
                                            } else {
                                                const expGained = `+${friendlyFormattedNumber(
                                                    (player as TopExpGainPlayer)
                                                        .exp,
                                                )} EXP`;

                                                value = `${expGained} | ${level}`;
                                            }

                                            break;
                                        case LeaderboardType.GAMES_PLAYED: {
                                            const games = i18n.translate(
                                                messageContext.guildID,
                                                "command.leaderboard.gamesPlayed",
                                                {
                                                    gameCount:
                                                        friendlyFormattedNumber(
                                                            (
                                                                player as TopGamesPlayedPlayer
                                                            ).game_count,
                                                        ),
                                                },
                                            );

                                            value = `${games} | ${level}`;
                                            break;
                                        }

                                        case LeaderboardType.SONGS_GUESSED: {
                                            const guesses = i18n.translate(
                                                messageContext.guildID,
                                                "command.leaderboard.songsGuessed",
                                                {
                                                    songsGuessed:
                                                        friendlyFormattedNumber(
                                                            (
                                                                player as TopSongsGuessedPlayer
                                                            ).songs_guessed,
                                                        ),
                                                },
                                            );

                                            value = `${guesses} | ${level}`;
                                            break;
                                        }

                                        default:
                                            logger.error(
                                                `Unexpected leaderboardType = ${type}`,
                                            );
                                            value = "null";
                                            break;
                                    }

                                    return {
                                        name: `${
                                            invokerId === player.player_id
                                                ? "\\➡"
                                                : ""
                                        }${displayedRank} ${displayName}`,
                                        value,
                                    };
                                }),
                            );

                        let leaderboardScope: string;
                        switch (scope) {
                            case LeaderboardScope.GLOBAL:
                                leaderboardScope = i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.scope.global",
                                );
                                break;
                            case LeaderboardScope.SERVER:
                                if (process.env.NODE_ENV !== EnvType.TEST) {
                                    leaderboardScope = i18n.translate(
                                        messageContext.guildID,
                                        "command.leaderboard.scope.server.withName",
                                        {
                                            serverName: State.client.guilds.get(
                                                messageContext.guildID,
                                            )!.name,
                                        },
                                    );
                                } else {
                                    leaderboardScope = i18n.translate(
                                        messageContext.guildID,
                                        "command.leaderboard.scope.server.noName",
                                    );
                                }

                                break;
                            case LeaderboardScope.GAME:
                                leaderboardScope = i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.scope.currentGame",
                                );
                                break;
                            default:
                                logger.error(
                                    `Unexpected leaderboardScope = ${scope}`,
                                );
                                leaderboardScope = "invalid";
                                break;
                        }

                        let leaderboardDuration: string;
                        switch (duration) {
                            case LeaderboardDuration.TODAY:
                            case LeaderboardDuration.DAILY:
                                leaderboardDuration = i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.daily",
                                );
                                break;
                            case LeaderboardDuration.WEEK:
                            case LeaderboardDuration.WEEKLY:
                                leaderboardDuration = i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.weekly",
                                );
                                break;
                            case LeaderboardDuration.MONTH:
                            case LeaderboardDuration.MONTHLY:
                                leaderboardDuration = i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.monthly",
                                );
                                break;
                            case LeaderboardDuration.YEAR:
                            case LeaderboardDuration.YEARLY:
                                leaderboardDuration = i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.yearly",
                                );
                                break;
                            case LeaderboardDuration.ALL_TIME:
                                leaderboardDuration = i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.duration.allTime",
                                );
                                break;
                            default:
                                leaderboardDuration = "invalid";
                                logger.error(
                                    `Unexpected leaderboardDuration = ${duration}`,
                                );
                                break;
                        }

                        let leaderboardType: string;
                        switch (type) {
                            case LeaderboardType.EXP:
                                leaderboardType = "";
                                break;
                            case LeaderboardType.GAMES_PLAYED:
                                leaderboardType = `(${i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.type.byGamesPlayed",
                                )})`;
                                break;
                            case LeaderboardType.SONGS_GUESSED:
                                leaderboardType = `(${i18n.translate(
                                    messageContext.guildID,
                                    "command.leaderboard.type.bySongsGuessed",
                                )})`;
                                break;
                            default:
                                logger.error(
                                    `Unexpected leaderboardType = ${type}`,
                                );
                                leaderboardType = "invalid";
                                break;
                        }

                        let description = "";
                        if (futureResetDate) {
                            description += i18n.translate(
                                messageContext.guildID,
                                "command.leaderboard.resets",
                                {
                                    timestamp: `<t:${Math.floor(
                                        futureResetDate.getTime() / 1000,
                                    )}:R>`,
                                },
                            );
                        }

                        resolve({
                            title: i18n
                                .translate(
                                    messageContext.guildID,
                                    "command.leaderboard.title",
                                    {
                                        leaderboardScope,
                                        leaderboardDuration,
                                        leaderboardType,
                                    },
                                )
                                .trimEnd(),
                            description,
                            fields,
                            timestamp: new Date(),
                            thumbnail: { url: KmqImages.THUMBS_UP },
                            footer: {
                                text: i18n.translate(
                                    messageContext.guildID,
                                    chooseRandom(leaderboardQuotes),
                                    {
                                        command: `${clickableSlashCommand(
                                            "help",
                                        )} action:${COMMAND_NAME}`,
                                    },
                                ),
                            },
                        });
                    }),
            );
        }

        return { embeds: embedsFns, pageCount };
    }

    private static async enrollLeaderboard(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const alreadyEnrolled = !!(await dbContext.kmq
            .selectFrom("leaderboard_enrollment")
            .selectAll()
            .where("player_id", "=", messageContext.author.id)
            .executeTakeFirst());

        if (alreadyEnrolled) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.leaderboard.failure.alreadyEnrolled.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.leaderboard.failure.alreadyEnrolled.description",
                    ),
                },
                interaction,
            );
            return;
        }

        await dbContext.kmq
            .insertInto("leaderboard_enrollment")
            .values({
                player_id: messageContext.author.id,
                display_name: await getUserTag(messageContext.author.id),
            })
            .execute();

        sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.leaderboard.enrolled.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.leaderboard.enrolled.description",
                ),
            },
            false,
            undefined,
            [],
            interaction,
        );
    }

    private static async unenrollLeaderboard(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        await dbContext.kmq
            .deleteFrom("leaderboard_enrollment")
            .where("player_id", "=", messageContext.author.id)
            .execute();

        sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.leaderboard.unenrolled.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.leaderboard.unenrolled.description",
                ),
            },
            false,
            undefined,
            [],
            interaction,
        );
    }

    private static async showLeaderboard(
        messageOrInteraction: GuildTextableMessage | Eris.CommandInteraction,
        type: LeaderboardType = LeaderboardType.EXP,
        scope: LeaderboardScope = LeaderboardScope.GLOBAL,
        duration: LeaderboardDuration = LeaderboardDuration.ALL_TIME,
        pageOffset: number = 0,
    ): Promise<void> {
        const messageContext = new MessageContext(
            messageOrInteraction.channel.id,
            new KmqMember(messageOrInteraction.member!.id),
            messageOrInteraction.guildID as string,
        );

        if (scope === LeaderboardScope.GAME) {
            if (!State.gameSessions[messageContext.guildID]) {
                sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.game.noneInProgress.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.game.noneInProgress.description",
                        ),
                        thumbnailUrl: KmqImages.NOT_IMPRESSED,
                    },
                    messageOrInteraction instanceof Eris.CommandInteraction
                        ? messageOrInteraction
                        : undefined,
                );
                return;
            }

            const participantIDs =
                State.gameSessions[
                    messageContext.guildID
                ].scoreboard.getPlayerIDs();

            if (participantIDs.length === 0) {
                sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.leaderboard.failure.game.noParticipants.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.leaderboard.failure.game.noParticipants.description",
                        ),
                        thumbnailUrl: KmqImages.NOT_IMPRESSED,
                    },
                    messageOrInteraction instanceof Eris.CommandInteraction
                        ? messageOrInteraction
                        : undefined,
                );
                return;
            }
        }

        const { embeds, pageCount } =
            await LeaderboardCommand.getLeaderboardEmbeds(
                messageContext,
                type,
                scope,
                duration,
                messageContext.author.id,
            );

        if (pageCount === 0) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.leaderboard.failure.empty.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.leaderboard.failure.empty.description",
                    ),
                    thumbnailUrl: KmqImages.DEAD,
                },
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : undefined,
            );
            return;
        }

        if (pageOffset > pageCount) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.leaderboard.failure.outOfRange.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.leaderboard.failure.outOfRange.description",
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : undefined,
            );
            return;
        }

        await sendPaginationedEmbed(
            messageOrInteraction,
            embeds,
            undefined,
            pageOffset,
        );

        logger.info(
            `${getDebugLogHeader(
                messageOrInteraction,
            )} | Leaderboard retrieved (${scope})`,
        );
    }
}
