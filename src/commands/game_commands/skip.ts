import Eris from "eris";
import BaseCommand, { CommandArgs } from "../base_command";
import GameSession from "../../structures/game_session";
import {
    areUserAndBotInSameVoiceChannel,
    EMBED_INFO_COLOR,
    getDebugLogHeader,
    EMBED_SUCCESS_COLOR,
    sendMessage,
    getNumParticipants,
    getMessageContext,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameType } from "./play";
import EliminationScoreboard from "../../structures/elimination_scoreboard";
import _logger from "../../logger";
import GameRound from "../../structures/game_round";

const logger = _logger("skip");

function getSkipsRequired(message: Eris.Message<Eris.GuildTextableChannel>): number {
    return Math.floor(getNumParticipants(message) * 0.5) + 1;
}

async function sendSkipNotification(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession) {
    await sendMessage(message.channel, {
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL,
            },
            title: "**Skip**",
            description: `${gameSession.gameRound.getNumSkippers()}/${getSkipsRequired(message)} skips received.`,
        },
    });
}

async function sendSkipMessage(message: Eris.Message<Eris.GuildTextableChannel>, gameRound: GameRound) {
    const skipMessage = await sendMessage(message.channel, {
        embed: {
            color: EMBED_SUCCESS_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL,

            },
            title: "**Skip**",
            description: `${gameRound.getNumSkippers()}/${getSkipsRequired(message)} skips achieved, skipping...`,
        },
    });
    setTimeout(() => {
        skipMessage.delete();
    }, 2500);
}

function isSkipMajority(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession): boolean {
    return gameSession.gameRound.getNumSkippers() >= getSkipsRequired(message);
}

export default class SkipCommand implements BaseCommand {
    help = {
        name: "skip",
        description: "Vote to skip the current song. A song is skipped when majority of participants vote to skip it.",
        usage: "!skip",
        examples: [],
        priority: 1010,
    };

    aliases = ["s"];

    async call({ gameSessions, message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || !gameSession.gameRound || !areUserAndBotInSameVoiceChannel(message)) {
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
            await gameSession.endRound(false, getMessageContext(message));
            gameSession.startRound(guildPreference, getMessageContext(message));
            logger.info(`${getDebugLogHeader(message)} | Skip majority achieved.`);
        } else {
            await sendSkipNotification(message, gameSession);
            logger.info(`${getDebugLogHeader(message)} | Skip vote received.`);
        }
        gameSession.lastActiveNow();
    }
}
