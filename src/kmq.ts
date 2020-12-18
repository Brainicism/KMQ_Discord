import Eris from "eris";
import { config } from "dotenv";
import { resolve } from "path";
import _logger from "./logger";
import { EnvType, State } from "./types";
import {
    registerClientEvents, registerProcessEvents, registerCommands, registerIntervals, initializeBotStatsPoster, reloadAliases,
} from "./helpers/management_utils";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("kmq");
config({ path: resolve(__dirname, "../.env") });

const ERIS_INTENTS = Eris.Constants.Intents;
const client = new Eris.Client(process.env.BOT_TOKEN, {
    disableEvents: {
        GUILD_ROLE_DELETE: true,
        CHANNEL_PINS_UPDATE: true,
        MESSAGE_UPDATE: true,
        MESSAGE_DELETE: true,
        MESSAGE_DELETE_BULK: true,
    },
    restMode: true,
    maxShards: "auto",
    messageLimit: 0,
    // eslint-disable-next-line no-bitwise
    intents: ERIS_INTENTS.guilds ^ ERIS_INTENTS.guildVoiceStates ^ ERIS_INTENTS.guildMessages ^ ERIS_INTENTS.guildMessageReactions,
});

const state: State = {
    commands: {},
    gameSessions: {},
    botStatsPoster: null,
    client,
    aliases: {
        artist: {},
        song: {},
    },
};

export default state;

(async () => {
    logger.info("Registering commands...");
    await registerCommands();
    logger.info("Registering event loops...");
    registerIntervals();
    logger.info("Registering client event handlers...");
    registerClientEvents();
    logger.info("Registering process event handlers...");
    registerProcessEvents();

    if (process.env.NODE_ENV === EnvType.DRY_RUN) {
        logger.info("Dry run finished successfully.");
        process.exit(0);
    }

    if (process.env.NODE_ENV === EnvType.PROD) {
        logger.info("Initializing bot stats poster...");
        initializeBotStatsPoster();
    }
    reloadAliases();
    client.connect();
})();
