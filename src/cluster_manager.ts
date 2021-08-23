import { isMaster } from "cluster";
import { config } from "dotenv";
import path from "path";
import { Fleet, Options } from "eris-fleet";
import fs from "fs";
import Eris from "eris";
import schedule from "node-schedule";
import { getInternalLogger } from "./logger";
import { clearClusterActivityStats, clearRestartNotification, startWebServer } from "./helpers/management_utils";
import storeDailyStats from "./scripts/store-daily-stats";
import dbContext from "./database_context";
import { reloadFactCache } from "./fact_generator";
import { EnvType } from "./types";
import { seedAndDownloadNewSongs } from "./seed/seed_db";
import { EMBED_ERROR_COLOR, EMBED_SUCCESS_COLOR, sendDebugAlertWebhook } from "./helpers/discord_utils";
import { KmqImages } from "./constants";
import KmqClient from "./kmq_client";

const logger = getInternalLogger("cluster_manager");

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
        intents: ERIS_INTENTS.guilds ^ ERIS_INTENTS.guildVoiceStates ^ ERIS_INTENTS.guildMessages ^ ERIS_INTENTS.guildMessageReactions,
    },
    customClient: KmqClient,
    useCentralRequestHandler: true,
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

        try {
            await seedAndDownloadNewSongs(dbContext);
        } catch (e) {
            sendDebugAlertWebhook("Download and seed failure", e.toString(), EMBED_ERROR_COLOR, KmqImages.NOT_IMPRESSED);
        }
    });
}

function registerProcessEvents(fleet: Fleet) {
    process.on("unhandledRejection", (error: Error) => {
        logger.error(`Admiral Unhandled Rejection at: Reason: ${error.message}. Trace: ${error.stack}`);
    });

    process.on("uncaughtException", (err: Error) => {
        logger.error(`Admiral Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`);
    });

    process.on("SIGINT", () => {
        logger.info("Received SIGINT. Shutting down");
        fleet.totalShutdown(false);
    });
}

(async () => {
    let fleet: Fleet;
    try {
        fleet = new Fleet(options);
    } catch (e) {
        logger.error(`Unable to start fleet. Error = ${e}`);
        process.exit(1);
    }

    if (isMaster) {
        fleet.on("log", (m) => logger.info(m));
        fleet.on("debug", (m) => logger.debug(m));
        fleet.on("warn", (m) => logger.warn(m));
        fleet.on("error", (m) => logger.error(m));
        fleet.on("abort", () => {
            logger.error("Cluster manager received abort...");
            process.exit(1);
        });

        fleet.on("ready", () => {
            logger.info("All shards have connected.");
            sendDebugAlertWebhook("Bot started successfully", "Shards have connected!", EMBED_SUCCESS_COLOR, KmqImages.HAPPY);
        });

        if (process.env.NODE_ENV === EnvType.CI) return;
        logger.info("Starting web servers...");
        await startWebServer();

        logger.info("Registering process event handlers...");
        registerProcessEvents(fleet);

        logger.info("Clearing existing restart notifications...");
        await clearRestartNotification();
        await clearClusterActivityStats();

        logger.info("Registering global intervals");
        registerGlobalIntervals(fleet);
    }
})();
