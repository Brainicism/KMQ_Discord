import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import { codeLine } from "../../helpers/utils";
import {
    generateEmbed,
    getDebugLogHeader,
    getMajorityCount,
    sendErrorMessage,
    sendInfoMessage,
    tryCreateInteractionSuccessAcknowledgement,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameType from "../../enums/game_type";
import GuessModeType from "../../enums/option_types/guess_mode_type";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EliminationScoreboard from "../../structures/elimination_scoreboard";
import type EmbedPayload from "../../interfaces/embed_payload";
import type GameRound from "../../structures/game_round";
import type GameSession from "../../structures/game_session";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("hint");

function isHintMajority(
    messageContext: MessageContext,
    gameSession: GameSession
): boolean {
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard =
            gameSession.scoreboard as EliminationScoreboard;

        return (
            gameSession.round.getHintRequests() >=
            Math.floor(eliminationScoreboard.getAlivePlayersCount() * 0.5) + 1
        );
    }

    return (
        gameSession.round.getHintRequests() >=
        getMajorityCount(messageContext.guildID)
    );
}

function isHintAvailable(
    messageContext: MessageContext,
    gameSession: GameSession
): boolean {
    if (!gameSession.round) return false;
    return (
        gameSession.round.hintUsed ||
        isHintMajority(messageContext, gameSession)
    );
}

async function sendHintNotification(
    messageContext: MessageContext,
    gameSession: GameSession
): Promise<void> {
    if (!gameSession.round) return;
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard =
            gameSession.scoreboard as EliminationScoreboard;

        await sendInfoMessage(
            messageContext,
            {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.hint.request.title"
                ),
                description: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.hint.request.description",
                    {
                        hintCounter: `${gameSession.round.getHintRequests()}/${
                            Math.floor(
                                eliminationScoreboard.getAlivePlayersCount() *
                                    0.5
                            ) + 1
                        }`,
                    }
                ),
            },
            true
        );
    } else {
        await sendInfoMessage(
            messageContext,
            {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.hint.request.title"
                ),
                description: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.hint.request.description",
                    {
                        hintCounter: `${gameSession.round.getHintRequests()}/${getMajorityCount(
                            messageContext.guildID
                        )}`,
                    }
                ),
            },
            true
        );
    }
}

/**
 * @param gameSession - The game session
 * @param guildPreference - The guild preference
 * @param gameRound - The game round
 * @param messageContext - The message context
 * @returns whether the hint request was valid
 */
export function validHintCheck(
    gameSession: GameSession,
    guildPreference: GuildPreference,
    gameRound: GameRound,
    messageContext: MessageContext
): boolean {
    if (!gameSession || !gameRound) {
        logger.warn(
            `${getDebugLogHeader(messageContext)} | No active game session`
        );

        sendErrorMessage(messageContext, {
            title: LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.hint.failure.invalidHintRequest.title"
            ),
            description: LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.hint.failure.invalidHintRequest.noSongPlaying.description"
            ),
            thumbnailUrl: KmqImages.NOT_IMPRESSED,
        });
        return false;
    }

    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard =
            gameSession.scoreboard as EliminationScoreboard;

        if (
            eliminationScoreboard.isPlayerEliminated(messageContext.author.id)
        ) {
            sendErrorMessage(messageContext, {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.hint.failure.invalidHintRequest.title"
                ),
                description: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.hint.failure.invalidHintRequest.eliminated.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            });
            return false;
        }
    } else if (guildPreference.isMultipleChoiceMode()) {
        sendErrorMessage(messageContext, {
            title: LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.hint.failure.invalidHintRequest.title"
            ),
            description: LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.hint.failure.invalidHintRequest.multipleChoice.description"
            ),
            thumbnailUrl: KmqImages.NOT_IMPRESSED,
        });
        return false;
    }

    return true;
}

/**
 * @param guildID - The guild ID
 * @param guessMode - The guess mode
 * @param gameRound - The game round
 * @returns the hint corresponding to the current game round
 */
export function generateHint(
    guildID: string,
    guessMode: GuessModeType,
    gameRound: GameRound
): string {
    switch (guessMode) {
        case GuessModeType.ARTIST:
            return `${LocalizationManager.localizer.translate(
                guildID,
                "command.hint.artistName"
            )}: ${codeLine(gameRound.hints.artistHint)}`;
        case GuessModeType.SONG_NAME:
        case GuessModeType.BOTH:
        default:
            return `${LocalizationManager.localizer.translate(
                guildID,
                "command.hint.songName"
            )}: ${codeLine(gameRound.hints.songHint)}`;
    }
}

export default class HintCommand implements BaseCommand {
    aliases = ["h"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "hint",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.hint.help.description"
        ),
        usage: ",hint",
        examples: [],
        priority: 1020,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "hint",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.hint.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await HintCommand.sendHint(MessageContext.fromMessage(message));
    };

    static sendHint = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> => {
        if (interaction) {
            await tryCreateInteractionSuccessAcknowledgement(
                interaction,
                LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.interaction.genericProgress.title"
                ),
                LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.interaction.genericProgress.description"
                )
            );
        }

        const gameSession = Session.getSession(
            messageContext.guildID
        ) as GameSession;

        const gameRound = gameSession?.round;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (
            !validHintCheck(
                gameSession,
                guildPreference,
                gameRound,
                messageContext
            )
        )
            return;

        gameRound.hintRequested(messageContext.author.id);

        if (isHintAvailable(messageContext, gameSession)) {
            gameRound.hintUsed = true;
            const embedPayload: EmbedPayload = {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.hint.title"
                ),
                description: generateHint(
                    messageContext.guildID,
                    guildPreference.gameOptions.guessModeType,
                    gameRound
                ),
                thumbnailUrl: KmqImages.READING_BOOK,
            };

            if (interaction) {
                const embed = generateEmbed(messageContext, embedPayload);
                tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    null,
                    null,
                    { embeds: [embed] }
                );
            } else {
                await sendInfoMessage(messageContext, embedPayload);
            }

            logger.info(
                `${getDebugLogHeader(messageContext)} | Hint majority received.`
            );
        } else {
            await sendHintNotification(messageContext, gameSession);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Hint request received.`
            );
        }
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    static async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        if (interaction instanceof Eris.CommandInteraction) {
            await HintCommand.sendHint(messageContext, interaction);
        }
    }
}
