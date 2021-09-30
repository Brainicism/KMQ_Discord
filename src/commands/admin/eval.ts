import Eris from "eris";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import { state } from "../../kmq";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("eval");

export default class EvalCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.debugChannelPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const evalString = parsedMessage.argument;
        logger.info(`Executing command: ${evalString}`);
        const results = await state.ipc.allClustersCommand(`eval|${evalString}`, true) as Map<number, any>;
        const clusterResultFields: Array<Eris.EmbedField> = Array.from(results.entries()).map(([clusterID, result]) => ({
            name: `Cluster #${clusterID}`,
            value: JSON.stringify(result),
        }));

        sendInfoMessage(MessageContext.fromMessage(message), { title: evalString, fields: clusterResultFields });
    };

    static eval(evalString: string) {
        return new Promise((resolve) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const evalFunc = function executeEval(command: string) {
                try {
                    // eslint-disable-next-line no-eval
                    const result = eval(command);
                    resolve(result);
                } catch (e) {
                    resolve(`Error: ${e.message}`);
                }
            }.call(state, evalString);
        });
    }
}
