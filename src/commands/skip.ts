import BaseCommand, { CommandArgs } from "./base_command";
import Eris from "eris";
import GameSession from "../models/game_session";
import {
    sendSongMessage,
    areUserAndBotInSameVoiceChannel,
    getNumParticipants,
    EMBED_INFO_COLOR,
    getDebugContext,
    EMBED_SUCCESS_COLOR,
    sendMessage
} from "../helpers/discord_utils";
import { startGame, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("skip");

export default class SkipCommand implements BaseCommand {
    async call({ gameSessions, message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || !gameSession.gameRound || !areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(`${getDebugContext(message)} | Invalid skip. !gameSession: ${!gameSession}. !gameSession.gameRound: ${gameSession && !gameSession.gameRound}. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(message)}`);
            return;
        }
        gameSession.gameRound.userSkipped(message.author.id);
        if (gameSession.gameRound.skipAchieved || gameSession.gameRound.finished) {
            // song already being skipped
            return;
        }
        if (isSkipMajority(message, gameSession)) {
            gameSession.gameRound.skipAchieved = true;
            await sendSkipMessage(message, gameSession);
            await sendSongMessage(message, gameSession, true);
            gameSession.endRound(false);
            startGame(gameSessions, guildPreference, message);
            logger.info(`${getDebugContext(message)} | Skip majority achieved.`);
        }
        else {
            await sendSkipNotification(message, gameSession);
            logger.info(`${getDebugContext(message)} | Skip vote received.`);
        }
        gameSession.lastActiveNow();
    }
    help = {
        name: "skip",
        description: "Vote to skip the current song. A song is skipped when majority of participants vote to skip it.",
        usage: "!skip",
        examples: []
    }
    aliases = ["s"]
}

async function sendSkipNotification(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession) {
    await sendMessage({ channel: message.channel, authorId: message.author.id }, {
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL
            },
            title: "**Skip**",
            description: `${gameSession.gameRound.getNumSkippers()}/${getSkipsRequired(message)} skips received.`
        }
    })
}

async function sendSkipMessage(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession) {
    const skipMessage = await sendMessage({ channel: message.channel, authorId: message.author.id }, {
        embed: {
            color: EMBED_SUCCESS_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL

            },
            title: "**Skip**",
            description: `${gameSession.gameRound.getNumSkippers()}/${getSkipsRequired(message)} skips achieved, skipping...`
        }
    })
    setTimeout(() => {
        skipMessage.delete();
    }, 2500);
}

function isSkipMajority(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession): boolean {
    return gameSession.gameRound.getNumSkippers() >= getSkipsRequired(message);
}

function getSkipsRequired(message: Eris.Message<Eris.GuildTextableChannel>): number {
    return Math.floor(getNumParticipants(message) * 0.5) + 1;
}
