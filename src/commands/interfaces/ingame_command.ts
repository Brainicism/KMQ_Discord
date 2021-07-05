import { areUserAndBotInSameVoiceChannel, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import { GuildTextableMessage } from "../../types";
import BaseCommand, { CallFunc } from "./base_command";
import _logger from "../../logger";

const logger = _logger("ingame_command");

export default abstract class InGameCommand implements BaseCommand {
    abstract call: CallFunc;
    preRunCheck = async (message: GuildTextableMessage) => {
        if (!areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(`${getDebugLogHeader(message)} | User and bot are not in the same voice connection`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Wait...", description: "You must be in the same voice channel as the bot to use this command." });
            return false;
        }
        return true;
    };
}
