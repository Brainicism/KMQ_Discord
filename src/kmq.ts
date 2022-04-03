import { isMaster } from "cluster";
import { config } from "dotenv";
import ejs from "ejs";
import Eris from "eris";
import { Fleet, Options, Stats } from "eris-fleet";
import fastify from "fastify";
import fastifyResponseCaching from "fastify-response-caching";
import fs from "fs";
import _ from "lodash";
import schedule from "node-schedule";
import os from "os";
import path from "path";
import pointOfView from "point-of-view";

import { KmqImages } from "./constants";
import dbContext from "./database_context";
import { userVoted } from "./helpers/bot_listing_manager";
import {
    EMBED_ERROR_COLOR,
    EMBED_SUCCESS_COLOR,
    sendDebugAlertWebhook,
} from "./helpers/discord_utils";
import { clearRestartNotification } from "./helpers/management_utils";
import { standardDateFormat } from "./helpers/utils";
import KmqClient from "./kmq_client";
import { getInternalLogger } from "./logger";
import backupKmqDatabase from "./scripts/backup-kmq-database";
import storeDailyStats from "./scripts/store-daily-stats";
import { seedAndDownloadNewSongs } from "./seed/seed_db";
import { EnvType } from "./types";

const logger = getInternalLogger();

config({ path: path.resolve(__dirname, "../.env") });

enum HealthIndicator {
    HEALTHY = 0,
    WARNING = 1,
    UNHEALTHY = 2,
}

const ERIS_INTENTS = Eris.Constants.Intents;
const options: Options = {
    clientOptions: {
        disableEvents: {
            CHANNEL_PINS_UPDATE: true,
            GUILD_BAN_ADD: true,
            GUILD_BAN_REMOVE: true,
            GUILD_ROLE_DELETE: true,
            MESSAGE_DELETE: true,
            MESSAGE_DELETE_BULK: true,
            MESSAGE_REACTION_REMOVE: true,
            MESSAGE_REACTION_REMOVE_ALL: true,
            MESSAGE_REACTION_REMOVE_EMOJI: true,
            MESSAGE_UPDATE: true,
            TYPING_START: true,
        },
        intents:
            ERIS_INTENTS.guilds ^
            ERIS_INTENTS.guildVoiceStates ^
            ERIS_INTENTS.guildMessages ^
            ERIS_INTENTS.guildMessageReactions,
        maxShards: "auto" as const,
        messageLimit: 0,
        restMode: true,
    },
    customClient: KmqClient,
    fetchTimeout: 5000,
    path: path.join(__dirname, "./kmq_worker.js"),
    token: process.env.BOT_TOKEN,
    useCentralRequestHandler: true,
    whatToLog: {
        blacklist: ["stats_update"],
    },
};

function registerGlobalIntervals(fleet: Fleet): void {
    // every sunday at 1am UTC => 8pm saturday EST
    schedule.scheduleJob("0 1 * * 0", async () => {
        if (process.env.NODE_ENV !== EnvType.PROD) return;
        logger.info("Backing up kmq database");
        await backupKmqDatabase();
    });

    // everyday at 12am UTC => 7pm EST
    schedule.scheduleJob("0 0 * * *", async () => {
        storeDailyStats(fleet.stats?.guilds);
    });

    // every hour
    schedule.scheduleJob("15 * * * *", async () => {
        if (process.env.NODE_ENV !== EnvType.PROD) return;
        logger.info("Performing regularly scheduled Daisuki database seed");
        const overrideFileExists = fs.existsSync(
            path.join(__dirname, "../data/skip_seed")
        );

        if (overrideFileExists) {
            return;
        }

        try {
            await seedAndDownloadNewSongs(dbContext);
        } catch (e) {
            sendDebugAlertWebhook(
                "Download and seed failure",
                e.toString(),
                EMBED_ERROR_COLOR,
                KmqImages.NOT_IMPRESSED
            );
        }
    });

    // every minute
    schedule.scheduleJob("* * * * *", async () => {
        await dbContext.kmq("system_stats").insert({
            date: new Date(),
            stat_name: "request_latency",
            stat_value: fleet.eris.requestHandler.latencyRef.latency,
        });
    });
}

function registerProcessEvents(fleet: Fleet): void {
    process.on("unhandledRejection", (error: Error) => {
        logger.error(
            `Admiral Unhandled Rejection at: Reason: ${error.message}. Trace: ${error.stack}`
        );
    });

    process.on("uncaughtException", (err: Error) => {
        logger.error(
            `Admiral Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`
        );
    });

    process.on("SIGINT", () => {
        logger.info("Received SIGINT. Shutting down");
        fleet.totalShutdown(false);
    });
}

/**
 * @param fleet - The fleet instance
 * Starts web server
 * */
async function startWebServer(fleet: Fleet): Promise<void> {
    const httpServer = fastify({});
    httpServer.register(pointOfView, {
        engine: {
            ejs,
        },
    });

    httpServer.register(fastifyResponseCaching, { ttl: 5000 });

    httpServer.post("/voted", {}, async (request, reply) => {
        const requestAuthorizationToken = request.headers["authorization"];
        if (requestAuthorizationToken !== process.env.TOP_GG_WEBHOOK_AUTH) {
            logger.warn(
                "Webhook received with non-matching authorization token"
            );
            reply.code(401).send();
            return;
        }

        const userID = request.body["user"];
        await userVoted(userID);
        reply.code(200).send();
    });

    httpServer.get("/status", async (request, reply) => {
        if (fleet.stats.guilds === 0) {
            return "KMQ is still starting up. Check back in a few minutes!";
        }

        let gameplayStats: Map<number, any>;
        let fleetStats: Stats;
        try {
            gameplayStats = (await fleet.ipc.allClustersCommand(
                "game_session_stats",
                true
            )) as Map<number, any>;
            fleetStats = await fleet.collectStats();
        } catch (e) {
            logger.error(`Error fetching stats for status page. err = ${e}`);
            return "Couldn't retrieve status information. Please try again later.";
        }

        const clusterData = [];
        for (let i = 0; i < fleetStats.clusters.length; i++) {
            const cluster = fleetStats.clusters[i];
            const shardData = cluster.shards.map((rawShardData) => {
                let healthIndicator: HealthIndicator;
                if (rawShardData.ready === false)
                    healthIndicator = HealthIndicator.UNHEALTHY;
                else if (rawShardData.latency > 300)
                    healthIndicator = HealthIndicator.WARNING;
                else healthIndicator = HealthIndicator.HEALTHY;
                return {
                    guilds: rawShardData.guilds.toLocaleString(),
                    healthIndicator,
                    id: rawShardData.id,
                    latency: rawShardData.latency,
                    members: rawShardData.members.toLocaleString(),
                    status: rawShardData.status,
                };
            });

            clusterData.push({
                activeGameSessions: gameplayStats.get(i).activeGameSessions,
                activePlayers: gameplayStats.get(i).activePlayers,
                apiLatency: _.mean(
                    cluster.shards.map((x) => x.latency)
                ).toLocaleString(),
                id: cluster.id,
                ram: Math.ceil(cluster.ram).toLocaleString(),
                shardData,
                uptime: standardDateFormat(
                    new Date(Date.now() - cluster.uptime)
                ),
                voiceConnections: cluster.voice,
            });
        }

        const requestLatency =
            fleetStats.centralRequestHandlerLatencyRef.latency;

        let requestLatencyHealthIndicator: HealthIndicator;
        if (requestLatency < 500)
            requestLatencyHealthIndicator = HealthIndicator.HEALTHY;
        else if (requestLatency < 1000)
            requestLatencyHealthIndicator = HealthIndicator.WARNING;
        else requestLatencyHealthIndicator = HealthIndicator.UNHEALTHY;

        const loadAvg = os.loadavg();
        let loadAvgHealthIndicator: HealthIndicator;
        if (loadAvg.some((x) => x > 1))
            loadAvgHealthIndicator = HealthIndicator.UNHEALTHY;
        else if (loadAvg.some((x) => x > 0.5))
            loadAvgHealthIndicator = HealthIndicator.WARNING;
        else loadAvgHealthIndicator = HealthIndicator.HEALTHY;

        const overallStatsData = {
            cachedUsers: fleetStats.users.toLocaleString(),
            lastUpdated: new Date(),
            loadAverage: {
                healthIndicator: loadAvgHealthIndicator,
                loadAverage: loadAvg.map((x) => x.toFixed(2)).join(", "),
            },
            requestLatency: {
                healthIndicator: requestLatencyHealthIndicator,
                latency: requestLatency,
            },
            shardCount: fleetStats.shardCount,
            totalActiveGameSessions: clusterData.reduce(
                (x, y) => x + y.activeGameSessions,
                0
            ),
            totalActivePlayers: clusterData.reduce(
                (x, y) => x + y.activePlayers,
                0
            ),
            totalMembers: fleetStats.members.toLocaleString(),
            totalRAM: Math.ceil(fleetStats.totalRam).toLocaleString(),
            totalVoiceConnections: fleetStats.voice,
        };

        return reply.view("../templates/index.ejs", {
            clusterData,
            overallStatsData,
        });
    });

    try {
        if (!process.env.WEB_SERVER_PORT) {
            logger.warn(
                "WEB_SERVER_PORT not specified, not starting web server"
            );
        } else {
            await httpServer.listen(process.env.WEB_SERVER_PORT, "0.0.0.0");
        }
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
            sendDebugAlertWebhook(
                "Bot started successfully",
                "Shards have connected!",
                EMBED_SUCCESS_COLOR,
                KmqImages.HAPPY
            );
        });

        if (process.env.NODE_ENV === EnvType.CI) return;
        logger.info("Starting web servers...");
        await startWebServer(fleet);

        logger.info("Registering process event handlers...");
        registerProcessEvents(fleet);

        logger.info("Clearing existing restart notifications...");
        await clearRestartNotification();

        logger.info("Registering global intervals");
        registerGlobalIntervals(fleet);
    }
})();
