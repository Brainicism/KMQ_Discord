import { state } from "../../kmq";
import _logger from "../../logger";
import { updateBotStatus } from "../../helpers/management_utils";
const logger = _logger("ready");


export default function readyHandler() {
    const client = state.client;
    updateBotStatus();
    logger.info(`Logged in as ${client.user.username}#${client.user.discriminator}! in '${process.env.NODE_ENV}' mode`);
}
