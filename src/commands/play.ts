import GameSession from "../models/game_session";
import { sendErrorMessage, startGame, getDebugContext } from "../helpers/utils";
import BaseCommand, { CommandArgs } from "./base_command";
import _logger from "../logger";
const logger = _logger("play");

class PlayCommand implements BaseCommand {
    call({ message, db, gameSessions, guildPreference, client }: CommandArgs) {
        if (!message.member.voice.channel) {
            sendErrorMessage(message,
                "Join a voice channel",
                `Send \`${guildPreference.getBotPrefix()}play\` again when you are in a voice channel.`);
            logger.warn(`${getDebugContext(message)} | User not in voice channel`);
        }
        else {
            if (!gameSessions[message.guild.id]) {
                gameSessions[message.guild.id] = new GameSession();
                logger.info(`${getDebugContext(message)} | Game session created`);
            }
            startGame(gameSessions[message.guild.id], guildPreference, db, message, client);
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
