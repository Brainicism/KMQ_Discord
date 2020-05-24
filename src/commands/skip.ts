import BaseCommand, { CommandArgs } from "./base_command";
import * as Discord from "discord.js"
import GameSession from "models/game_session";
import {
    sendSongMessage,
    areUserAndBotInSameVoiceChannel,
    getNumParticipants,
    EMBED_INFO_COLOR,
    getDebugContext
} from "../helpers/discord_utils";
import { startGame } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("skip");

class SkipCommand implements BaseCommand {
    async call({ gameSessions, guildPreference, client, message, db }: CommandArgs) {
        let gameSession = gameSessions[message.guild.id];
        if (!gameSession || !gameSession.gameInSession() || !areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(`${getDebugContext(message)} | Invalid skip. !gameSession: ${!gameSession}. !gameSession.gameInSession(): ${gameSession && !gameSession.gameInSession()}. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(message)}`);
            return;
        }
        gameSession.userSkipped(message.author.id);
        if (gameSession.skipAchieved) {
            // song already being skipped
            return;
        }
        if (isSkipMajority(message, gameSession)) {
            gameSession.skipAchieved = true;
            await sendSkipMessage(message, gameSession);
            await sendSongMessage(message, gameSession, true);
            gameSession.endRound();
            startGame(gameSession, guildPreference, db, message, client);
            logger.info(`${getDebugContext(message)} | Skip majority achieved.`);
        }
        else {
            await sendSkipNotification(message, gameSession);
            logger.info(`${getDebugContext(message)} | Skip vote received.`);
        }
    }
    help = {
        name: "skip",
        description: "Vote to skip the current song. A song is skipped when majority of participants vote to skip it.",
        usage: "!skip",
        arguments: []
    }
}

export default SkipCommand;

async function sendSkipNotification(message: Discord.Message, gameSession: GameSession) {
    await message.channel.send({
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL()
            },
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${getSkipsRequired(message)} skips received.`
        }
    })
        .then((message) => message.delete({ timeout: 5000 }));
}

async function sendSkipMessage(message: Discord.Message, gameSession: GameSession) {
    await message.channel.send({
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL()

            },
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${getSkipsRequired(message)} skips achieved, skipping...`
        }
    })
        .then((message) => message.delete({ timeout: 5000 }));
}

function isSkipMajority(message: Discord.Message, gameSession: GameSession): boolean {
    return gameSession.getNumSkippers() >= getSkipsRequired(message);
}

function getSkipsRequired(message: Discord.Message): number {
    return Math.floor(getNumParticipants(message) * 0.5) + 1;
}
