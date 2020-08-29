import { state } from "../../kmq";
import BotStatsPoster from "../../helpers/bot_stats_poster";
import _logger from "../../logger";
const logger = _logger("ready");


export default function ready() {
    const client = state.client;
    if (state.botStatsPoster === null) {
        state.botStatsPoster = new BotStatsPoster(client);
        state.botStatsPoster.start();
    }
    logger.info(`Logged in as ${client.user.username}#${client.user.discriminator}! in '${process.env.NODE_ENV}' mode`);
}
