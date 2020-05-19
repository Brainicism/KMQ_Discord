import BaseCommand, { CommandArgs } from "./base_command";
import { sendSongMessage, disconnectVoiceConnection, sendInfoMessage, getDebugContext } from "../helpers/utils";
const logger = require("../logger")("end");

class EndCommand implements BaseCommand {
    call({ client, gameSessions, message }: CommandArgs) {
        let gameSession = gameSessions[message.guild.id];
        if (!gameSession) {
            return;
        }
        if (gameSession.gameInSession()) {
            sendSongMessage(message, gameSession, true);
        }
        if (!gameSession.scoreboard.isEmpty()) {
            logger.info(`${getDebugContext(message)} | Game session ended, non-empty`);
            sendInfoMessage(message, gameSession.scoreboard.getWinnerMessage())
        }
        else if (gameSession.gameInSession()) {
            logger.info(`${getDebugContext(message)} | Game session ended, empty`);
            sendInfoMessage(message, "Nobody won :(")
        }
        disconnectVoiceConnection(client, message);
        gameSession.finished = true;
        delete gameSessions[message.guild.id];
    }
    help = {
        name: "end",
        description: "Finishes the current game and decides on a winner.",
        usage: "!end",
        arguments: []
    }
}

export default EndCommand;