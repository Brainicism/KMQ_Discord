import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import { codeLine } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getMajorityCount,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameType from "../../enums/game_type";
import GuessModeType from "../../enums/option_types/guess_mode_type";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EliminationScoreboard from "../../structures/elimination_scoreboard";
import type EmbedPayload from "../../interfaces/embed_payload";
import type GameRound from "../../structures/game_round";
import type GameSession from "../../structures/game_session";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "hint";
const logger = new IPCLogger(COMMAND_NAME);

function isHintMajority(
    messageContext: MessageContext,
    gameSession: GameSession,
): boolean {
    if (!gameSession.round) {
        return false;
    }

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
    gameSession: GameSession,
): boolean {
    if (!gameSession.round) return false;
    return (
        gameSession.round.hintUsed ||
        isHintMajority(messageContext, gameSession)
    );
}

async function sendHintNotification(
    messageContext: MessageContext,
    gameSession: GameSession,
    interaction?: Eris.CommandInteraction,
): Promise<void> {
    if (!gameSession.round) return;
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard =
            gameSession.scoreboard as EliminationScoreboard;

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.hint.request.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.hint.request.description",
                    {
                        hintCounter: `${gameSession.round.getHintRequests()}/${
                            Math.floor(
                                eliminationScoreboard.getAlivePlayersCount() *
                                    0.5,
                            ) + 1
                        }`,
                    },
                ),
            },
            true,
            undefined,
            [],
            interaction,
        );
    } else {
        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.hint.request.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.hint.request.description",
                    {
                        hintCounter: `${gameSession.round.getHintRequests()}/${getMajorityCount(
                            messageContext.guildID,
                        )}`,
                    },
                ),
            },
            true,
            undefined,
            [],
            interaction,
        );
    }
}

/**
 * @param gameSession - The game session
 * @param guildPreference - The guild preference
 * @param gameRound - The game round
 * @param messageContext - The message context
 * @param interaction - The interaction
 * @returns whether the hint request was valid
 */
export function validHintCheck(
    gameSession: GameSession,
    guildPreference: GuildPreference,
    gameRound: GameRound | null,
    messageContext: MessageContext,
    interaction?: Eris.CommandInteraction,
): gameRound is GameRound {
    if (!gameSession || !gameRound) {
        logger.warn(
            `${getDebugLogHeader(messageContext)} | No active game session`,
        );

        sendErrorMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.hint.failure.invalidHintRequest.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.hint.failure.invalidHintRequest.noSongPlaying.description",
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            },
            interaction,
        );
        return false;
    }

    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard =
            gameSession.scoreboard as EliminationScoreboard;

        if (
            eliminationScoreboard.isPlayerEliminated(messageContext.author.id)
        ) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.hint.failure.invalidHintRequest.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.hint.failure.invalidHintRequest.eliminated.description",
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                interaction,
            );
            return false;
        }
    }

    if (guildPreference.isMultipleChoiceMode()) {
        sendErrorMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.hint.failure.invalidHintRequest.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.hint.failure.invalidHintRequest.multipleChoice.description",
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            },
            interaction,
        );
        return false;
    }

    return true;
}

/**
 * @param guildID - The guild ID
 * @param guessMode - The guess mode
 * @param gameRound - The game round
 * @param locale - The locale
 * @returns the hint corresponding to the current game round
 */
export function generateHint(
    guildID: string,
    guessMode: GuessModeType,
    gameRound: GameRound,
    locale: LocaleType,
): string {
    switch (guessMode) {
        case GuessModeType.ARTIST:
            return `${i18n.translate(
                guildID,
                "command.hint.artistName",
            )}: ${codeLine(
                gameRound.hints.artistHint[
                    locale === LocaleType.KO ? LocaleType.KO : LocaleType.EN
                ],
            )}`;
        case GuessModeType.SONG_NAME:
        case GuessModeType.BOTH:
        default:
            return `${i18n.translate(
                guildID,
                "command.hint.songName",
            )}: ${codeLine(
                gameRound.hints.songHint[
                    locale === LocaleType.KO ? LocaleType.KO : LocaleType.EN
                ],
            )}`;
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
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.hint.help.description"),
        examples: [],
        priority: 1020,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await HintCommand.sendHint(MessageContext.fromMessage(message));
    };

    static sendHint = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> => {
        const gameSession = Session.getSession(
            messageContext.guildID,
        ) as GameSession;

        const gameRound = gameSession?.round;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (
            !validHintCheck(
                gameSession,
                guildPreference,
                gameRound,
                messageContext,
                interaction,
            )
        )
            return;

        gameRound.hintRequested(messageContext.author.id);

        if (isHintAvailable(messageContext, gameSession)) {
            gameRound.hintUsed = true;
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.hint.title",
                ),
                description: generateHint(
                    messageContext.guildID,
                    guildPreference.gameOptions.guessModeType,
                    gameRound,
                    State.getGuildLocale(messageContext.guildID),
                ),
                thumbnailUrl: KmqImages.READING_BOOK,
            };

            await sendInfoMessage(
                messageContext,
                embedPayload,
                false,
                undefined,
                undefined,
                interaction,
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Hint majority received.`,
            );
        } else {
            await sendHintNotification(
                messageContext,
                gameSession,
                interaction,
            );

            logger.info(
                `${getDebugLogHeader(messageContext)} | Hint request received.`,
            );
        }
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await HintCommand.sendHint(messageContext, interaction);
    }
}
