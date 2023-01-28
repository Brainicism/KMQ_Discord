import {
    ELIMINATION_DEFAULT_LIVES,
    ELIMINATION_MAX_LIVES,
    ELIMINATION_MIN_LIVES,
    EMBED_SUCCESS_BONUS_COLOR,
    KmqImages,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    activeBonusUsers,
    areUsersPremium,
    isFirstGameOfDay,
    isPowerHour,
    isPremiumRequest,
    isUserPremium,
} from "../../helpers/game_utils";
import { bold, getMention, isWeekend } from "../../helpers/utils";
import {
    fetchChannel,
    generateOptionsMessage,
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getGameInfoMessage,
    getInteractionValue,
    getUserTag,
    getUserVoiceChannel,
    sendErrorMessage,
    sendInfoMessage,
    tryCreateInteractionSuccessAcknowledgement,
    voicePermissionsCheck,
} from "../../helpers/discord_utils";
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
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type TeamScoreboard from "../../structures/team_scoreboard";

const logger = new IPCLogger("play");

/**
 * Sends the beginning of game session message
 * @param textChannelName - The name of the text channel to send the message to
 * @param voiceChannelName - The name of the voice channel to join
 * @param messageContext - The original message that triggered the command
 * @param participantIDs - The list of participants
 * @param guildPreference - The guild's game preferences
 * @param interaction - The interaction that started the game
 */
export async function sendBeginGameSessionMessage(
    textChannelName: string,
    voiceChannelName: string,
    messageContext: MessageContext,
    participantIDs: Array<string>,
    guildPreference: GuildPreference,
    interaction?: Eris.CommandInteraction
): Promise<void> {
    const guildID = messageContext.guildID;
    let gameInstructions = i18n.translate(guildID, "command.play.typeGuess");

    const bonusUsers = await activeBonusUsers();
    const bonusUserParticipantIDs = participantIDs.filter((x) =>
        bonusUsers.has(x)
    );

    const isBonus = bonusUserParticipantIDs.length > 0;

    if (isBonus) {
        let bonusUserMentions = bonusUserParticipantIDs.map((x) =>
            getMention(x)
        );

        if (bonusUserMentions.length > 10) {
            bonusUserMentions = bonusUserMentions.slice(0, 10);
            bonusUserMentions.push(
                i18n.translate(guildID, "misc.andManyOthers")
            );
        }

        gameInstructions += `\n\n${bonusUserMentions.join(", ")} `;
        gameInstructions += i18n.translate(
            guildID,
            "command.play.exp.doubleExpForVoting",
            {
                link: "https://top.gg/bot/508759831755096074/vote",
            }
        );

        gameInstructions += " ";
        gameInstructions += i18n.translate(
            guildID,
            "command.play.exp.howToVote",
            { vote: "`/vote`" }
        );
    }

    if (isWeekend()) {
        gameInstructions += `\n\n**⬆️ ${i18n.translate(
            guildID,
            "command.play.exp.weekend"
        )} ⬆️**`;
    } else if (isPowerHour()) {
        gameInstructions += `\n\n**⬆️ ${i18n.translate(
            guildID,
            "command.play.exp.powerHour"
        )} ⬆️**`;
    }

    const startTitle = i18n.translate(guildID, "command.play.gameStarting", {
        textChannelName,
        voiceChannelName,
    });

    const gameInfoMessage = await getGameInfoMessage(messageContext.guildID);

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
        color: isBonus ? EMBED_SUCCESS_BONUS_COLOR : null,
        thumbnailUrl: KmqImages.HAPPY,
        fields,
        footerText: `KMQ ${State.version}`,
    };

    const optionsEmbedPayload = await generateOptionsMessage(
        Session.getSession(guildID),
        messageContext,
        guildPreference,
        null
    );

    if (!isBonus && Math.random() < 0.5) {
        optionsEmbedPayload.footerText = i18n.translate(
            messageContext.guildID,
            "command.play.voteReminder",
            {
                vote: "/vote",
            }
        );
    }

    await sendInfoMessage(
        messageContext,
        startGamePayload,
        false,
        undefined,
        [optionsEmbedPayload],
        interaction
    );
}

export default class PlayCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.notRestartingPrecheck },
        { checkFn: CommandPrechecks.maintenancePrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [],
    };

    aliases = ["random", "start", "p"];

    help = (guildID: string): HelpDocumentation => ({
        name: "play",
        description: i18n.translate(guildID, "command.play.help.description"),
        usage: `/play classic\n\n,play elimination\nlives:{${i18n.translate(
            guildID,
            "command.play.help.usage.lives"
        )}}\n\n/play teams create\n\n/play teams join`,
        priority: 1050,
        examples: [
            {
                example: "`/play classic`",
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.classic"
                ),
            },
            {
                example: "`/play elimination lives:5`",
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.elimination",
                    {
                        lives: "`5`",
                    }
                ),
            },
            {
                example: "`/play elimination`",
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.elimination",
                    {
                        lives: `\`${ELIMINATION_DEFAULT_LIVES}\``,
                    }
                ),
            },
            {
                example: "`/play teams create`",
                explanation: i18n.translate(
                    guildID,
                    "command.play.help.example.teams"
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
                        "command.play.help.example.classic"
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "command.play.help.example.classic"
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
                {
                    name: GameType.ELIMINATION,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.play.help.example.elimination",
                        {
                            lives: `${ELIMINATION_DEFAULT_LIVES}`,
                        }
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "command.play.help.example.elimination",
                            {
                                lives: `${ELIMINATION_DEFAULT_LIVES}`,
                            }
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "lives",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.help.interaction.lives"
                            ),
                            description_localizations: {
                                [LocaleType.KO]: i18n.translate(
                                    LocaleType.KO,
                                    "command.play.help.interaction.lives"
                                ),
                            },
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                            min_value: ELIMINATION_MIN_LIVES as any,
                            max_value: ELIMINATION_MAX_LIVES as any,
                        },
                    ],
                },
                {
                    name: GameType.TEAMS,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.play.help.example.teams"
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "command.play.help.example.teams"
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND_GROUP,
                    options: [
                        {
                            name: "create",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.interaction.teams_create"
                            ),
                            description_localizations: {
                                [LocaleType.KO]: i18n.translate(
                                    LocaleType.KO,
                                    "command.play.interaction.teams_create"
                                ),
                            },
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                        },
                        {
                            name: "begin",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.interaction.teams_begin"
                            ),
                            description_localizations: {
                                [LocaleType.KO]: i18n.translate(
                                    LocaleType.KO,
                                    "command.play.interaction.teams_begin"
                                ),
                            },
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                        },
                        {
                            name: "join",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.play.interaction.teams_join"
                            ),
                            description_localizations: {
                                [LocaleType.KO]: i18n.translate(
                                    LocaleType.KO,
                                    "command.play.interaction.teams_join"
                                ),
                            },
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "team_name",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.play.interaction.teams_join_team_name"
                                    ),
                                    description_localizations: {
                                        [LocaleType.KO]: i18n.translate(
                                            LocaleType.KO,
                                            "command.play.interaction.teams_join_team_name"
                                        ),
                                    },
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.STRING,
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ];

    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const { interactionKey, interactionOptions } =
            getInteractionValue(interaction);

        const gameType = interactionKey.split(".")[0] as GameType;
        if (interactionKey === "teams.begin") {
            await PlayCommand.beginTeamsGame(messageContext, interaction);
        } else if (interactionKey.startsWith("teams.join")) {
            await PlayCommand.joinTeamsGame(
                messageContext,
                interactionOptions["team_name"],
                interaction
            );
        } else {
            await PlayCommand.startGame(
                messageContext,
                gameType,
                interactionOptions["lives"],
                interaction
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

        await PlayCommand.startGame(
            MessageContext.fromMessage(message),
            gameType,
            parsedMessage.components.length <= 1
                ? null
                : parsedMessage.components[1]
        );
    };

    static canStartTeamsGame(
        gameSession: GameSession,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): boolean {
        if (!gameSession || gameSession.gameType !== GameType.TEAMS) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.game.noneInProgress.title"
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.game.noneInProgress.description"
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                interaction
            );
            return false;
        }

        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        if (teamScoreboard.getNumTeams() === 0) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.begin.ignored.title"
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.begin.ignored.noTeam.description",
                        { join: "/play teams join" }
                    ),
                },
                interaction
            );
            return false;
        }

        return true;
    }

    static async beginTeamsGame(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const gameSession = Session.getSession(
            messageContext.guildID
        ) as GameSession;

        if (
            !PlayCommand.canStartTeamsGame(
                gameSession,
                messageContext,
                interaction
            )
        ) {
            return;
        }

        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (!gameSession.sessionInitialized) {
            const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
            const participantIDs = teamScoreboard
                .getPlayers()
                .map((player) => player.id);

            const channel = State.client.getChannel(
                messageContext.textChannelID
            ) as Eris.TextChannel;

            sendBeginGameSessionMessage(
                channel.name,
                getUserVoiceChannel(messageContext).name,
                messageContext,
                participantIDs,
                guildPreference
            );

            gameSession.startRound(messageContext);

            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Teams game session starting`
            );
        }
    }

    static async joinTeamsGame(
        messageContext: MessageContext,
        teamName: string,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const gameSession = Session.getSession(
            messageContext.guildID
        ) as GameSession;

        if (!gameSession || gameSession.gameType !== GameType.TEAMS) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.game.noneInProgress.title"
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.game.noneInProgress.description"
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                interaction
            );
            return;
        }

        // Don't allow emojis that aren't in this server
        // Emojis are of the format: <(a if animated):(alphanumeric):(number)>
        const emojis = teamName.match(/<a?:[a-zA-Z0-9]+:[0-9]+>/gm) || [];
        for (const emoji of emojis) {
            const emojiID = emoji
                .match(/(?<=<a?:[a-zA-Z0-9]+:)[0-9]+(?=>)/gm)
                .join("");

            if (
                !State.client.guilds
                    .get(messageContext.guildID)
                    .emojis.map((e) => e.id)
                    .includes(emojiID)
            ) {
                sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.join.failure.joinError.invalidTeamName.title"
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.join.failure.joinError.badEmojis.description"
                        ),
                    },
                    interaction
                );

                logger.warn(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Team name contains unsupported characters.`
                );
                return;
            }
        }

        if (teamName.length === 0) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Team name contains unsupported characters.`
            );

            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.join.failure.joinError.title"
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.join.failure.joinError.invalidCharacters.description"
                    ),
                },
                interaction
            );
            return;
        }

        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        if (!teamScoreboard.hasTeam(teamName)) {
            teamScoreboard.addTeam(
                teamName,
                Player.fromUserID(
                    messageContext.author.id,
                    messageContext.guildID,
                    0,
                    await isFirstGameOfDay(messageContext.author.id),
                    await isUserPremium(messageContext.author.id)
                )
            );
            const teamNameWithCleanEmojis = teamName.replace(
                /(<a?)(:[a-zA-Z0-9]+:)([0-9]+>)/gm,
                (_p1, _p2, p3) => p3
            );

            sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.join.team.new"
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.join.team.join",
                        {
                            teamName: bold(teamName),
                            mentionedUser: getMention(messageContext.author.id),
                            joinCommand: "/play teams join",
                            teamNameWithCleanEmojis,
                            startGameInstructions:
                                !gameSession.sessionInitialized
                                    ? i18n.translate(
                                          messageContext.guildID,
                                          "command.join.team.startGameInstructions",
                                          {
                                              beginCommand:
                                                  "`/play teams begin`",
                                          }
                                      )
                                    : "",
                        }
                    ),
                    thumbnailUrl: KmqImages.READING_BOOK,
                },
                false,
                null,
                [],
                interaction
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Team '${teamName}' created.`
            );
        } else {
            const team = teamScoreboard.getTeam(teamName);
            if (team.hasPlayer(messageContext.author.id)) {
                sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.join.failure.joinError.title"
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.join.failure.joinError.alreadyInTeam.description"
                        ),
                    },
                    interaction
                );

                logger.info(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Already joined team '${teamName}'.`
                );
                return;
            }

            teamScoreboard.addTeamPlayer(
                team.id,
                Player.fromUserID(
                    messageContext.author.id,
                    messageContext.guildID,
                    0,
                    await isFirstGameOfDay(messageContext.author.id),
                    await isUserPremium(messageContext.author.id)
                )
            );

            sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.join.playerJoinedTeam.title",
                        {
                            joiningUser: getUserTag(
                                messageContext.author.id,
                                messageContext.guildID
                            ),
                            teamName: team.getName(),
                        }
                    ),
                    description: !gameSession.sessionInitialized
                        ? i18n.translate(
                              messageContext.guildID,
                              "command.join.playerJoinedTeam.beforeGameStart.description",
                              {
                                  beginCommand: "`/play teams begin`",
                              }
                          )
                        : i18n.translate(
                              messageContext.guildID,
                              "command.join.playerJoinedTeam.afterGameStart.description",
                              {
                                  mentionedUser: getMention(
                                      messageContext.author.id
                                  ),
                                  teamName: bold(team.getName()),
                              }
                          ),
                    thumbnailUrl: KmqImages.LISTENING,
                },
                false,
                null,
                [],
                interaction
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Successfully joined team '${team.getName()}'.`
            );
        }
    }

    static async startGame(
        messageContext: MessageContext,
        gameType: GameType,
        livesArg: string,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildID = messageContext.guildID;
        const guildPreference = await GuildPreference.getGuildPreference(
            guildID
        );

        const voiceChannel = getUserVoiceChannel(messageContext);

        if (!voiceChannel) {
            const title = i18n.translate(guildID, "misc.failure.notInVC.title");

            const description = i18n.translate(
                guildID,
                "misc.failure.notInVC.description",
                { command: "`/play`" }
            );

            await sendErrorMessage(
                messageContext,
                { title, description },
                interaction
            );

            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | User not in voice channel`
            );
            return;
        }

        if (!voicePermissionsCheck(messageContext, interaction)) {
            return;
        }

        const gameSessions = State.gameSessions;

        // check for invalid premium game options
        const premiumRequest = await isPremiumRequest(
            gameSessions[guildID],
            messageContext.author.id
        );

        if (!premiumRequest) {
            for (const [commandName, command] of Object.entries(
                State.client.commands
            )) {
                if (command.isUsingPremiumOption) {
                    if (command.isUsingPremiumOption(guildPreference)) {
                        logger.info(
                            `Session started by non-premium request, clearing premium option: ${commandName}`
                        );
                        // eslint-disable-next-line no-await-in-loop
                        await command.resetPremium(guildPreference);
                    }
                }
            }
        }

        if (gameSessions[guildID]) {
            if (gameSessions[guildID]?.sessionInitialized) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Attempted to start a game while one is already in progress.`
                );

                const title = i18n.translate(
                    guildID,
                    "command.play.failure.alreadyInSession"
                );

                await sendErrorMessage(messageContext, { title }, interaction);
                return;
            }

            if (
                !gameSessions[guildID].sessionInitialized &&
                gameType === GameType.TEAMS
            ) {
                // User sent ,play teams twice, reset the GameSession
                Session.deleteSession(guildID);
                logger.info(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Teams game session was in progress, has been reset.`
                );
            }
        }

        // (1) No game session exists yet (create ELIMINATION, TEAMS, CLASSIC, or COMPETITION game), or
        // (2) User attempting to ,play after a ,play teams that didn't start, start CLASSIC game
        const textChannel = await fetchChannel(messageContext.textChannelID);
        const gameOwner = new KmqMember(messageContext.author.id);
        let gameSession: GameSession;
        const isPremium = await areUsersPremium(
            getCurrentVoiceMembers(voiceChannel.id).map((x) => x.id)
        );

        if (gameType === GameType.TEAMS) {
            // (1) TEAMS game creation
            const startTitle = i18n.translate(
                guildID,
                "command.play.team.joinTeam.title",
                {
                    join: "`/play teams join`",
                }
            );

            const gameInstructions = i18n.translate(
                guildID,
                "command.play.team.joinTeam.description",
                { join: "/play teams join" }
            );

            gameSession = new GameSession(
                guildPreference,
                textChannel.id,
                voiceChannel.id,
                textChannel.guild.id,
                gameOwner,
                gameType,
                isPremium
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Team game session created.`
            );

            if (interaction) {
                await tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    startTitle,
                    gameInstructions
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
            if (gameSessions[guildID]) {
                // (2) Let the user know they're starting a non-teams game
                const oldGameType = gameSessions[guildID].gameType;
                const ignoringOldGameTypeTitle = i18n.translate(
                    guildID,
                    "command.play.failure.overrideTeams.title",
                    { playOldGameType: `\`/play ${oldGameType}\`` }
                );

                const gameSpecificInstructions = i18n.translate(
                    guildID,
                    "command.play.failure.overrideTeams.teams.join",
                    {
                        join: "/play teams join",
                    }
                );

                const oldGameTypeInstructions = i18n.translate(
                    guildID,
                    "command.play.failure.overrideTeams.description",
                    {
                        oldGameType: `\`${oldGameType}\``,
                        end: "`/end`",
                        playOldGameType: `\`/play ${oldGameType}\``,
                        gameSpecificInstructions,
                        begin: "`/begin`",
                    }
                );

                logger.warn(
                    `${getDebugLogHeader(
                        messageContext
                    )} | User attempted ,play on a mode that requires player joins.`
                );

                await sendErrorMessage(
                    messageContext,
                    {
                        title: ignoringOldGameTypeTitle,
                        description: oldGameTypeInstructions,
                        thumbnailUrl: KmqImages.DEAD,
                    },
                    interaction
                );
            }

            if (gameType === GameType.COMPETITION) {
                const isModerator = await dbContext
                    .kmq("competition_moderators")
                    .select("user_id")
                    .where("guild_id", "=", guildID)
                    .andWhere("user_id", "=", messageContext.author.id)
                    .first();

                if (!isModerator) {
                    sendErrorMessage(messageContext, {
                        title: i18n.translate(
                            guildID,
                            "command.play.failure.hiddenGameMode.title"
                        ),
                        description: i18n.translate(
                            guildID,
                            "command.play.failure.hiddenGameMode.description"
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

            gameSession = new GameSession(
                guildPreference,
                textChannel.id,
                voiceChannel.id,
                textChannel.guild.id,
                gameOwner,
                gameType,
                isPremium,
                lives
            );
        }

        // prevent any duplicate game sessions
        if (gameSessions[guildID]) {
            await gameSessions[guildID].endSession("Duplicate game session");
        }

        State.gameSessions[guildID] = gameSession;

        if (gameType !== GameType.TEAMS) {
            await sendBeginGameSessionMessage(
                textChannel.name,
                voiceChannel.name,
                messageContext,
                getCurrentVoiceMembers(voiceChannel.id).map((x) => x.id),
                guildPreference,
                interaction
            );

            await gameSession.startRound(messageContext);
        }
    }
}
