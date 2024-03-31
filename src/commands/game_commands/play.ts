import {
    CLIP_DEFAULT_TIMER,
    CLIP_MAX_TIMER,
    CLIP_MIN_TIMER,
    DataFiles,
    ELIMINATION_DEFAULT_LIVES,
    ELIMINATION_MAX_LIVES,
    ELIMINATION_MIN_LIVES,
    EMBED_SUCCESS_BONUS_COLOR,
    HIDDEN_DEFAULT_TIMER,
    KmqImages,
    MAX_AUTOCOMPLETE_FIELDS,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    activeBonusUsers,
    isFirstGameOfDay,
    isPowerHour,
} from "../../helpers/game_utils";
import { bold, durationDays, getMention, isWeekend } from "../../helpers/utils";
import {
    clickableSlashCommand,
    fetchChannel,
    fetchUser,
    generateOptionsMessage,
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getGameInfoMessage,
    getInteractionValue,
    getUserTag,
    getUserVoiceChannel,
    notifyOptionsGenerationError,
    sendErrorMessage,
    sendInfoMessage,
    tryAutocompleteInteractionAcknowledge,
    tryCreateInteractionSuccessAcknowledgement,
    voicePermissionsCheck,
} from "../../helpers/discord_utils";
import AnswerCommand from "../game_options/answer";
import AnswerType from "../../enums/option_types/answer_type";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameSession from "../../structures/game_session";
import GameType from "../../enums/game_type";
import GuildPreference from "../../structures/guild_preference";
import KmqMember from "../../structures/kmq_member";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Player from "../../structures/player";
import Session from "../../structures/session";
import State from "../../state";
import dbContext from "../../database_context";
import fs from "fs";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type TeamScoreboard from "../../structures/team_scoreboard";

const COMMAND_NAME = "play";
const logger = new IPCLogger(COMMAND_NAME);

export const enum PlayTeamsAction {
    CREATE = "create",
    JOIN = "join",
    BEGIN = "begin",
}

export default class PlayCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.notRestartingPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "gameType",
                type: "enum" as const,
                enums: Object.values(GameType),
            },
            {
                name: "gameArg",
                type: "number" as const,
            },
        ],
    };

    aliases = ["random", "start", "p"];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.play.help.description"),
        priority: 1050,
        examples: [
            {
                example: clickableSlashCommand(COMMAND_NAME, GameType.CLASSIC),
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.classic",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    GameType.ELIMINATION,
                )} lives:5`,
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.elimination",
                    {
                        lives: "`5`",
                    },
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    GameType.ELIMINATION,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.elimination",
                    {
                        lives: `\`${ELIMINATION_DEFAULT_LIVES}\``,
                    },
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    GameType.TEAMS,
                    PlayTeamsAction.CREATE,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.teams",
                ),
            },
            {
                example: clickableSlashCommand(COMMAND_NAME, AnswerType.HIDDEN),
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.hidden",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    GameType.SUDDEN_DEATH,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.suddenDeath",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    GameType.CLIP,
                )} timer:0.75`,
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.clip",
                    {
                        clipTimer: "`0.75`",
                    },
                ),
            },
            {
                example: clickableSlashCommand(COMMAND_NAME, GameType.CLIP),
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.clip",
                    {
                        clipTimer: `\`${ELIMINATION_DEFAULT_LIVES}\``,
                    },
                ),
            },
        ],
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: GameType.CLASSIC,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.play.help.example.classic",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.play.help.example.classic",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
                {
                    name: AnswerType.HIDDEN,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.play.help.example.hidden",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.play.help.example.hidden",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
                {
                    name: GameType.ELIMINATION,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.play.help.example.elimination",
                        {
                            lives: `${ELIMINATION_DEFAULT_LIVES}`,
                        },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.play.help.example.elimination",
                                    { lives: `${ELIMINATION_DEFAULT_LIVES}` },
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "lives",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.help.interaction.lives",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.play.help.interaction.lives",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                            min_value: ELIMINATION_MIN_LIVES,
                            max_value: ELIMINATION_MAX_LIVES,
                        },
                    ],
                },
                {
                    name: GameType.TEAMS,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.play.help.example.teams",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.play.help.example.teams",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND_GROUP,
                    options: [
                        {
                            name: PlayTeamsAction.CREATE,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.interaction.teams_create",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.play.interaction.teams_create",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                        },
                        {
                            name: PlayTeamsAction.BEGIN,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.interaction.teams_begin",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.play.interaction.teams_begin",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                        },
                        {
                            name: PlayTeamsAction.JOIN,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.interaction.teams_join",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.play.interaction.teams_join",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "team_name",
                                    autocomplete: true,
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.play.interaction.teams_join_team_name",
                                    ),
                                    description_localizations: Object.values(
                                        LocaleType,
                                    )
                                        .filter((x) => x !== LocaleType.EN)
                                        .reduce(
                                            (acc, locale) => ({
                                                ...acc,
                                                [locale]: i18n.translate(
                                                    locale,
                                                    "command.play.interaction.teams_join_team_name",
                                                ),
                                            }),
                                            {},
                                        ),
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.STRING,
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
                {
                    name: GameType.SUDDEN_DEATH,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.play.help.example.suddenDeath",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.play.help.example.suddenDeath",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
                {
                    name: GameType.CLIP,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.play.help.example.clip",
                        {
                            clipTimer: `\`${ELIMINATION_DEFAULT_LIVES}\``,
                        },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.play.help.example.clip",
                                    {
                                        clipTimer: `\`${ELIMINATION_DEFAULT_LIVES}\``,
                                    },
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                    options: [
                        {
                            name: "timer",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.help.interaction.clipTimer",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.play.help.interaction.clipTimer",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .NUMBER,
                            min_value: CLIP_MIN_TIMER,
                            max_value: CLIP_MAX_TIMER,
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
        const { interactionKey, interactionOptions } =
            getInteractionValue(interaction);

        if (interactionKey === null) {
            logger.error(
                "interactionKey unexpectedly null in processChatInputInteraction",
            );
            return;
        }

        const gameType = interactionKey.split(".")[0] as GameType;
        if (interactionKey === `${GameType.TEAMS}.${PlayTeamsAction.BEGIN}`) {
            await PlayCommand.beginTeamsGame(messageContext, interaction);
        } else if (
            interactionKey.startsWith(
                `${GameType.TEAMS}.${PlayTeamsAction.JOIN}`,
            )
        ) {
            await PlayCommand.joinTeamsGame(
                messageContext,
                interactionOptions["team_name"],
                interaction,
            );
        } else {
            await PlayCommand.startGame(
                messageContext,
                gameType,
                interactionOptions["lives"],
                interactionOptions["timer"],
                interactionKey === AnswerType.HIDDEN,
                interaction,
            );
        }
    }

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const gameTypeRaw = parsedMessage.components[0]?.toLowerCase();
        let gameType: GameType;
        if (
            !gameTypeRaw ||
            !Object.values(GameType).includes(gameTypeRaw as GameType)
        ) {
            gameType = GameType.CLASSIC;
        } else {
            gameType = gameTypeRaw as GameType;
        }

        const firstArg =
            parsedMessage.components.length <= 1
                ? null
                : parsedMessage.components[1]!;

        await PlayCommand.startGame(
            MessageContext.fromMessage(message),
            gameType,
            firstArg,
            firstArg,
            gameTypeRaw === AnswerType.HIDDEN,
        );
    };

    /**
     * Handles showing suggested team names
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction,
    ): Promise<void> {
        const interactionData = getInteractionValue(interaction);
        const focusedKey = interactionData.focusedKey;
        if (focusedKey === null) {
            logger.error(
                "focusedKey unexpectedly null in processGroupAutocompleteInteraction",
            );

            return;
        }

        const gameSession = Session.getSession(interaction.guildID!) as
            | GameSession
            | undefined;

        if (!gameSession || gameSession.gameType !== GameType.TEAMS) {
            await tryAutocompleteInteractionAcknowledge(interaction, []);
            return;
        }

        const teamNames = (
            gameSession.scoreboard as TeamScoreboard
        ).getTeamNames();

        if (teamNames.length === 0) {
            await tryAutocompleteInteractionAcknowledge(interaction, []);
            return;
        }

        const focusedVal = interactionData.interactionOptions[focusedKey];
        const lowercaseUserInput = focusedVal.toLowerCase();

        if (!lowercaseUserInput) {
            await tryAutocompleteInteractionAcknowledge(
                interaction,
                teamNames
                    .map((x) => ({ name: x, value: x }))
                    .slice(0, MAX_AUTOCOMPLETE_FIELDS),
            );
        } else {
            await tryAutocompleteInteractionAcknowledge(
                interaction,
                teamNames
                    .filter((x) => x.startsWith(lowercaseUserInput))
                    .map((x) => ({ name: x, value: x }))
                    .slice(0, MAX_AUTOCOMPLETE_FIELDS),
            );
        }
    }

    static async canStartTeamsGame(
        gameSession: GameSession | null,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<boolean> {
        if (!gameSession || gameSession.gameType !== GameType.TEAMS) {
            await sendErrorMessage(
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
                interaction,
            );
            return false;
        }

        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        if (teamScoreboard.getNumTeams() === 0) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.begin.ignored.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.begin.ignored.noTeam.description",
                        {
                            join: clickableSlashCommand(
                                COMMAND_NAME,
                                GameType.TEAMS,
                                PlayTeamsAction.JOIN,
                            ),
                        },
                    ),
                },
                interaction,
            );
            return false;
        }

        return true;
    }

    static async beginTeamsGame(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const gameSession = Session.getSession(
            messageContext.guildID,
        ) as GameSession;

        if (
            !(await PlayCommand.canStartTeamsGame(
                gameSession,
                messageContext,
                interaction,
            ))
        ) {
            return;
        }

        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (!gameSession.sessionInitialized) {
            const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
            const participantIDs = teamScoreboard
                .getPlayers()
                .map((player) => player.id);

            const channel = State.client.getChannel(
                messageContext.textChannelID,
            ) as Eris.TextChannel;

            const voiceChannel = getUserVoiceChannel(messageContext);

            if (!voiceChannel) {
                logger.error("Voice channel unexpectedly not found");
            }

            await PlayCommand.sendBeginGameSessionMessage(
                channel.name,
                voiceChannel?.name ?? "unknown",
                messageContext,
                participantIDs,
                guildPreference,
                interaction,
            );

            await gameSession.startRound(messageContext);

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Teams game session starting`,
            );
        }
    }

    static async joinTeamsGame(
        messageContext: MessageContext,
        teamName: string,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const gameSession = Session.getSession(messageContext.guildID) as
            | GameSession
            | undefined;

        if (!gameSession || gameSession.gameType !== GameType.TEAMS) {
            await sendErrorMessage(
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
                interaction,
            );
            return;
        }

        // Don't allow emojis that aren't in this server
        // Emojis are of the format: <(a if animated):(alphanumeric):(number)>
        const emojis = teamName.match(/<a?:[a-zA-Z0-9]+:[0-9]+>/gm) || [];
        for (const emoji of emojis) {
            const emojiID = (
                emoji.match(/(?<=<a?:[a-zA-Z0-9]+:)[0-9]+(?=>)/gm) ?? []
            ).join("");

            if (
                !State.client.guilds
                    .get(messageContext.guildID)!
                    .emojis.map((e) => e.id)
                    .includes(emojiID)
            ) {
                // eslint-disable-next-line no-await-in-loop
                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.join.failure.joinError.invalidTeamName.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.join.failure.joinError.badEmojis.description",
                        ),
                    },
                    interaction,
                );

                logger.warn(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Team name contains unsupported characters.`,
                );
                return;
            }
        }

        if (teamName.length === 0) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Team name contains unsupported characters.`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.join.failure.joinError.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.join.failure.joinError.invalidCharacters.description",
                    ),
                },
                interaction,
            );
            return;
        }

        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        if (!teamScoreboard.hasTeam(teamName)) {
            const user = (await fetchUser(
                messageContext.author.id,
            )) as Eris.User;

            teamScoreboard.addTeam(
                teamName,
                Player.fromUser(
                    user,
                    messageContext.guildID,
                    0,
                    await isFirstGameOfDay(messageContext.author.id),
                ),
                messageContext.guildID,
            );
            const teamNameWithCleanEmojis = teamName.replace(
                /(<a?)(:[a-zA-Z0-9]+:)([0-9]+>)/gm,
                (_p1, _p2, p3) => p3,
            );

            await sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.join.team.new",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.join.team.join",
                        {
                            teamName: bold(teamName),
                            mentionedUser: getMention(messageContext.author.id),
                            joinCommand: clickableSlashCommand(
                                COMMAND_NAME,
                                GameType.TEAMS,
                                PlayTeamsAction.JOIN,
                            ),
                            teamNameWithCleanEmojis,
                            startGameInstructions:
                                !gameSession.sessionInitialized
                                    ? i18n.translate(
                                          messageContext.guildID,
                                          "command.join.team.startGameInstructions",
                                          {
                                              beginCommand:
                                                  clickableSlashCommand(
                                                      COMMAND_NAME,
                                                      GameType.TEAMS,
                                                      PlayTeamsAction.BEGIN,
                                                  ),
                                          },
                                      )
                                    : "",
                        },
                    ),
                    thumbnailUrl: KmqImages.READING_BOOK,
                },
                false,
                undefined,
                [],
                interaction,
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Team '${teamName}' created.`,
            );
        } else {
            const team = teamScoreboard.getTeam(teamName);
            if (!team) {
                logger.warn(`Team ${teamName} doesn't exist`);
                return;
            }

            if (team.hasPlayer(messageContext.author.id)) {
                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.join.failure.joinError.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.join.failure.joinError.alreadyInTeam.description",
                        ),
                    },
                    interaction,
                );

                logger.info(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Already joined team '${teamName}'.`,
                );
                return;
            }

            const player = (await fetchUser(
                messageContext.author.id,
            )) as Eris.User;

            teamScoreboard.addTeamPlayer(
                team.id,
                Player.fromUser(
                    player,
                    messageContext.guildID,
                    0,
                    await isFirstGameOfDay(messageContext.author.id),
                ),
            );

            await sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.join.playerJoinedTeam.title",
                        {
                            joiningUser: await getUserTag(
                                messageContext.author.id,
                            ),
                            teamName: team.getName(),
                        },
                    ),
                    description: !gameSession.sessionInitialized
                        ? i18n.translate(
                              messageContext.guildID,
                              "command.join.playerJoinedTeam.beforeGameStart.description",
                              {
                                  beginCommand: clickableSlashCommand(
                                      COMMAND_NAME,
                                      GameType.TEAMS,
                                      PlayTeamsAction.BEGIN,
                                  ),
                              },
                          )
                        : i18n.translate(
                              messageContext.guildID,
                              "command.join.playerJoinedTeam.afterGameStart.description",
                              {
                                  mentionedUser: getMention(
                                      messageContext.author.id,
                                  ),
                                  teamName: bold(team.getName()),
                              },
                          ),
                    thumbnailUrl: KmqImages.LISTENING,
                },
                false,
                undefined,
                [],
                interaction,
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Successfully joined team '${team.getName()}'.`,
            );
        }
    }

    static async startGame(
        messageContext: MessageContext,
        gameType: GameType,
        livesArg: string | null,
        clipTimerArg: string | null,
        hiddenMode: boolean,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildID = messageContext.guildID;
        const guildPreference =
            await GuildPreference.getGuildPreference(guildID);

        const currentGameSession = State.gameSessions[guildID];
        const voiceChannel = getUserVoiceChannel(messageContext);

        if (!voiceChannel) {
            const title = i18n.translate(guildID, "misc.failure.notInVC.title");

            const description = i18n.translate(
                guildID,
                "misc.failure.notInVC.description",
                {
                    command: clickableSlashCommand(
                        COMMAND_NAME,
                        gameType,
                        gameType === GameType.TEAMS
                            ? PlayTeamsAction.CREATE
                            : undefined,
                    ),
                },
            );

            await sendErrorMessage(
                messageContext,
                { title, description },
                interaction,
            );

            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | User not in voice channel`,
            );
            return;
        }

        if (!(await voicePermissionsCheck(messageContext, interaction))) {
            return;
        }

        if (currentGameSession) {
            if (currentGameSession.sessionInitialized) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Attempted to start a game while one is already in progress.`,
                );

                const title = i18n.translate(
                    guildID,
                    "command.play.failure.alreadyInSession",
                );

                await sendErrorMessage(messageContext, { title }, interaction);
                return;
            }

            if (gameType === GameType.TEAMS) {
                // User sent /play teams twice, reset the GameSession
                Session.deleteSession(guildID);
                logger.info(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Teams game session was in progress, has been reset.`,
                );
            }
        }

        if (State.playlistManager.isParseInProgress(guildID)) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        guildID,
                        "command.play.failure.playlistParseInProgress.title",
                    ),
                    description: i18n.translate(
                        guildID,
                        "command.play.failure.playlistParseInProgress.description",
                    ),
                },
                interaction,
            );
            return;
        }

        if (hiddenMode) {
            await AnswerCommand.setAnswerHidden(guildPreference);
        }

        // (1) No game session exists yet (create ELIMINATION, TEAMS, CLASSIC, or COMPETITION game), or
        // (2) User attempting to ,play after a ,play teams that didn't start, start CLASSIC game
        const textChannel = (await fetchChannel(
            messageContext.textChannelID,
        )) as Eris.TextChannel;

        const gameOwner = new KmqMember(messageContext.author.id);
        let gameSession: GameSession;

        if (gameType === GameType.TEAMS) {
            // (1) TEAMS game creation
            const startTitle = i18n.translate(
                guildID,
                "command.play.team.joinTeam.title",
                {
                    join: clickableSlashCommand(
                        COMMAND_NAME,
                        GameType.TEAMS,
                        PlayTeamsAction.JOIN,
                    ),
                },
            );

            const gameInstructions = i18n.translate(
                guildID,
                "command.play.team.joinTeam.description",
                {
                    join: clickableSlashCommand(
                        COMMAND_NAME,
                        GameType.TEAMS,
                        PlayTeamsAction.JOIN,
                    ),
                },
            );

            gameSession = new GameSession(
                guildPreference,
                textChannel.id,
                voiceChannel.id,
                textChannel.guild.id,
                gameOwner,
                gameType,
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Team game session created.`,
            );

            if (interaction) {
                await tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    startTitle,
                    gameInstructions,
                );
            } else {
                await sendInfoMessage(messageContext, {
                    title: startTitle,
                    description: gameInstructions,
                    thumbnailUrl: KmqImages.HAPPY,
                });
            }
        } else {
            // (1 and 2) CLASSIC, ELIMINATION, and COMPETITION game creation
            if (currentGameSession) {
                // (2) Let the user know they're starting a non-teams game
                const oldGameType = currentGameSession.gameType;
                const ignoringOldGameTypeTitle = i18n.translate(
                    guildID,
                    "command.play.failure.overrideTeams.title",
                    {
                        playOldGameType: clickableSlashCommand(
                            COMMAND_NAME,
                            oldGameType,
                        ),
                    },
                );

                const gameSpecificInstructions = i18n.translate(
                    guildID,
                    "command.play.failure.overrideTeams.teams.join",
                    {
                        join: clickableSlashCommand(
                            COMMAND_NAME,
                            GameType.TEAMS,
                            PlayTeamsAction.JOIN,
                        ),
                    },
                );

                const oldGameTypeInstructions = i18n.translate(
                    guildID,
                    "command.play.failure.overrideTeams.description",
                    {
                        oldGameType: `\`${oldGameType}\``,
                        end: clickableSlashCommand("end"),
                        playOldGameType: clickableSlashCommand(
                            COMMAND_NAME,
                            oldGameType,
                        ),
                        gameSpecificInstructions,
                        begin: clickableSlashCommand(
                            COMMAND_NAME,
                            GameType.TEAMS,
                            PlayTeamsAction.BEGIN,
                        ),
                    },
                );

                logger.warn(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | User attempted /play on a mode that requires player joins.`,
                );

                await sendErrorMessage(
                    messageContext,
                    {
                        title: ignoringOldGameTypeTitle,
                        description: oldGameTypeInstructions,
                        thumbnailUrl: KmqImages.DEAD,
                    },
                    interaction,
                );
            }

            if (gameType === GameType.COMPETITION) {
                const isModerator = await dbContext.kmq
                    .selectFrom("competition_moderators")
                    .select("user_id")
                    .where("guild_id", "=", guildID)
                    .where("user_id", "=", messageContext.author.id)
                    .executeTakeFirst();

                if (!isModerator) {
                    await sendErrorMessage(messageContext, {
                        title: i18n.translate(
                            guildID,
                            "command.play.failure.hiddenGameMode.title",
                        ),
                        description: i18n.translate(
                            guildID,
                            "command.play.failure.hiddenGameMode.description",
                        ),
                        thumbnailUrl: KmqImages.DEAD,
                    });
                    return;
                }
            }

            let lives: number;
            if (livesArg == null) {
                lives = ELIMINATION_DEFAULT_LIVES;
            } else {
                lives = parseInt(livesArg, 10);
                if (
                    lives < ELIMINATION_MIN_LIVES ||
                    lives > ELIMINATION_MAX_LIVES
                ) {
                    lives = ELIMINATION_DEFAULT_LIVES;
                }
            }

            let clipTimer: number;
            if (clipTimerArg == null) {
                clipTimer = CLIP_DEFAULT_TIMER;
            } else {
                clipTimer = parseFloat(clipTimerArg);
                clipTimer = Math.round(clipTimer! * 100) / 100;
                if (clipTimer < CLIP_MIN_TIMER || clipTimer > CLIP_MAX_TIMER) {
                    clipTimer = CLIP_DEFAULT_TIMER;
                }
            }

            gameSession = new GameSession(
                guildPreference,
                textChannel.id,
                voiceChannel.id,
                textChannel.guild.id,
                gameOwner,
                gameType,
                lives,
                clipTimer,
            );
        }

        // prevent any duplicate game sessions
        if (currentGameSession) {
            await currentGameSession.endSession(
                "Duplicate game session",
                false,
            );
        }

        State.gameSessions[guildID] = gameSession;
        if (gameSession.isHiddenMode()) {
            if (!guildPreference.isGuessTimeoutSet()) {
                await guildPreference.setGuessTimeout(HIDDEN_DEFAULT_TIMER);
            }
        }

        if (gameType !== GameType.TEAMS) {
            await PlayCommand.sendBeginGameSessionMessage(
                textChannel.name,
                voiceChannel.name,
                messageContext,
                getCurrentVoiceMembers(voiceChannel.id).map((x) => x.id),
                guildPreference,
                interaction,
            );

            await gameSession.startRound(messageContext);
        }
    }

    /**
     * Sends the beginning of game session message
     * @param textChannelName - The name of the text channel to send the message to
     * @param voiceChannelName - The name of the voice channel to join
     * @param messageContext - The original message that triggered the command
     * @param participantIDs - The list of participants
     * @param guildPreference - The guild's game preferences
     * @param interaction - The interaction that started the game
     */
    static async sendBeginGameSessionMessage(
        textChannelName: string,
        voiceChannelName: string,
        messageContext: MessageContext,
        participantIDs: Array<string>,
        guildPreference: GuildPreference,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildID = messageContext.guildID;
        let gameInstructions = i18n.translate(
            guildID,
            "command.play.typeGuess",
        );

        const bonusUsers = await activeBonusUsers();
        const bonusUserParticipantIDs = participantIDs.filter((x) =>
            bonusUsers.has(x),
        );

        const isBonus = bonusUserParticipantIDs.length > 0;

        if (isBonus) {
            let bonusUserMentions = bonusUserParticipantIDs.map((x) =>
                getMention(x),
            );

            if (bonusUserMentions.length > 10) {
                bonusUserMentions = bonusUserMentions.slice(0, 10);
                bonusUserMentions.push(
                    i18n.translate(guildID, "misc.andManyOthers"),
                );
            }

            gameInstructions += `\n\n${bonusUserMentions.join(", ")} `;
            gameInstructions += i18n.translate(
                guildID,
                "command.play.exp.doubleExpForVoting",
                {
                    link: "https://top.gg/bot/508759831755096074/vote",
                },
            );

            gameInstructions += " ";
            gameInstructions += i18n.translate(
                guildID,
                "command.play.exp.howToVote",
                { vote: clickableSlashCommand("vote") },
            );
        }

        if (isWeekend()) {
            gameInstructions += `\n\n**⬆️ ${i18n.translate(
                guildID,
                "command.play.exp.weekend",
            )} ⬆️**`;
        } else if (isPowerHour()) {
            gameInstructions += `\n\n**⬆️ ${i18n.translate(
                guildID,
                "command.play.exp.powerHour",
            )} ⬆️**`;
        }

        const startTitle = i18n.translate(
            guildID,
            "command.play.gameStarting",
            {
                textChannelName,
                voiceChannelName,
            },
        );

        const gameInfoMessage = await getGameInfoMessage(
            messageContext.guildID,
        );

        const fields: Eris.EmbedField[] = [];
        if (gameInfoMessage) {
            fields.push({
                name: gameInfoMessage.title,
                value: gameInfoMessage.message,
                inline: false,
            });
        }

        const startGamePayload = {
            title: startTitle,
            description: gameInstructions,
            color: isBonus ? EMBED_SUCCESS_BONUS_COLOR : undefined,
            thumbnailUrl: KmqImages.HAPPY,
            fields,
            footerText: `KMQ ${State.version}`,
        };

        const optionsEmbedPayload = await generateOptionsMessage(
            Session.getSession(guildID),
            messageContext,
            guildPreference,
            [],
        );

        const additionalPayloads = [];
        if (optionsEmbedPayload) {
            if (!isBonus && Math.random() < 0.5) {
                optionsEmbedPayload.footerText = i18n.translate(
                    messageContext.guildID,
                    "command.play.voteReminder",
                    {
                        vote: "/vote",
                    },
                );
            }

            additionalPayloads.push(optionsEmbedPayload);
        } else {
            await notifyOptionsGenerationError(messageContext, COMMAND_NAME);
        }

        let newsFileContent: string | undefined;
        try {
            newsFileContent = (
                await fs.promises.readFile(DataFiles.NEWS)
            ).toString();
        } catch (e) {
            logger.warn(`News file does not exist or is empty. error = ${e}`);
        }

        if (newsFileContent) {
            const staleUpdateThreshold = 30;
            const newsData: Array<{ updateTime: Date; entry: string }> =
                newsFileContent
                    .split("\n\n")
                    .filter((x) => x)
                    .map((x) => ({
                        updateTime: new Date(
                            x.split("\n")[0]!.replaceAll("*", ""),
                        ),
                        entry: x,
                    }))
                    .filter((x) => {
                        if (Number.isNaN(x.updateTime.getTime())) {
                            logger.error(
                                `Error parsing update time for ${x.entry}`,
                            );
                            return false;
                        }

                        const updateAge = durationDays(
                            x.updateTime.getTime(),
                            Date.now(),
                        );

                        if (updateAge > staleUpdateThreshold) {
                            return false;
                        }

                        return true;
                    });

            if (newsData.length > 0) {
                const latestUpdate = durationDays(
                    newsData[0]!.updateTime.getTime(),
                    Date.now(),
                );

                const recencyShowUpdate =
                    (staleUpdateThreshold - latestUpdate) /
                    staleUpdateThreshold;

                if (Math.random() < recencyShowUpdate) {
                    const recentUpdatePayload = {
                        title: clickableSlashCommand("botnews"),
                        description: newsData.map((x) => x.entry).join("\n"),
                        footerText: i18n.translate(
                            guildID,
                            "command.botnews.updates.footer",
                        ),
                    };

                    additionalPayloads.push(recentUpdatePayload);
                }
            }
        }

        await sendInfoMessage(
            messageContext,
            startGamePayload,
            false,
            undefined,
            additionalPayloads,
            interaction,
        );
    }
}
