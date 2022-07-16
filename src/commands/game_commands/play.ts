import {
    ELIMINATION_DEFAULT_LIVES,
    ELIMINATION_MAX_LIVES,
    ELIMINATION_MIN_LIVES,
    EMBED_SUCCESS_BONUS_COLOR,
    KmqImages,
    PlaySlashCommands,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    activeBonusUsers,
    areUsersPremium,
    isPowerHour,
    isPremiumRequest,
} from "../../helpers/game_utils";
import {
    fetchChannel,
    generateEmbed,
    generateOptionsMessage,
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getGameInfoMessage,
    getUserVoiceChannel,
    sendErrorMessage,
    sendInfoMessage,
    tryCreateInteractionCustomPayloadAcknowledgement,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
    voicePermissionsCheck,
} from "../../helpers/discord_utils";
import { getMention, isWeekend } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameSession from "../../structures/game_session";
import GameType from "../../enums/game_type";
import GuildPreference from "../../structures/guild_preference";
import KmqMember from "../../structures/kmq_member";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import dbContext from "../../database_context";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

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
    let gameInstructions = LocalizationManager.localizer.translate(
        guildID,
        "command.play.typeGuess"
    );

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
                LocalizationManager.localizer.translate(
                    guildID,
                    "misc.andManyOthers"
                )
            );
        }

        gameInstructions += `\n\n${bonusUserMentions.join(", ")} `;
        gameInstructions += LocalizationManager.localizer.translate(
            guildID,
            "command.play.exp.doubleExpForVoting",
            {
                link: "https://top.gg/bot/508759831755096074/vote",
            }
        );

        gameInstructions += " ";
        gameInstructions += LocalizationManager.localizer.translate(
            guildID,
            "command.play.exp.howToVote",
            { vote: `\`${process.env.BOT_PREFIX}vote\`` }
        );
    }

    if (isWeekend()) {
        gameInstructions += `\n\n**⬆️ ${LocalizationManager.localizer.translate(
            guildID,
            "command.play.exp.weekend"
        )} ⬆️**`;
    } else if (isPowerHour()) {
        gameInstructions += `\n\n**⬆️ ${LocalizationManager.localizer.translate(
            guildID,
            "command.play.exp.powerHour"
        )} ⬆️**`;
    }

    const startTitle = LocalizationManager.localizer.translate(
        guildID,
        "command.play.gameStarting",
        {
            textChannelName,
            voiceChannelName,
        }
    );

    const gameInfoMessage = await getGameInfoMessage(messageContext.guildID);

    const fields: Eris.EmbedField[] = [];
    if (gameInfoMessage) {
        fields.push({
            name: LocalizationManager.localizer.translate(
                guildID,
                gameInfoMessage.title
            ),
            value: gameInfoMessage.message,
            inline: false,
        });
    }

    const optionsEmbedPayload = await generateOptionsMessage(
        Session.getSession(guildID),
        messageContext,
        guildPreference,
        null
    );

    if (!isBonus && Math.random() < 0.5) {
        optionsEmbedPayload.footerText =
            LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.play.voteReminder",
                {
                    vote: `${process.env.BOT_PREFIX}vote`,
                }
            );
    }

    const color = isBonus ? EMBED_SUCCESS_BONUS_COLOR : null;
    if (interaction) {
        await tryCreateInteractionCustomPayloadAcknowledgement(
            messageContext,
            interaction,
            [
                {
                    title: startTitle,
                    description: gameInstructions,
                    color,
                    thumbnailUrl: KmqImages.HAPPY,
                    fields,
                    footerText: State.version,
                },
                optionsEmbedPayload,
            ]
        );
    } else {
        await sendInfoMessage(
            messageContext,
            {
                title: startTitle,
                description: gameInstructions,
                color,
                thumbnailUrl: KmqImages.HAPPY,
                fields,
                footerText: State.version,
            },
            false,
            undefined,
            [generateEmbed(messageContext, optionsEmbedPayload)]
        );
    }
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
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.play.help.description"
        ),
        usage: `,play {classic | elimination | teams}\n,play elimination {${LocalizationManager.localizer.translate(
            guildID,
            "command.play.help.usage.lives"
        )}}`,
        priority: 1050,
        examples: [
            {
                example: "`,play`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.play.help.example.classic"
                ),
            },
            {
                example: "`,play elimination 5`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.play.help.example.elimination",
                    {
                        lives: "`5`",
                    }
                ),
            },
            {
                example: "`,play elimination`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.play.help.example.elimination",
                    {
                        lives: `\`${ELIMINATION_DEFAULT_LIVES}\``,
                    }
                ),
            },
            {
                example: "`,play teams`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.play.help.example.teams"
                ),
            },
        ],
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: PlaySlashCommands[GameType.CLASSIC],
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.play.help.example.classic"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
        {
            name: PlaySlashCommands[GameType.TEAMS],
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.play.help.example.teams"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
        {
            name: PlaySlashCommands[GameType.ELIMINATION],
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.play.help.example.elimination"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "lives",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.play.help.interaction.lives",
                        {
                            lives: `\`${ELIMINATION_DEFAULT_LIVES}\``,
                        }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.INTEGER,
                },
            ],
        },
    ];

    static async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const SLASH_COMMAND_TO_GAME_TYPE = {
            [PlaySlashCommands[GameType.CLASSIC]]: GameType.CLASSIC,
            [PlaySlashCommands[GameType.ELIMINATION]]: GameType.ELIMINATION,
            [PlaySlashCommands[GameType.TEAMS]]: GameType.TEAMS,
        };

        const gameType = SLASH_COMMAND_TO_GAME_TYPE[interaction.data.name];
        let lives: number;
        if (gameType === GameType.ELIMINATION) {
            if (!interaction.data.options) {
                lives = ELIMINATION_DEFAULT_LIVES;
            } else {
                lives = interaction.data.options[0]["value"] as number;
                if (
                    lives < ELIMINATION_MIN_LIVES ||
                    lives > ELIMINATION_MAX_LIVES
                ) {
                    lives = ELIMINATION_DEFAULT_LIVES;
                }
            }
        }

        await PlayCommand.startGame(
            messageContext,
            gameType,
            lives,
            interaction
        );
    }

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const gameType =
            (parsedMessage.components[0]?.toLowerCase() as GameType) ??
            GameType.CLASSIC;

        let lives: number;
        if (gameType === GameType.ELIMINATION) {
            lives =
                parsedMessage.components.length > 1 &&
                Number.isInteger(parseInt(parsedMessage.components[1], 10)) &&
                parseInt(parsedMessage.components[1], 10) >=
                    ELIMINATION_MIN_LIVES &&
                parseInt(parsedMessage.components[1], 10) <=
                    ELIMINATION_MAX_LIVES
                    ? parseInt(parsedMessage.components[1], 10)
                    : ELIMINATION_DEFAULT_LIVES;
        }

        await PlayCommand.startGame(
            MessageContext.fromMessage(message),
            gameType,
            lives
        );
    };

    static async startGame(
        messageContext: MessageContext,
        gameType: GameType,
        lives: number,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildID = messageContext.guildID;
        const guildPreference = await GuildPreference.getGuildPreference(
            guildID
        );

        const voiceChannel = getUserVoiceChannel(messageContext);

        if (!voiceChannel) {
            const title = LocalizationManager.localizer.translate(
                guildID,
                "misc.failure.notInVC.title"
            );

            const description = LocalizationManager.localizer.translate(
                guildID,
                "misc.failure.notInVC.description",
                { command: `\`${process.env.BOT_PREFIX}play\`` }
            );

            if (interaction) {
                tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    title,
                    description
                );
            } else {
                sendErrorMessage(messageContext, { title, description });
            }

            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | User not in voice channel`
            );
            return;
        }

        if (!voicePermissionsCheck(messageContext)) {
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

                const title = LocalizationManager.localizer.translate(
                    guildID,
                    "command.play.failure.alreadyInSession"
                );

                if (interaction) {
                    await tryCreateInteractionErrorAcknowledgement(
                        interaction,
                        title,
                        null
                    );
                } else {
                    await sendErrorMessage(messageContext, {
                        title,
                    });
                }

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

        const prefix = process.env.BOT_PREFIX;

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
            const startTitle = LocalizationManager.localizer.translate(
                guildID,
                "command.play.team.joinTeam.title",
                {
                    join: `\`${prefix}join\``,
                }
            );

            const gameInstructions = LocalizationManager.localizer.translate(
                guildID,
                "command.play.team.joinTeam.description",
                { join: `${prefix}join` }
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
                const ignoringOldGameTypeTitle =
                    LocalizationManager.localizer.translate(
                        guildID,
                        "command.play.failure.overrideTeams.title",
                        { playOldGameType: `\`${prefix}play ${oldGameType}\`` }
                    );

                const gameSpecificInstructions =
                    LocalizationManager.localizer.translate(
                        guildID,
                        "command.play.failure.overrideTeams.teams.join",
                        {
                            join: `${prefix}join`,
                        }
                    );

                const oldGameTypeInstructions =
                    LocalizationManager.localizer.translate(
                        guildID,
                        "command.play.failure.overrideTeams.description",
                        {
                            oldGameType: `\`${oldGameType}\``,
                            end: `\`${prefix}end\``,
                            playOldGameType: `\`${prefix}play ${oldGameType}\``,
                            gameSpecificInstructions,
                            begin: `\`${prefix}begin\``,
                        }
                    );

                logger.warn(
                    `${getDebugLogHeader(
                        messageContext
                    )} | User attempted ,play on a mode that requires player joins.`
                );

                if (interaction) {
                    await tryCreateInteractionErrorAcknowledgement(
                        interaction,
                        ignoringOldGameTypeTitle,
                        oldGameTypeInstructions
                    );
                } else {
                    sendErrorMessage(messageContext, {
                        title: ignoringOldGameTypeTitle,
                        description: oldGameTypeInstructions,
                        thumbnailUrl: KmqImages.DEAD,
                    });
                }
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
                        title: LocalizationManager.localizer.translate(
                            guildID,
                            "command.play.failure.hiddenGameMode.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            guildID,
                            "command.play.failure.hiddenGameMode.description"
                        ),
                        thumbnailUrl: KmqImages.DEAD,
                    });
                    return;
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
            await gameSessions[guildID].endSession();
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
