import _ from "lodash";
import isMaster from "cluster";
import os from "os";
import { config } from "dotenv";
import path from "path";
import type { Options, Stats } from "eris-fleet";
import { Fleet } from "eris-fleet";
import fs from "fs";
import Eris from "eris";
import schedule from "node-schedule";
import fastify from "fastify";
import pointOfView from "point-of-view";
import ejs from "ejs";
import fastifyResponseCaching from "fastify-response-caching";
import { getInternalLogger } from "./logger";
import { clearRestartNotification } from "./helpers/management_utils";
import storeDailyStats from "./scripts/store-daily-stats";
import dbContext from "./database_context";
import { EnvType } from "./enums/env_type";
import { seedAndDownloadNewSongs } from "./seed/seed_db";
import { sendDebugAlertWebhook } from "./helpers/discord_utils";
import { EMBED_ERROR_COLOR, EMBED_SUCCESS_COLOR, KmqImages } from "./constants";
import KmqClient from "./kmq_client";
import backupKmqDatabase from "./scripts/backup-kmq-database";
import { userVoted } from "./helpers/bot_listing_manager";
import { standardDateFormat } from "./helpers/utils";

const logger = getInternalLogger();

config({ path: path.resolve(__dirname, "../.env") });

enum HealthIndicator {
    HEALTHY = 0,
    WARNING = 1,
    UNHEALTHY = 2,
}

const ERIS_INTENTS = Eris.Constants.Intents;
const options: Options = {
    whatToLog: {
        blacklist: ["stats_update"],
    },
    path: path.join(__dirname, "./kmq_worker.js"),
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
        intents:
            ERIS_INTENTS.guilds ^
            ERIS_INTENTS.guildVoiceStates ^
            ERIS_INTENTS.guildMessages ^
            ERIS_INTENTS.guildMessageReactions,
    },
    fetchTimeout: 5000,
    customClient: KmqClient,
    useCentralRequestHandler: true,
};

function registerGlobalIntervals(fleet: Fleet): void {
    // every sunday at 1am UTC => 8pm saturday EST
    schedule.scheduleJob("0 1 * * 0", async () => {
        if (process.env.NODE_ENV !== EnvType.PROD) return;
        logger.info("Backing up kmq database");
        await backupKmqDatabase();
    });

    // everyday at 12am UTC => 7pm EST
    schedule.scheduleJob("0 0 * * *", () => {
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
            stat_name: "request_latency",
            stat_value: fleet.eris.requestHandler.latencyRef.latency,
            date: new Date(),
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
                    latency: rawShardData.latency,
                    status: rawShardData.status,
                    members: rawShardData.members.toLocaleString(),
                    id: rawShardData.id,
                    guilds: rawShardData.guilds.toLocaleString(),
                    healthIndicator,
                };
            });

            clusterData.push({
                id: cluster.id,
                ram: Math.ceil(cluster.ram).toLocaleString(),
                apiLatency: _.mean(
                    cluster.shards.map((x) => x.latency)
                ).toLocaleString(),
                uptime: standardDateFormat(
                    new Date(Date.now() - cluster.uptime)
                ),
                voiceConnections: cluster.voice,
                activeGameSessions: gameplayStats.get(i).activeGameSessions,
                activePlayers: gameplayStats.get(i).activePlayers,
                shardData,
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
            requestLatency: {
                latency: requestLatency,
                healthIndicator: requestLatencyHealthIndicator,
            },
            loadAverage: {
                loadAverage: loadAvg.map((x) => x.toFixed(2)).join(", "),
                healthIndicator: loadAvgHealthIndicator,
            },
            cachedUsers: fleetStats.users.toLocaleString(),
            totalMembers: fleetStats.members.toLocaleString(),
            totalVoiceConnections: fleetStats.voice,
            totalRAM: Math.ceil(fleetStats.totalRam).toLocaleString(),
            lastUpdated: new Date(),
            shardCount: fleetStats.shardCount,
            totalActiveGameSessions: clusterData.reduce(
                (x, y) => x + y.activeGameSessions,
                0
            ),
            totalActivePlayers: clusterData.reduce(
                (x, y) => x + y.activePlayers,
                0
            ),
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
