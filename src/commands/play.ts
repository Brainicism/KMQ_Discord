import GameSession from "../models/game_session";
import { sendErrorMessage, getDebugContext, sendInfoMessage } from "../helpers/discord_utils";
import { startGame, getGuildPreference } from "../helpers/game_utils";
import BaseCommand, { CommandArgs } from "./base_command";
import _logger from "../logger";
import { TextChannel } from "discord.js";
const logger = _logger("play");

class PlayCommand implements BaseCommand {
    async call({ message, gameSessions, client }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guild.id);
        if (!message.member.voiceChannel) {
            await sendErrorMessage(message,
                "Join a voice channel",
                `Send \`${guildPreference.getBotPrefix()}play\` again when you are in a voice channel.`);
            logger.warn(`${getDebugContext(message)} | User not in voice channel`);
        }
        else {
            if (!gameSessions[message.guild.id]) {
                const textChannel = message.channel as TextChannel;
                const voiceChannel = message.member.voiceChannel;
                gameSessions[message.guild.id] = new GameSession(textChannel, voiceChannel);
                await sendInfoMessage(message, `Game starting in #${textChannel.name} in 🔊 ${voiceChannel.name}`, "Listen to the song and type your guess!");
            }
            startGame(gameSessions, guildPreference, message, client);
        }
    }
    aliases = ["random"]
    help = {
        name: "play",
        description: "Bot plays a random song in VC; type in your guess first to get a point.",
        usage: "!play",
        arguments: []
    }
}

export default PlayCommand;
