import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameType } from "./play";
import { getDebugContext, sendInfoMessage, getVoiceChannel } from "../../helpers/discord_utils";
import _logger from "../../logger";

const logger = _logger("begin");

export default class BeginCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        const { guildID, author } = message;
        if (!gameSessions[guildID] || gameSessions[message.guildID].gameType === GameType.CLASSIC || gameSessions[guildID].owner.id !== author.id) {
            return;
        }
        const guildPreference = await getGuildPreference(guildID);
        if (!gameSessions[guildID].sessionInitialized) {
            const gameInstructions = "Listen to the song and type your guess!";
            const textChannel = message.channel;
            const voiceChannel = getVoiceChannel(message);
            await sendInfoMessage(message, `Game starting in #${textChannel.name} in 🔊 ${voiceChannel.name}`, gameInstructions);
            gameSessions[guildID].startRound(guildPreference, message);
            logger.info(`${getDebugContext(message)} | Game session starting (elimination gameType)`);
        }
    }
}
