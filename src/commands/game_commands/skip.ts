import { CommandArgs } from "../interfaces/base_command";
import GameSession from "../../structures/game_session";
import {
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    EMBED_SUCCESS_COLOR,
    sendInfoMessage,
    getMajorityCount,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import EliminationScoreboard from "../../structures/elimination_scoreboard";
import _logger from "../../logger";
import GameRound from "../../structures/game_round";
import { GuildTextableMessage, GameType } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import InGameCommand from "../interfaces/ingame_command";

const logger = _logger("skip");

async function sendSkipNotification(message: GuildTextableMessage, gameSession: GameSession) {
    await sendInfoMessage(MessageContext.fromMessage(message), {
        title: "**Skip**",
        description: `${gameSession.gameRound.getNumSkippers()}/${getMajorityCount(message)} skips received.`,
    }, true);
}

async function sendSkipMessage(message: GuildTextableMessage, gameRound: GameRound) {
    await sendInfoMessage(MessageContext.fromMessage(message), {
        color: EMBED_SUCCESS_COLOR,
        title: "**Skip**",
        description: `${gameRound.getNumSkippers()}/${getMajorityCount(message)} skips achieved, skipping...`,
        thumbnailUrl: KmqImages.NOT_IMPRESSED,
    });
}

function isSkipMajority(message: GuildTextableMessage, gameSession: GameSession): boolean {
    return gameSession.gameRound.getNumSkippers() >= getMajorityCount(message);
}

export default class SkipCommand extends InGameCommand {
    inGameOnly = true;

    help = {
        name: "skip",
        description: "Vote to skip the current song. A song is skipped when majority of participants vote to skip it.",
        usage: ",skip",
        examples: [],
        priority: 1010,
    };

    aliases = ["s"];

    call = async ({ gameSessions, message }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || !gameSession.gameRound || gameSession.gameRound.finished || !areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(`${getDebugLogHeader(message)} | Invalid skip. !gameSession: ${!gameSession}. !gameSession.gameRound: ${gameSession && !gameSession.gameRound}. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(message)}`);
            return;
        }

        gameSession.gameRound.userSkipped(message.author.id);
        if (gameSession.gameRound.skipAchieved || !gameSession.gameRound) {
            // song already being skipped
            return;
        }
        if (isSkipMajority(message, gameSession)) {
            gameSession.gameRound.skipAchieved = true;
            if (gameSession.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
                eliminationScoreboard.decrementAllLives();
            }
            sendSkipMessage(message, gameSession.gameRound);
            gameSession.endRound({ correct: false }, guildPreference, MessageContext.fromMessage(message));
            gameSession.startRound(guildPreference, MessageContext.fromMessage(message));
            logger.info(`${getDebugLogHeader(message)} | Skip majority achieved.`);
        } else {
            await sendSkipNotification(message, gameSession);
            logger.info(`${getDebugLogHeader(message)} | Skip vote received.`);
        }
        gameSession.lastActiveNow();
    };
}
