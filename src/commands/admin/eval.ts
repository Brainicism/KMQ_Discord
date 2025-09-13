import { IPCLogger } from "../../logger.js";
import { sendInfoMessage } from "../../helpers/discord_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import MessageContext from "../../structures/message_context.js";
import State from "../../state.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type Eris from "eris";

const logger = new IPCLogger("eval");

export default class EvalCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.userAdminPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const evalString = parsedMessage.argument;
        logger.info(`Executing command: ${evalString}`);
        const results = (await State.ipc.allClustersCommand(
            `eval|${evalString}`,
            true,
        )) as Map<number, any>;

        const clusterResultFields: Array<Eris.EmbedField> = Array.from(
            results.entries(),
        ).map(([clusterID, result]) => ({
            name: `Cluster #${clusterID}`,
            value: JSON.stringify(result),
        }));

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: evalString,
            fields: clusterResultFields,
        });
    };

    static eval(evalString: string): Promise<string> {
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
            }.call(State, evalString);
        });
    }
}
