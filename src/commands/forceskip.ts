import BaseCommand, { CommandArgs } from "./base_command";
import {
    sendSongMessage,
    areUserAndBotInSameVoiceChannel,
    getDebugContext
} from "../helpers/discord_utils";
import { startGame, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("forceskip");

export default class ForceSkipCommand implements BaseCommand {
    async call({ gameSessions, message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || !gameSession.gameRound || !areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(`${getDebugContext(message)} | Invalid force-skip. !gameSession: ${!gameSession}. !gameSession.gameRound: ${gameSession && !gameSession.gameRound}. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(message)}`);
            return;
        }
        if (message.author !== gameSession.owner) {
            return;
        }
        gameSession.gameRound.skipAchieved = true;
        await sendSongMessage(message, gameSession, true);
        gameSession.endRound(false);
        startGame(gameSessions, guildPreference, message);
        logger.info(`${getDebugContext(message)} | Owner force-skipped.`);
        gameSession.lastActiveNow();
    }
    help = {
        name: "forceskip",
        description: "The person that started the game can force-skip the current song, no majority necessary.",
        usage: "!forceskip",
        examples: []
    }
    aliases = ["fskip"]
}
