import { state } from "../../kmq";
import { IPCLogger } from "../../logger";
import { updateBotStatus } from "../../helpers/management_utils";

const logger = new IPCLogger("ready");

export default function readyHandler() {
    const { client } = state;
    updateBotStatus();
    logger.info(`Logged in as ${client.user.username}#${client.user.discriminator}! in '${process.env.NODE_ENV}' mode (${(Date.now() - state.processStartTime) / 1000}s)`);
}
