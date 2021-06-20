import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugLogHeader, getMajorityCount, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import _logger from "../../logger";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import { getGuildPreference } from "../../helpers/game_utils";
import { GuessModeType } from "../game_options/guessmode";
import { codeLine } from "../../helpers/utils";
import { GuildTextableMessage, GameType } from "../../types";
import GameSession from "../../structures/game_session";
import EliminationScoreboard from "../../structures/elimination_scoreboard";

const logger = _logger("hint");

function isHintMajority(message: GuildTextableMessage, gameSession: GameSession): boolean {
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
        return gameSession.gameRound.getHintRequests() >= Math.floor(eliminationScoreboard.getAlivePlayersCount() * 0.5) + 1;
    }
    return gameSession.gameRound.getHintRequests() >= getMajorityCount(message);
}

async function sendHintNotification(message: GuildTextableMessage, gameSession: GameSession) {
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "**Hint Request**",
            description: `${gameSession.gameRound.getHintRequests()}/${Math.floor(eliminationScoreboard.getAlivePlayersCount() * 0.5) + 1} hint requests received.`,
        }, true);
    } else {
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "**Hint Request**",
            description: `${gameSession.gameRound.getHintRequests()}/${getMajorityCount(message)} hint requests received.`,
        }, true);
    }
}

export default class HintCommand implements BaseCommand {
    help = {
        name: "hint",
        description: "Gives a hint to the currently playing song",
        usage: ",hint",
        examples: [],
        priority: 1020,
    };

    aliases = ["h"];

    async call({ gameSessions, message }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        const gameRound = gameSession?.gameRound;
        if (!gameSession || !gameRound) {
            logger.warn(`${getDebugLogHeader(message)} | No active game session`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Invalid hint request", description: "A hint can only be requested when a song is playing.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
            return;
        }
        if (gameSession.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
            if (eliminationScoreboard.isPlayerEliminated(message.author.id)) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "Invalid hint request", description: "Only alive players may request hints.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
                return;
            }
        }
        const guildPreference = await getGuildPreference(message.guildID);
        gameRound.hintRequested(message.author.id);

        const guessMode = guildPreference.getGuessModeType();

        if (isHintMajority(message, gameSession)) {
            let hint: string;
            switch (guessMode) {
                case GuessModeType.ARTIST:
                    hint = `Artist Name: ${codeLine(gameRound.hints.artistHint)}`;
                    break;
                case GuessModeType.SONG_NAME:
                case GuessModeType.BOTH:
                default:
                    hint = `Song Name: ${codeLine(gameRound.hints.songHint)}`;
            }
            logger.info(`${getDebugLogHeader(message)} | Hint majority received.`);
            gameRound.hintUsed = true;
            sendInfoMessage(MessageContext.fromMessage(message), { title: "Hint", description: hint, thumbnailUrl: KmqImages.READING_BOOK });
        } else {
            logger.info(`${getDebugLogHeader(message)} | Hint request received.`);
            sendHintNotification(message, gameSession);
        }
    }
}
