import Eris from "eris";
import { config } from "dotenv";
import { resolve } from "path";
import _logger from "./logger";
import { EnvType, State } from "./types";
import {
    registerClientEvents, registerProcessEvents, registerCommands, registerIntervals,
    initializeBotStatsPoster, reloadCaches, clearRestartNotification,
} from "./helpers/management_utils";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("kmq");
config({ path: resolve(__dirname, "../.env") });

const ERIS_INTENTS = Eris.Constants.Intents;

const state: State = {
    commands: {},
    gameSessions: {},
    botListingManager: null,
    client: null,
    aliases: {
        artist: {
            matchAliases: {},
            guessAliases: {},
        },
        song: {},
    },
    processStartTime: Date.now(),
    bonusUsers: new Set(),
};

export default state;

(async () => {
    if (require.main === module) {
        logger.info("Registering commands...");
        if ([EnvType.CI, EnvType.DRY_RUN].includes(process.env.NODE_ENV as EnvType)) {
            await registerCommands(true);
        } else {
            registerCommands(true);
        }
        logger.info("Registering event loops...");
        registerIntervals();
        logger.info("Registering process event handlers...");
        registerProcessEvents();

        if ([EnvType.CI, EnvType.DRY_RUN].includes(process.env.NODE_ENV as EnvType)) {
            logger.info("Dry run finished successfully.");
            process.exit(0);
        }

        logger.info("Loading cached application data...");
        reloadCaches();

        logger.info("Initializing bot stats poster...");
        initializeBotStatsPoster();

        logger.info("Clearing existing restart notifications...");
        await clearRestartNotification();

        state.client = new Eris.Client(process.env.BOT_TOKEN, {
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
            maxShards: "auto",
            messageLimit: 0,
            useMaxConcurrency: true,
            intents: ERIS_INTENTS.guilds ^ ERIS_INTENTS.guildVoiceStates ^ ERIS_INTENTS.guildMessages ^ ERIS_INTENTS.guildMessageReactions,
        });

        logger.info("Registering client event handlers...");
        registerClientEvents();

        state.client.connect();
    }
})();
