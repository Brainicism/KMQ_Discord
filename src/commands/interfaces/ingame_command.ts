import { areUserAndBotInSameVoiceChannel, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import { GuildTextableMessage, GameType } from "../../types";
import BaseCommand, { CallFunc } from "./base_command";
import { IPCLogger } from "../../logger";
import GameSession from "../../structures/game_session";

const logger = new IPCLogger("ingame_command");

export default abstract class InGameCommand implements BaseCommand {
    abstract call: CallFunc;
    preRunCheck = async (message: GuildTextableMessage, gameSession: GameSession) => {
        if (!gameSession) {
            return false;
        }
        if (!areUserAndBotInSameVoiceChannel(message)) {
            if (gameSession.gameType === GameType.ELIMINATION || gameSession.gameType === GameType.TEAMS) {
                if (!gameSession.sessionInitialized) {
                    // The bot doesn't join the voice channel until after ,begin is called;
                    // players should still be able ,end before that happens in these game modes
                    return true;
                }
            }
            logger.warn(`${getDebugLogHeader(message)} | User and bot are not in the same voice connection`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Wait...", description: "You must be in the same voice channel as the bot to use this command." });
            return false;
        }
        return true;
    };
}
