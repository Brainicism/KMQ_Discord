import { IPCLogger } from "../../logger";
import { sendInfoMessage } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type Eris from "eris";

const logger = new IPCLogger("eval");

export default class EvalCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.debugChannelPrecheck }];

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

        sendInfoMessage(MessageContext.fromMessage(message), {
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
