import Eris from "eris";
import GameSession from "../../structures/game_session";
import {
    sendErrorMessage,
    getDebugLogHeader,
    sendInfoMessage,
    voicePermissionsCheck,
    getUserVoiceChannel,
    getUserTag,
    getCurrentVoiceMembers,
    getMention,
} from "../../helpers/discord_utils";
import {
    deleteGameSession,
    getTimeUntilRestart,
} from "../../helpers/management_utils";
import { activeBonusUsers, getGuildPreference } from "../../helpers/game_utils";
import {
    chooseWeightedRandom,
    isPowerHour,
    isWeekend,
} from "../../helpers/utils";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import dbContext from "../../database_context";
import { IPCLogger } from "../../logger";
import { GameInfoMessage, GameType, GuildTextableMessage } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("play");
const DEFAULT_LIVES = 10;

/**
 * Sends the beginning of game session message
 * @param textChannelName - The name of the text channel to send the message to
 * @param voiceChannelName - The name of the voice channel to join
 * @param message - The original message that triggered the command
 * @param participants - The list of participants
 */
export async function sendBeginGameMessage(
    textChannelName: string,
    voiceChannelName: string,
    message: GuildTextableMessage,
    participants: Array<{
        id: string;
        username: string;
        discriminator: string;
    }>
): Promise<void> {
    let gameInstructions = state.localizer.translate(
        message.guildID,
        "command.play.typeGuess"
    );

    const bonusUsers = await activeBonusUsers();
    const bonusUserParticipants = participants.filter((x) =>
        bonusUsers.has(x.id)
    );

    if (bonusUserParticipants.length > 0) {
        let bonusUserTags = bonusUserParticipants.map(
            (x) => `\`${getUserTag(x)}\``
        );

        if (bonusUserTags.length > 10) {
            bonusUserTags = bonusUserTags.slice(0, 10);
            bonusUserTags.push(
                state.localizer.translate(message.guildID, "misc.andManyOthers")
            );
        }

        gameInstructions += `\n\n${bonusUserTags.join(", ")}`;
        gameInstructions += state.localizer.translate(
            message.guildID,
            "command.play.exp.doubleExpForVoting",
            {
                link: "https://top.gg/bot/508759831755096074/vote",
            }
        );

        gameInstructions += state.localizer.translate(
            message.guildID,
            "command.play.exp.howToVote",
            { vote: `\`${process.env.BOT_PREFIX}vote\`` }
        );
    }

    if (isWeekend()) {
        gameInstructions += `\n\n**⬆️ ${state.localizer.translate(
            message.guildID,
            "command.play.exp.weekend"
        )} ⬆️**`;
    } else if (isPowerHour()) {
        gameInstructions += `\n\n**⬆️ ${state.localizer.translate(
            message.guildID,
            "command.play.exp.powerHour"
        )} ⬆️**`;
    }

    const startTitle = state.localizer.translate(
        message.guildID,
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
            name: state.localizer.translate(
                message.guildID,
                gameInfoMessage.title
            ),
            value: state.localizer.translate(
                message.guildID,
                gameInfoMessage.message
            ),
            inline: false,
        });
    }

    await sendInfoMessage(MessageContext.fromMessage(message), {
        title: startTitle,
        description: gameInstructions,
        footerText:
            bonusUserParticipants.length === 0 && Math.random() < 0.5
                ? state.localizer.translate(
                      message.guildID,
                      "command.play.voteReminder",
                      {
                          vote: `${process.env.BOT_PREFIX}vote`,
                      }
                  )
                : null,
        thumbnailUrl: KmqImages.HAPPY,
        fields,
    });
}

export default class PlayCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [],
    };

    aliases = ["random", "start", "p"];

    help = (guildID: string): Help => ({
        name: "play",
        description: state.localizer.translate(
            guildID,
            "command.play.help.description"
        ),
        usage: ",play {classic | elimination | teams}\n,play elimination {lives}",
        priority: 1050,
        examples: [
            {
                example: "`,play`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.play.help.classic"
                ),
            },
            {
                example: "`,play elimination 5`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.play.help.elimination",
                    {
                        lives: "`5`",
                    }
                ),
            },
            {
                example: "`,play elimination`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.play.help.elimination",
                    {
                        lives: `\`${DEFAULT_LIVES}\``,
                    }
                ),
            },
            {
                example: "`,play teams`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.play.help.teams"
                ),
            },
        ],
    });

    call = async ({
        message,
        gameSessions,
        parsedMessage,
        channel,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const voiceChannel = getUserVoiceChannel(
            MessageContext.fromMessage(message)
        );

        const timeUntilRestart = await getTimeUntilRestart();
        if (timeUntilRestart) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "command.play.failure.botRestarting.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.play.failure.botRestarting.description",
                    { timeUntilRestart: `\`${timeUntilRestart}\`` }
                ),
            });

            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Attempted to start game before restart.`
            );
            return;
        }

        if (!voiceChannel) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: "command.play.failure.notInVC.title",
                description: state.localizer.translate(
                    message.guildID,
                    "command.play.failure.notInVC.description",
                    { play: `\`${process.env.BOT_PREFIX}play\`` }
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

        const isEliminationMode =
            parsedMessage.components.length >= 1 &&
            parsedMessage.components[0].toLowerCase() === "elimination";

        const isTeamsMode =
            parsedMessage.components.length >= 1 &&
            parsedMessage.components[0].toLowerCase() === "teams";

        if (
            gameSessions[message.guildID] &&
            !gameSessions[message.guildID].sessionInitialized &&
            (isEliminationMode || isTeamsMode)
        ) {
            // User sent ,play elimination or ,play teams twice, reset the GameSession
            deleteGameSession(message.guildID);
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Teams game session was in progress, has been reset.`
            );
        }

        const messageContext = MessageContext.fromMessage(message);
        const prefix = process.env.BOT_PREFIX;

        if (
            !gameSessions[message.guildID] ||
            !gameSessions[message.guildID].sessionInitialized
        ) {
            // (1) No game session exists yet (create ELIMINATION, TEAMS, CLASSIC, or COMPETITION game), or
            // (2) User attempting to ,play after a ,play elimination/teams that didn't start, start CLASSIC game
            const textChannel = channel;
            const gameOwner = KmqMember.fromUser(message.author);
            let gameSession: GameSession;

            if (isEliminationMode) {
                // (1) ELIMINATION game creation
                const lives =
                    parsedMessage.components.length > 1 &&
                    Number.isInteger(parseInt(parsedMessage.components[1])) &&
                    parseInt(parsedMessage.components[1]) > 0 &&
                    parseInt(parsedMessage.components[1]) <= 10000
                        ? parseInt(parsedMessage.components[1])
                        : DEFAULT_LIVES;

                const startTitle = state.localizer.translate(
                    message.guildID,
                    "command.play.elimination.join.title",
                    { join: `\`${prefix}join\``, begin: `\`${prefix}begin\`` }
                );

                const gameInstructions = state.localizer.translate(
                    message.guildID,
                    "command.play.elimination.join.description",
                    {
                        join: `\`${prefix}join\``,
                        mentionedUser: getMention(gameOwner.id),
                        begin: `\`${prefix}begin\``,
                        lives: `\`${lives}\``,
                    }
                );

                gameSession = new GameSession(
                    textChannel.id,
                    voiceChannel.id,
                    textChannel.guild.id,
                    gameOwner,
                    GameType.ELIMINATION,
                    lives
                );
                gameSession.addEliminationParticipant(gameOwner);
                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Elimination game session created.`
                );

                await sendInfoMessage(messageContext, {
                    title: startTitle,
                    description: gameInstructions,
                    thumbnailUrl: KmqImages.HAPPY,
                });
            } else if (isTeamsMode) {
                // (1) TEAMS game creation
                const startTitle = state.localizer.translate(
                    message.guildID,
                    "command.play.team.joinTeam.title",
                    {
                        join: `\`${prefix}join\``,
                    }
                );

                const gameInstructions = state.localizer.translate(
                    message.guildID,
                    "command.play.team.joinTeam.description",
                    { join: `${prefix}join` }
                );

                gameSession = new GameSession(
                    textChannel.id,
                    voiceChannel.id,
                    textChannel.guild.id,
                    gameOwner,
                    GameType.TEAMS
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
                // (1 and 2) CLASSIC and COMPETITION game creation
                if (gameSessions[message.guildID]) {
                    // (2) Let the user know they're starting a non-elimination/teams game
                    const oldGameType = gameSessions[message.guildID].gameType;
                    const ignoringOldGameTypeTitle = state.localizer.translate(
                        message.guildID,
                        "command.play.failure.overrideTeamsOrElimination.title",
                        { playOldGameType: `\`${prefix}play ${oldGameType}\`` }
                    );

                    const gameSpecificInstructions =
                        oldGameType === GameType.ELIMINATION
                            ? state.localizer.translate(
                                  message.guildID,
                                  "command.play.failure.overrideTeamsOrElimination.elimination.join",
                                  {
                                      join: `\`${prefix}join\``,
                                  }
                              )
                            : state.localizer.translate(
                                  message.guildID,
                                  "command.play.failure.overrideTeamsOrElimination.teams.join",
                                  {
                                      join: `${prefix}join`,
                                  }
                              );

                    const oldGameTypeInstructions = state.localizer.translate(
                        message.guildID,
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

                const isCompetitionMode =
                    parsedMessage.components.length >= 1 &&
                    parsedMessage.components[0].toLowerCase() === "competition";

                if (isCompetitionMode) {
                    const isModerator = await dbContext
                        .kmq("competition_moderators")
                        .select("user_id")
                        .where("guild_id", "=", message.guildID)
                        .andWhere("user_id", "=", message.author.id)
                        .first();

                    if (!isModerator) {
                        sendErrorMessage(messageContext, {
                            title: state.localizer.translate(
                                message.guildID,
                                "command.play.failure.hiddenGameMode.title"
                            ),
                            description: state.localizer.translate(
                                message.guildID,
                                "command.play.failure.hiddenGameMode.description"
                            ),
                            thumbnailUrl: KmqImages.DEAD,
                        });
                        return;
                    }
                }

                gameSession = new GameSession(
                    textChannel.id,
                    voiceChannel.id,
                    textChannel.guild.id,
                    gameOwner,
                    isCompetitionMode ? GameType.COMPETITION : GameType.CLASSIC
                );

                await sendBeginGameMessage(
                    textChannel.name,
                    voiceChannel.name,
                    message,
                    getCurrentVoiceMembers(voiceChannel.id)
                );
                gameSession.startRound(guildPreference, messageContext);
                logger.info(
                    `${getDebugLogHeader(message)} | Game session starting`
                );
            }

            gameSessions[message.guildID] = gameSession;
        } else {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Attempted to start a game while one is already in progress.`
            );

            await sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    message.guildID,
                    "command.play.failure.alreadyInSession"
                ),
            });
        }
    };
}
