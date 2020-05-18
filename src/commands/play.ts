import GameSession from "../models/game_session";
import { sendErrorMessage, startGame, getDebugContext } from "../helpers/utils";
const logger = require("../logger")("play");

function call({ message, db, gameSessions, guildPreference, client }) {
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
const aliases = ["random"]
const help = {
    name: "play",
    description: "Bot plays a random song in VC; type in your guess first to get a point.",
    usage: "!play",
    arguments: []
}

export {
    call,
    aliases,
    help
}

