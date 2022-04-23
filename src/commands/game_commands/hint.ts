import type BaseCommand from "../interfaces/base_command";
import {
    getDebugLogHeader,
    getMajorityCount,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import { getGuildPreference } from "../../helpers/game_utils";
import { codeLine } from "../../helpers/utils";
import type { GuildTextableMessage } from "../../types";
import type GameSession from "../../structures/game_session";
import type EliminationScoreboard from "../../structures/elimination_scoreboard";
import type GuildPreference from "../../structures/guild_preference";
import CommandPrechecks from "../../command_prechecks";
import State from "../../state";
import type GameRound from "../../structures/game_round";
import Session from "../../structures/session";
import type HelpDocumentation from "../../interfaces/help";
import type CommandArgs from "../../interfaces/command_args";
import { GuessModeType } from "../../enums/option_types/guess_mode_type";
import { GameType } from "../../enums/game_type";

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
                title: State.localizer.translate(
                    message.guildID,
                    "command.hint.request.title"
                ),
                description: State.localizer.translate(
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
                title: State.localizer.translate(
                    message.guildID,
                    "command.hint.request.title"
                ),
                description: State.localizer.translate(
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
            title: State.localizer.translate(
                message.guildID,
                "command.hint.failure.invalidHintRequest.title"
            ),
            description: State.localizer.translate(
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
                title: State.localizer.translate(
                    message.guildID,
                    "command.hint.failure.invalidHintRequest.title"
                ),
                description: State.localizer.translate(
                    message.guildID,
                    "command.hint.failure.invalidHintRequest.eliminated.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            });
            return false;
        }
    } else if (guildPreference.isMultipleChoiceMode()) {
        sendErrorMessage(MessageContext.fromMessage(message), {
            title: State.localizer.translate(
                message.guildID,
                "command.hint.failure.invalidHintRequest.title"
            ),
            description: State.localizer.translate(
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
            return `${State.localizer.translate(
                guildID,
                "command.hint.artistName"
            )}: ${codeLine(gameRound.hints.artistHint)}`;
        case GuessModeType.SONG_NAME:
        case GuessModeType.BOTH:
        default:
            return `${State.localizer.translate(
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
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "hint",
        description: State.localizer.translate(
            guildID,
            "command.hint.help.description"
        ),
        usage: ",hint",
        examples: [],
        priority: 1020,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const gameSession = Session.getSession(message.guildID) as GameSession;
        const gameRound = gameSession?.round;
        const guildPreference = await getGuildPreference(message.guildID);
        if (!validHintCheck(gameSession, guildPreference, gameRound, message))
            return;

        gameRound.hintRequested(message.author.id);

        if (isHintAvailable(message, gameSession)) {
            gameRound.hintUsed = true;
            await sendInfoMessage(MessageContext.fromMessage(message), {
                title: State.localizer.translate(
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
