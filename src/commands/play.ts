import GameSession from "../models/game_session";
import { sendErrorMessage, getDebugContext, sendInfoMessage } from "../helpers/discord_utils";
import { startGame, getGuildPreference } from "../helpers/game_utils";
import BaseCommand, { CommandArgs } from "./base_command";
import _logger from "../logger";
import { TextChannel } from "discord.js";
const logger = _logger("play");

class PlayCommand implements BaseCommand {
    async call({ message, db, gameSessions, client }: CommandArgs) {
        let guildPreference = await getGuildPreference(db, message.guild.id);
        if (!message.member.voiceChannel) {
            await sendErrorMessage(message,
                "Join a voice channel",
                `Send \`${guildPreference.getBotPrefix()}play\` again when you are in a voice channel.`);
            logger.warn(`${getDebugContext(message)} | User not in voice channel`);
        }
        else {
            let channel = message.channel as TextChannel;
            if (!gameSessions[message.guild.id]) {
                gameSessions[message.guild.id] = new GameSession(channel);
                await sendInfoMessage(message, `Game starting in #${channel.name}`, "Listen to the song and type your guess!");
                logger.info(`${getDebugContext(message)} | Game session created`);
            }
            startGame(gameSessions[message.guild.id], guildPreference, db, message, client, message.member.voiceChannel);
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
