import GameSession from "../models/game_session";
import { sendErrorMessage, getDebugContext, sendInfoMessage, getVoiceChannel, voicePermissionsCheck } from "../helpers/discord_utils";
import { startGame, getGuildPreference } from "../helpers/game_utils";
import BaseCommand, { CommandArgs } from "./base_command";
import _logger from "../logger";
const logger = _logger("play");

export default class PlayCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const voiceChannel = getVoiceChannel(message);
        if (!voiceChannel) {
            await sendErrorMessage(message,
                "Join a voice channel",
                `Send \`${guildPreference.getBotPrefix()}play\` again when you are in a voice channel.`);
            logger.warn(`${getDebugContext(message)} | User not in voice channel`);
        }
        else {
            if (!voicePermissionsCheck(message)) {
                return;
            }
            if (!gameSessions[message.guildID]) {
                const textChannel = message.channel;
                gameSessions[message.guildID] = new GameSession(textChannel, voiceChannel, message.author);
                await sendInfoMessage(message, `Game starting in #${textChannel.name} in 🔊 ${voiceChannel.name}`, "Listen to the song and type your guess!");
            }
            startGame(gameSessions, guildPreference, message);
        }
    }
    aliases = ["random"]
    help = {
        name: "play",
        description: "Bot plays a random song in VC; type in your guess first to get a point.",
        usage: "!play",
        examples: []
    }
}
