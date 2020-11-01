import BaseCommand, { CommandArgs } from "../base_command";
import {
    getDebugChannel, getDebugContext, sendErrorMessage, sendInfoMessage,
} from "../../helpers/discord_utils";
import _logger from "../../logger";
import state from "../../kmq";

const logger = _logger("eval");

export default class EvalCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const kmqDebugChannel = getDebugChannel();
        if (!kmqDebugChannel || message.channel.id !== kmqDebugChannel.id) {
            sendErrorMessage(message, "Error", "You are not allowed to eval in this channel");
            logger.warn(`${getDebugContext(message)} | Attempted to eval in non-debug channel`);
            return;
        }

        const evalString = parsedMessage.argument;
        logger.info(`Executing command: ${evalString}`);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const evalFunc = function executeEval(command: string) {
            try {
                // eslint-disable-next-line no-eval
                const result = eval(command);
                sendInfoMessage(message, evalString, result === undefined ? "undefined" : JSON.stringify(result));
            } catch (e) {
                sendErrorMessage(message, evalString, e.toString());
            }
        }.call(state, evalString);
    }
}
