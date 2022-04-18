import Eris from "eris";
import GameSession from "../../structures/game_session";
import Session from "../../structures/session";
import {
    sendErrorMessage,
    getDebugLogHeader,
    sendInfoMessage,
    voicePermissionsCheck,
    getUserVoiceChannel,
    getCurrentVoiceMembers,
    EMBED_SUCCESS_BONUS_COLOR,
    getMention,
    generateOptionsMessage,
    generateEmbed,
} from "../../helpers/discord_utils";
import { getTimeUntilRestart } from "../../helpers/management_utils";
import {
    activeBonusUsers,
    getGuildPreference,
    isPowerHour,
    isPremiumRequest,
} from "../../helpers/game_utils";
import { chooseWeightedRandom, isWeekend } from "../../helpers/utils";
import BaseCommand from "../interfaces/base_command";
import dbContext from "../../database_context";
import { IPCLogger } from "../../logger";
import { GameType } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";
import { DEFAULT_LIVES } from "../../structures/elimination_scoreboard";
import GuildPreference from "../../structures/guild_preference";
import GameInfoMessage from "../../interfaces/game_info_message";
import CommandArgs from "../../interfaces/command_args";
import HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("play");

/**
 * Sends the beginning of game session message
 * @param textChannelName - The name of the text channel to send the message to
 * @param voiceChannelName - The name of the voice channel to join
 * @param messageContext - The original message that triggered the command
 * @param participants - The list of participants
 * @param guildPreference - The guild's game preferences
 */
export async function sendBeginGameSessionMessage(
    textChannelName: string,
    voiceChannelName: string,
    messageContext: MessageContext,
    participants: Array<{
        id: string;
        username: string;
        discriminator: string;
    }>,
    guildPreference: GuildPreference
): Promise<void> {
    const guildID = messageContext.guildID;
    let gameInstructions = state.localizer.translate(
        guildID,
        "command.play.typeGuess"
    );

    const bonusUsers = await activeBonusUsers();
    const bonusUserParticipants = participants.filter((x) =>
        bonusUsers.has(x.id)
    );

    const isBonus = bonusUserParticipants.length > 0;

    if (isBonus) {
        let bonusUserTags = bonusUserParticipants.map((x) => getMention(x.id));

        if (bonusUserTags.length > 10) {
            bonusUserTags = bonusUserTags.slice(0, 10);
            bonusUserTags.push(
                state.localizer.translate(guildID, "misc.andManyOthers")
            );
        }

        gameInstructions += `\n\n${bonusUserTags.join(", ")}`;
        gameInstructions += state.localizer.translate(
            guildID,
            "command.play.exp.doubleExpForVoting",
            {
                link: "https://top.gg/bot/508759831755096074/vote",
            }
        );

        gameInstructions += " ";
        gameInstructions += state.localizer.translate(
            guildID,
            "command.play.exp.howToVote",
            { vote: `\`${process.env.BOT_PREFIX}vote\`` }
        );
    }

    if (isWeekend()) {
        gameInstructions += `\n\n**⬆️ ${state.localizer.translate(
            guildID,
            "command.play.exp.weekend"
        )} ⬆️**`;
    } else if (isPowerHour()) {
        gameInstructions += `\n\n**⬆️ ${state.localizer.translate(
            guildID,
            "command.play.exp.powerHour"
        )} ⬆️**`;
    }

    const startTitle = state.localizer.translate(
        guildID,
        "command.play.gameStarting",
        {
            textChannelName,
            voiceChannelName,
        }
    );

    const gameInfoMessage: GameInfoMessage = chooseWeightedRandom(
        await dbContext.kmq("game_messages")
    );

    const fields: Eris.EmbedField[] = [];
    if (gameInfoMessage) {
        fields.push({
            name: state.localizer.translate(guildID, gameInfoMessage.title),
            value: state.localizer.translate(guildID, gameInfoMessage.message),
            inline: false,
        });
    }

    const optionsEmbedPayload = await generateOptionsMessage(
        messageContext,
        guildPreference,
        null
    );

    if (!isBonus && Math.random() < 0.5) {
        optionsEmbedPayload.footerText = state.localizer.translate(
            messageContext.guildID,
            "command.play.voteReminder",
            {
                vote: `${process.env.BOT_PREFIX}vote`,
            }
        );
    }

    await sendInfoMessage(
        messageContext,
        {
            title: startTitle,
            description: gameInstructions,
            color: isBonus ? EMBED_SUCCESS_BONUS_COLOR : null,
            thumbnailUrl: KmqImages.HAPPY,
            fields,
        },
        false,
        true,
        undefined,
        [generateEmbed(messageContext, optionsEmbedPayload)]
    );
}

export default class PlayCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
        { checkFn: CommandPrechecks.notRestartingPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [],
    };

    aliases = ["random", "start", "p"];

    help = (guildID: string): HelpDocumentation => ({
        name: "play",
        description: state.localizer.translate(
            guildID,
            "command.play.help.description"
        ),
        usage: `,play {classic | elimination | teams}\n,play elimination {${state.localizer.translate(
            guildID,
            "command.play.help.usage.lives"
        )}}`,
        priority: 1050,
        examples: [
            {
                example: "`,play`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.play.help.example.classic"
                ),
            },
            {
                example: "`,play elimination 5`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.play.help.example.elimination",
                    {
                        lives: "`5`",
                    }
                ),
            },
            {
                example: "`,play elimination`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.play.help.example.elimination",
                    {
                        lives: `\`${DEFAULT_LIVES}\``,
                    }
                ),
            },
            {
                example: "`,play teams`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.play.help.example.teams"
                ),
            },
        ],
    });

    call = async ({
        message,
        parsedMessage,
        channel,
    }: CommandArgs): Promise<void> => {
        const messageContext = MessageContext.fromMessage(message);
        const guildID = message.guildID;
        const guildPreference = await getGuildPreference(guildID);
        const voiceChannel = getUserVoiceChannel(messageContext);
        const gameSessions = state.gameSessions;

        const timeUntilRestart = await getTimeUntilRestart();
        if (timeUntilRestart) {
            await sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    guildID,
                    "command.play.failure.botRestarting.title"
                ),
                description: state.localizer.translate(
                    guildID,
                    "command.play.failure.botRestarting.description",
                    { timeUntilRestart: `\`${timeUntilRestart}\`` }
                ),
            });

            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Attempted to start game session before restart.`
            );
            return;
        }

        if (!voiceChannel) {
            await sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    guildID,
                    "misc.failure.notInVC.title"
                ),
                description: state.localizer.translate(
                    guildID,
                    "misc.failure.notInVC.description",
                    { command: `\`${process.env.BOT_PREFIX}play\`` }
                ),
            });

            logger.warn(
                `${getDebugLogHeader(message)} | User not in voice channel`
            );
            return;
        }

        if (!voicePermissionsCheck(message)) {
            return;
        }

        // check for invalid premium game options
        const premiumRequest = await isPremiumRequest(
            guildPreference.guildID,
            message.author.id
        );

        if (!premiumRequest) {
            for (const [commandName, command] of Object.entries(
                state.client.commands
            )) {
                if (command.isUsingPremiumOption) {
                    if (command.isUsingPremiumOption(guildPreference)) {
                        logger.info(
                            `Session started by non-premium request, clearing premium option: ${commandName}`
                        );
                        await command.resetPremium(guildPreference);
                    }
                }
            }
        }

        const gameType =
            (parsedMessage.components[0]?.toLowerCase() as GameType) ??
            GameType.CLASSIC;

        if (
            gameSessions[message.guildID] &&
            !gameSessions[message.guildID].sessionInitialized &&
            gameType === GameType.TEAMS
        ) {
            // User sent ,play teams twice, reset the GameSession
            Session.deleteSession(guildID);
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Teams game session was in progress, has been reset.`
            );
        }

        const prefix = process.env.BOT_PREFIX;

        if (
            !gameSessions[message.guildID] ||
            !gameSessions[message.guildID].sessionInitialized
        ) {
            // (1) No game session exists yet (create ELIMINATION, TEAMS, CLASSIC, or COMPETITION game), or
            // (2) User attempting to ,play after a ,play teams that didn't start, start CLASSIC game
            const textChannel = channel;
            const gameOwner = KmqMember.fromUser(message.author);
            let gameSession: GameSession;

            if (gameType === GameType.TEAMS) {
                // (1) TEAMS game creation
                const startTitle = state.localizer.translate(
                    guildID,
                    "command.play.team.joinTeam.title",
                    {
                        join: `\`${prefix}join\``,
                    }
                );

                const gameInstructions = state.localizer.translate(
                    guildID,
                    "command.play.team.joinTeam.description",
                    { join: `${prefix}join` }
                );

                gameSession = new GameSession(
                    textChannel.id,
                    voiceChannel.id,
                    textChannel.guild.id,
                    gameOwner,
                    gameType
                );

                logger.info(
                    `${getDebugLogHeader(message)} | Team game session created.`
                );

                await sendInfoMessage(messageContext, {
                    title: startTitle,
                    description: gameInstructions,
                    thumbnailUrl: KmqImages.HAPPY,
                });
            } else {
                // (1 and 2) CLASSIC, ELIMINATION, and COMPETITION game creation
                if (gameSessions[message.guildID]) {
                    // (2) Let the user know they're starting a non-teams game
                    const oldGameType = gameSessions[message.guildID].gameType;
                    const ignoringOldGameTypeTitle = state.localizer.translate(
                        guildID,
                        "command.play.failure.overrideTeamsOrElimination.title",
                        { playOldGameType: `\`${prefix}play ${oldGameType}\`` }
                    );

                    const gameSpecificInstructions =
                        oldGameType === GameType.ELIMINATION
                            ? state.localizer.translate(
                                  guildID,
                                  "command.play.failure.overrideTeamsOrElimination.elimination.join",
                                  {
                                      join: `\`${prefix}join\``,
                                  }
                              )
                            : state.localizer.translate(
                                  guildID,
                                  "command.play.failure.overrideTeamsOrElimination.teams.join",
                                  {
                                      join: `${prefix}join`,
                                  }
                              );

                    const oldGameTypeInstructions = state.localizer.translate(
                        guildID,
                        "command.play.failure.overrideTeamsOrElimination.description",
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
                            message
                        )} | User attempted ,play on a mode that requires player joins.`
                    );

                    sendErrorMessage(messageContext, {
                        title: ignoringOldGameTypeTitle,
                        description: oldGameTypeInstructions,
                        thumbnailUrl: KmqImages.DEAD,
                    });
                }

                if (gameType === GameType.COMPETITION) {
                    const isModerator = await dbContext
                        .kmq("competition_moderators")
                        .select("user_id")
                        .where("guild_id", "=", guildID)
                        .andWhere("user_id", "=", message.author.id)
                        .first();

                    if (!isModerator) {
                        sendErrorMessage(messageContext, {
                            title: state.localizer.translate(
                                guildID,
                                "command.play.failure.hiddenGameMode.title"
                            ),
                            description: state.localizer.translate(
                                guildID,
                                "command.play.failure.hiddenGameMode.description"
                            ),
                            thumbnailUrl: KmqImages.DEAD,
                        });
                        return;
                    }
                }

                let lives: number;
                if (gameType === GameType.ELIMINATION) {
                    lives =
                        parsedMessage.components.length > 1 &&
                        Number.isInteger(
                            parseInt(parsedMessage.components[1])
                        ) &&
                        parseInt(parsedMessage.components[1]) > 0 &&
                        parseInt(parsedMessage.components[1]) <= 10000
                            ? parseInt(parsedMessage.components[1])
                            : DEFAULT_LIVES;
                }

                gameSession = new GameSession(
                    textChannel.id,
                    voiceChannel.id,
                    textChannel.guild.id,
                    gameOwner,
                    gameType,
                    lives
                );

                await sendBeginGameSessionMessage(
                    textChannel.name,
                    voiceChannel.name,
                    messageContext,
                    getCurrentVoiceMembers(voiceChannel.id),
                    guildPreference
                );
                gameSession.startRound(guildPreference, messageContext);
                logger.info(
                    `${getDebugLogHeader(message)} | Game session starting`
                );
            }

            // prevent any duplicate game sessions
            if (gameSessions[message.guildID]) {
                gameSessions[message.guildID].endSession();
            }

            state.gameSessions[guildID] = gameSession;
        } else {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Attempted to start a game while one is already in progress.`
            );

            await sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    guildID,
                    "command.play.failure.alreadyInSession"
                ),
            });
        }
    };
}
