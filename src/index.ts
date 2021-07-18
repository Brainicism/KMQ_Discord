import { isMaster } from "cluster";
import { config } from "dotenv";
import path from "path";
import { Fleet, Options } from "eris-fleet";
import fs from "fs";
import Eris from "eris";
import schedule from "node-schedule";
import _logger from "./logger";
import { clearRestartNotification, registerProcessEvents, startWebServer } from "./helpers/management_utils";
import storeDailyStats from "./scripts/store-daily-stats";
import dbContext from "./database_context";
import { reloadFactCache } from "./fact_generator";
import { EnvType } from "./types";
import { seedAndDownloadNewSongs } from "./seed/seed_db";
import BotListingManager from "./helpers/bot_listing_manager";

const logger = _logger("index");

config({ path: path.resolve(__dirname, "../.env") });
const ERIS_INTENTS = Eris.Constants.Intents;
const options: Options = {
    whatToLog: {
        blacklist: ["stats_update"],
    },
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

function registerGlobalIntervals(fleet: Fleet) {
    // everyday at 12am UTC => 7pm EST
    schedule.scheduleJob("0 0 * * *", async () => {
        storeDailyStats(fleet.stats?.guilds);
        reloadFactCache();
    });

    // every hour
    schedule.scheduleJob("15 * * * *", async () => {
        if (process.env.NODE_ENV !== EnvType.PROD) return;
        logger.info("Performing regularly scheduled Daisuki database seed");
        const overrideFileExists = fs.existsSync(path.join(__dirname, "../../data/skip_seed"));
        if (overrideFileExists) {
            return;
        }
        await seedAndDownloadNewSongs(dbContext);
    });
}

(async () => {
    const fleet = new Fleet(options);
    if (isMaster) {
        fleet.on("log", (m) => logger.info(m));
        fleet.on("debug", (m) => logger.debug(m));
        fleet.on("warn", (m) => logger.warn(m));
        fleet.on("error", (m) => logger.error(m));

        logger.info("Starting web servers...");
        await startWebServer();

        logger.info("Registering process event handlers...");
        registerProcessEvents();

        logger.info("Initializing bot stats poster...");
        const botListingManager = new BotListingManager();
        botListingManager.start();

        logger.info("Clearing existing restart notifications...");
        await clearRestartNotification();

        logger.info("Registering global intervals");
        registerGlobalIntervals(fleet);
    }
})();
