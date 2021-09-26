import _ from "lodash";
import { isMaster } from "cluster";
import { config } from "dotenv";
import path from "path";
import { Fleet, Options } from "eris-fleet";
import fs from "fs";
import Eris from "eris";
import schedule from "node-schedule";
import fastify from "fastify";
import pointOfView from "point-of-view";
import ejs from "ejs";
import { getInternalLogger } from "./logger";
import { clearClusterActivityStats, clearRestartNotification } from "./helpers/management_utils";
import storeDailyStats from "./scripts/store-daily-stats";
import dbContext from "./database_context";
import { reloadFactCache } from "./fact_generator";
import { EnvType } from "./types";
import { seedAndDownloadNewSongs } from "./seed/seed_db";
import { EMBED_ERROR_COLOR, EMBED_SUCCESS_COLOR, sendDebugAlertWebhook } from "./helpers/discord_utils";
import { KmqImages } from "./constants";
import KmqClient from "./kmq_client";
import backupKmqDatabase from "./scripts/backup-kmq-database";
import LeaderboardCommand, { LeaderboardDuration } from "./commands/game_commands/leaderboard";
import { userVoted } from "./helpers/bot_listing_manager";
import { friendlyFormattedDate } from "./helpers/utils";

const logger = getInternalLogger();

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
    // every first of the month at 12am UTC => 7pm EST
    schedule.scheduleJob("0 0 1 * *", async () => {
        LeaderboardCommand.sendDebugLeaderboard(LeaderboardDuration.MONTHLY);
    });

    // every sunday at 1am UTC => 8pm saturday EST
    schedule.scheduleJob("0 1 * * 0", async () => {
        if (process.env.NODE_ENV !== EnvType.PROD) return;
        logger.info("Backing up kmq database");
        await backupKmqDatabase();
    });

    // every sunday at 12am UTC => saturday 7pm EST
    schedule.scheduleJob("0 0 * * SUN", async () => {
        LeaderboardCommand.sendDebugLeaderboard(LeaderboardDuration.WEEKLY);
    });

    // everyday at 12am UTC => 7pm EST
    schedule.scheduleJob("0 0 * * *", async () => {
        LeaderboardCommand.sendDebugLeaderboard(LeaderboardDuration.DAILY);
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

    // every minute
    schedule.scheduleJob("* * * * *", async () => {
        await dbContext.kmq("system_stats")
            .insert({
                stat_name: "request_latency",
                stat_value: fleet.eris.requestHandler.latencyRef.latency,
                date: new Date(),
            });
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

/** Starts web server */
async function startWebServer(fleet: Fleet) {
    const httpServer = fastify({});
    httpServer.register(pointOfView, {
        engine: {
            ejs,
        },
    });

    httpServer.post("/voted", {}, async (request, reply) => {
        const requestAuthorizationToken = request.headers["authorization"];
        if (requestAuthorizationToken !== process.env.TOP_GG_WEBHOOK_AUTH) {
            logger.warn("Webhook received with non-matching authorization token");
            reply.code(401).send();
            return;
        }

        const userID = request.body["user"];
        await userVoted(userID);
        reply.code(200).send();
    });

    httpServer.get("/stats", async (request, reply) => {
        const fleetStats = (await fleet.collectStats());
        const clusterData = [];
        for (const cluster of fleetStats.clusters) {
            const shardData = cluster.shards.map((rawShardData) => {
                let healthIndicator = 0;
                if (rawShardData.ready === false) healthIndicator = 2;
                else if (rawShardData.latency > 300) healthIndicator = 1;
                else healthIndicator = 0;
                return {
                    latency: rawShardData.latency,
                    status: rawShardData.status,
                    members: rawShardData.members,
                    id: rawShardData.id,
                    guilds: rawShardData.guilds,
                    healthIndicator,
                };
            });

            clusterData.push({
                id: cluster.id,
                ipcLatency: cluster.ipcLatency,
                uptime: friendlyFormattedDate(new Date(Date.now() - cluster.uptime)),
                voiceConnections: cluster.voice,
                shardData,
            });
        }

        const requestLatency = fleetStats.centralRequestHandlerLatencyRef.latency;
        let requestLatencyHealthIndicator = 0;
        if (requestLatency < 500) requestLatencyHealthIndicator = 0;
        else if (requestLatency < 1000) requestLatencyHealthIndicator = 1;
        else requestLatencyHealthIndicator = 2;
        const overallStatsData = {
            requestLatency: {
                latency: requestLatency,
                healthIndicator: requestLatencyHealthIndicator,
            },
            totalUsers: fleetStats.users,
            totalVoiceConnections: fleetStats.voice,
            totalRAM: Math.ceil(fleetStats.totalRam),
        };

        return reply.view("../templates/index.ejs", { clusterData, overallStatsData });
    });

    try {
        await httpServer.listen(process.env.WEB_SERVER_PORT, "0.0.0.0");
    } catch (err) {
        logger.error(`Erroring starting HTTP server: ${err}`);
    }
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
        fleet.eris.on("debug", (m) => logger.debug(m));
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
        await startWebServer(fleet);

        logger.info("Registering process event handlers...");
        registerProcessEvents(fleet);

        logger.info("Clearing existing restart notifications...");
        await clearRestartNotification();
        await clearClusterActivityStats();

        logger.info("Registering global intervals");
        registerGlobalIntervals(fleet);
    }
})();
