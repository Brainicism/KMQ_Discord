import { isMaster } from "cluster";
import { config } from "dotenv";
import path from "path";
import { Fleet } from "eris-fleet";
import Eris from "eris";
import _logger from "./logger";
import { clearRestartNotification, initializeBotStatsPoster, registerProcessEvents, startWebServer } from "./helpers/management_utils";

const logger = _logger("index");

config({ path: path.resolve(__dirname, "../.env") });
const ERIS_INTENTS = Eris.Constants.Intents;
const options = {
    path: path.join(__dirname, "./kmq.js"),
    token: process.env.BOT_TOKEN,
    clientOptions: {
        disableEvents: {
            GUILD_ROLE_DELETE: true,
            CHANNEL_PINS_UPDATE: true,
            MESSAGE_UPDATE: true,
            MESSAGE_DELETE: true,
            MESSAGE_DELETE_BULK: true,
            MESSAGE_REACTION_REMOVE: true,
            MESSAGE_REACTION_REMOVE_ALL: true,
            MESSAGE_REACTION_REMOVE_EMOJI: true,
            GUILD_BAN_ADD: true,
            GUILD_BAN_REMOVE: true,
            TYPING_START: true,
        },
        restMode: true,
        maxShards: "auto" as const,
        messageLimit: 0,
        useMaxConcurrency: true,
        intents: ERIS_INTENTS.guilds ^ ERIS_INTENTS.guildVoiceStates ^ ERIS_INTENTS.guildMessages ^ ERIS_INTENTS.guildMessageReactions,
    },
};

(async () => {
    const Admiral = new Fleet(options);
    if (isMaster) {
        Admiral.on("log", (m) => logger.info(m));
        Admiral.on("debug", (m) => logger.debug(m));
        Admiral.on("warn", (m) => logger.warn(m));
        Admiral.on("error", (m) => logger.error(m));

        // Logs stats when they arrive
        Admiral.on("stats", (m) => logger.log(m));

        logger.info("Starting web servers...");
        await startWebServer();

        logger.info("Registering process event handlers...");
        registerProcessEvents();

        logger.info("Initializing bot stats poster...");
        initializeBotStatsPoster();

        logger.info("Clearing existing restart notifications...");
        await clearRestartNotification();
    }
})();
