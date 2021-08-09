import { CommandArgs } from "../interfaces/base_command";
import { getDebugLogHeader, getMajorityCount, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import { getGuildPreference } from "../../helpers/game_utils";
import { GuessModeType } from "../game_options/guessmode";
import { codeLine } from "../../helpers/utils";
import { GuildTextableMessage, GameType } from "../../types";
import GameSession from "../../structures/game_session";
import EliminationScoreboard from "../../structures/elimination_scoreboard";
import InGameCommand from "../interfaces/ingame_command";
import GameRound from "../../structures/game_round";
import GuildPreference from "../../structures/guild_preference";

const logger = new IPCLogger("hint");

function isHintMajority(message: GuildTextableMessage, gameSession: GameSession, guildPreference: GuildPreference): boolean {
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
        return gameSession.gameRound.getHintRequests() >= Math.floor(eliminationScoreboard.getAlivePlayersCount() * 0.5) + 1;
    }

    if (guildPreference.isMultipleChoiceMode()) {
        return gameSession.gameRound.getHintRequests() >= getMajorityCount(message.guildID) - gameSession.gameRound.incorrectMCGuessers.size;
    }

    return gameSession.gameRound.getHintRequests() >= getMajorityCount(message.guildID);
}

function isHintAvailable(message: GuildTextableMessage, gameSession: GameSession, guildPreference: GuildPreference) {
    return gameSession.gameRound.hintUsed || isHintMajority(message, gameSession, guildPreference);
}

async function sendHintNotification(message: GuildTextableMessage, gameSession: GameSession, guildPreference: GuildPreference) {
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "**Hint Request**",
            description: `${gameSession.gameRound.getHintRequests()}/${Math.floor(eliminationScoreboard.getAlivePlayersCount() * 0.5) + 1} hint requests received.`,
        }, true);
    } else if (guildPreference.isMultipleChoiceMode()) {
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "**Hint Request**",
            description: `${gameSession.gameRound.getHintRequests()}/${Math.max(getMajorityCount(message.guildID) - gameSession.gameRound.incorrectMCGuessers.size, 1)} hint requests received.`,
        }, true);
    } else {
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "**Hint Request**",
            description: `${gameSession.gameRound.getHintRequests()}/${getMajorityCount(message.guildID)} hint requests received.`,
        }, true);
    }
}

export function validHintCheck(gameSession: GameSession, guildPreference: GuildPreference, gameRound: GameRound, message: GuildTextableMessage): boolean {
    if (!gameSession || !gameRound) {
        logger.warn(`${getDebugLogHeader(message)} | No active game session`);
        sendErrorMessage(MessageContext.fromMessage(message), { title: "Invalid hint request", description: "A hint can only be requested when a song is playing.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
        return false;
    }

    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
        if (eliminationScoreboard.isPlayerEliminated(message.author.id)) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Invalid hint request", description: "Only alive players may request hints.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
            return false;
        }
    } else if (guildPreference.isMultipleChoiceMode()) {
        sendErrorMessage(MessageContext.fromMessage(message), { title: "Invalid hint request", description: "You cannot request hints while playing multiple choice.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
        return false;
    }

    return true;
}

export function generateHint(guessMode: GuessModeType, gameRound: GameRound): string {
    switch (guessMode) {
        case GuessModeType.ARTIST:
            return `Artist Name: ${codeLine(gameRound.hints.artistHint)}`;
        case GuessModeType.SONG_NAME:
        case GuessModeType.BOTH:
        default:
            return `Song Name: ${codeLine(gameRound.hints.songHint)}`;
    }
}

export default class HintCommand extends InGameCommand {
    help = {
        name: "hint",
        description: "Gives a hint to the currently playing song",
        usage: ",hint",
        examples: [],
        priority: 1020,
    };

    aliases = ["h"];

    call = async ({ gameSessions, message }: CommandArgs) => {
        const gameSession = gameSessions[message.guildID];
        const gameRound = gameSession?.gameRound;
        const guildPreference = await getGuildPreference(message.guildID);
        if (!validHintCheck(gameSession, guildPreference, gameRound, message)) return;

        gameRound.hintRequested(message.author.id);

        if (isHintAvailable(message, gameSession, guildPreference)) {
            logger.info(`${getDebugLogHeader(message)} | Hint majority received.`);
            gameRound.hintUsed = true;
            sendInfoMessage(MessageContext.fromMessage(message), { title: "Hint", description: generateHint(guildPreference.getGuessModeType(), gameRound), thumbnailUrl: KmqImages.READING_BOOK });
        } else {
            logger.info(`${getDebugLogHeader(message)} | Hint request received.`);
            sendHintNotification(message, gameSession, guildPreference);
        }
    };
}
