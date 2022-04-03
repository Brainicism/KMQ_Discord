import CommandPrechecks from "../../command_prechecks";
import { KmqImages } from "../../constants";
import {
    getDebugLogHeader,
    getMajorityCount,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { codeLine } from "../../helpers/utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import EliminationScoreboard from "../../structures/elimination_scoreboard";
import GameRound from "../../structures/game_round";
import GameSession from "../../structures/game_session";
import GuildPreference from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import { GameType, GuildTextableMessage } from "../../types";
import { GuessModeType } from "../game_options/guessmode";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("hint");

function isHintMajority(
    message: GuildTextableMessage,
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
        gameSession.round.getHintRequests() >= getMajorityCount(message.guildID)
    );
}

function isHintAvailable(
    message: GuildTextableMessage,
    gameSession: GameSession
): boolean {
    if (!gameSession.round) return false;
    return gameSession.round.hintUsed || isHintMajority(message, gameSession);
}

async function sendHintNotification(
    message: GuildTextableMessage,
    gameSession: GameSession
): Promise<void> {
    if (!gameSession.round) return;
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard =
            gameSession.scoreboard as EliminationScoreboard;

        await sendInfoMessage(
            MessageContext.fromMessage(message),
            {
                title: state.localizer.translate(
                    message.guildID,
                    "command.hint.request.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
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
            MessageContext.fromMessage(message),
            {
                title: state.localizer.translate(
                    message.guildID,
                    "command.hint.request.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.hint.request.description",
                    {
                        hintCounter: `${gameSession.round.getHintRequests()}/${getMajorityCount(
                            message.guildID
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
 * @param message - The originating message
 * @returns whether the hint request was valid
 */
export function validHintCheck(
    gameSession: GameSession,
    guildPreference: GuildPreference,
    gameRound: GameRound,
    message: GuildTextableMessage
): boolean {
    if (!gameSession || !gameRound) {
        logger.warn(`${getDebugLogHeader(message)} | No active game session`);
        sendErrorMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "command.hint.failure.invalidHintRequest.title"
            ),
            description: state.localizer.translate(
                message.guildID,
                "command.hint.failure.invalidHintRequest.noSongPlaying.description"
            ),
            thumbnailUrl: KmqImages.NOT_IMPRESSED,
        });
        return false;
    }

    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard =
            gameSession.scoreboard as EliminationScoreboard;

        if (eliminationScoreboard.isPlayerEliminated(message.author.id)) {
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "command.hint.failure.invalidHintRequest.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.hint.failure.invalidHintRequest.eliminated.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            });
            return false;
        }
    } else if (guildPreference.isMultipleChoiceMode()) {
        sendErrorMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "command.hint.failure.invalidHintRequest.title"
            ),
            description: state.localizer.translate(
                message.guildID,
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
            return `${state.localizer.translate(
                guildID,
                "command.hint.artistName"
            )}: ${codeLine(gameRound.hints.artistHint)}`;
        case GuessModeType.SONG_NAME:
        case GuessModeType.BOTH:
        default:
            return `${state.localizer.translate(
                guildID,
                "command.hint.songName"
            )}: ${codeLine(gameRound.hints.songHint)}`;
    }
}

export default class HintCommand implements BaseCommand {
    aliases = ["h"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
        name: "hint",
        description: state.localizer.translate(
            guildID,
            "command.hint.help.description"
        ),
        usage: ",hint",
        examples: [],
        priority: 1020,
    });

    call = async ({ gameSessions, message }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        const gameRound = gameSession?.round;
        const guildPreference = await getGuildPreference(message.guildID);
        if (!validHintCheck(gameSession, guildPreference, gameRound, message))
            return;

        gameRound.hintRequested(message.author.id);

        if (isHintAvailable(message, gameSession)) {
            gameRound.hintUsed = true;
            await sendInfoMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "command.hint.title"
                ),
                description: generateHint(
                    message.guildID,
                    guildPreference.gameOptions.guessModeType,
                    gameRound
                ),
                thumbnailUrl: KmqImages.READING_BOOK,
            });

            logger.info(
                `${getDebugLogHeader(message)} | Hint majority received.`
            );
        } else {
            await sendHintNotification(message, gameSession);
            logger.info(
                `${getDebugLogHeader(message)} | Hint request received.`
            );
        }
    };
}
