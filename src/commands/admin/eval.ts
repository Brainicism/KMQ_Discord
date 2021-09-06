import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    sendErrorMessage, sendInfoMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import { state } from "../../kmq";
import MessageContext from "../../structures/message_context";
import { debugChannelPrecheck } from "../../command_prechecks";

const logger = new IPCLogger("eval");

export default class EvalCommand implements BaseCommand {
    preRunChecks = [{ checkFn: debugChannelPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const evalString = parsedMessage.argument;
        logger.info(`Executing command: ${evalString}`);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const evalFunc = function executeEval(command: string) {
            try {
                // eslint-disable-next-line no-eval
                const result = eval(command);
                sendInfoMessage(MessageContext.fromMessage(message), { title: evalString, description: result === undefined ? "undefined" : JSON.stringify(result) });
            } catch (e) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: evalString, description: e.toString() });
            }
        }.call(state, evalString);
    };
}
