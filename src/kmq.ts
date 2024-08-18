/* eslint-disable no-await-in-loop */
import {
    EMBED_SUCCESS_COLOR,
    IGNORED_WARNING_SUBSTRINGS,
    KmqImages,
    STANDBY_COOKIE,
    STATUS_COOKIE,
} from "./constants";
import { Fleet } from "eris-fleet";
import { clearRestartNotification } from "./helpers/management_utils";
import { config } from "dotenv";
import {
    delay,
    extractErrorString,
    isPrimaryInstance,
    pathExists,
} from "./helpers/utils";
import { getInternalLogger } from "./logger";
import EnvType from "./enums/env_type";
import Eris from "eris";
import KmqClient from "./kmq_client";
import backupKmqDatabase from "./scripts/backup-kmq-database";
import cluster from "cluster";
import dbContext from "./database_context";
import fs from "fs";

import { sendInfoWebhook } from "./helpers/discord_utils";
import KmqWebServer from "./kmq_web_server";
import path from "path";
import schedule from "node-schedule";
import storeDailyStats from "./scripts/store-daily-stats";
import type { Options } from "eris-fleet";

const logger = getInternalLogger();

config({ path: path.resolve(__dirname, "../.env") });

const ERIS_INTENTS = Eris.Constants.Intents;
const options: Options = {
    whatToLog: {
        blacklist: ["stats_update"],
    },
    services: [
        {
            name: "kmq_service",
            path: path.join(
                __dirname,
                process.env.NODE_ENV === EnvType.DEV_TS_NODE
                    ? "./kmq_service.ts"
                    : "./kmq_service.js",
            ),
        },
    ],
    path: path.join(
        __dirname,
        process.env.NODE_ENV === EnvType.DEV_TS_NODE
            ? "./kmq_worker.ts"
            : "./kmq_worker.js",
    ),
    token: process.env.BOT_TOKEN as string,
    clientOptions: {
        gateway: {
            disableEvents: {
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
            maxShards: "auto" as const,
            intents:
                ERIS_INTENTS.guilds ^
                ERIS_INTENTS.guildVoiceStates ^
                ERIS_INTENTS.guildMessages ^
                ERIS_INTENTS.guildMessageReactions ^
                ERIS_INTENTS.messageContent ^
                ERIS_INTENTS.directMessages,
        },
        restMode: true,
        messageLimit: 0,
        requestTimeout: 15000,
    },
    fetchTimeout: 20000,
    customClient: KmqClient,
    guildsPerShard: process.env.GUILDS_PER_SHARD
        ? parseInt(process.env.GUILDS_PER_SHARD as string, 10)
        : 2000,
    useCentralRequestHandler:
        process.env.CENTRAL_REQUEST_HANDLER_ENABLED === "true",
    softKillNotificationPeriod: 3 * 60 * 1000,
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
        if (await isPrimaryInstance()) {
            logger.info("Saving daily stats");
            await storeDailyStats(fleet.stats?.guilds as number);
        }
    });

    // every minute
    schedule.scheduleJob("* * * * *", async () => {
        const requestLatenciesByCluster = Array.from(
            (await fleet.ipc.allClustersCommand(
                "request_latency",
                true,
            )) as Map<number, number>,
        );

        const useCentralRequestHandler =
            process.env.CENTRAL_REQUEST_HANDLER_ENABLED === "true";

        const averageRequestLatency = useCentralRequestHandler
            ? fleet.eris.requestHandler.latencyRef.latency
            : requestLatenciesByCluster.reduce((a, b) => a + b[1], 0) /
              requestLatenciesByCluster.length;

        if (await isPrimaryInstance()) {
            if (!useCentralRequestHandler) {
                for (const [clusterId, latency] of requestLatenciesByCluster) {
                    await dbContext.kmq
                        .insertInto("system_stats")
                        .values({
                            stat_name: "cluster_request_latency",
                            stat_value: latency,
                            date: new Date(),
                            cluster_id: clusterId,
                        })
                        .execute();
                }
            }

            await dbContext.kmq
                .insertInto("system_stats")
                .values({
                    stat_name: "avg_request_latency",
                    stat_value: averageRequestLatency,
                    date: new Date(),
                })
                .execute();
        }
    });
}

function registerProcessEvents(fleet: Fleet): void {
    process.on("unhandledRejection", (err: Error) => {
        logger.error(
            `Admiral Unhandled Rejection | ${extractErrorString(err)}}`,
        );
    });

    process.on("uncaughtException", (err: Error) => {
        logger.error(`Admiral Uncaught Exception | ${extractErrorString(err)}`);
    });

    process.on("SIGINT", () => {
        logger.info("Received SIGINT. Shutting down");
        fleet.totalShutdown(true);
    });
}

(() => {
    let fleet: Fleet;
    try {
        fleet = new Fleet(options);
    } catch (e) {
        logger.error(`Unable to start fleet. Error = ${e}`);
        process.exit(1);
    }

    if (cluster.isPrimary) {
        fleet.on("log", (m) => logger.info(m));
        fleet.on("debug", (m) => logger.debug(m));
        fleet.eris.on("debug", (m) => logger.debug(m));
        fleet.on("warn", (m) => {
            if (
                IGNORED_WARNING_SUBSTRINGS.some((warningSubstring) => {
                    if (m instanceof Error) {
                        return m.message.includes(warningSubstring);
                    }

                    return m.includes(warningSubstring);
                })
            ) {
                return;
            }

            logger.warn(m);
        });
        fleet.on("error", (m) => logger.error(m));
        fleet.on("abort", () => {
            logger.error("Cluster manager received abort...");
            process.exit(1);
        });

        fleet.on("ready", async () => {
            logger.info("All shards have connected.");

            // check if current instance is a standby currently being spun up, assign ready state
            // as all shards are now ready
            if (await pathExists(STANDBY_COOKIE)) {
                await fs.promises.writeFile(STANDBY_COOKIE, "ready");

                // wait for upgrade workflow to promote to primary by deleting standby cookie
                while (await pathExists(STANDBY_COOKIE)) {
                    logger.info("Standby waiting for promotion...");
                    await delay(2000);
                }
            }

            // inform workers to begin accepting commands
            await fleet.ipc.allClustersCommand("activate");

            await sendInfoWebhook(
                process.env.ALERT_WEBHOOK_URL!,
                "Bot started successfully",
                "Shards have connected!",
                EMBED_SUCCESS_COLOR,
                KmqImages.HAPPY,
                "Kimiqo",
            );

            logger.info("Starting web server...");
            await new KmqWebServer(dbContext).startWebServer(fleet);

            // notify that the current instance is now ready
            await fs.promises.writeFile(STATUS_COOKIE, "ready");

            logger.info("Registering process event handlers...");
            registerProcessEvents(fleet);

            logger.info("Clearing existing restart notifications...");
            clearRestartNotification();

            logger.info("Registering global intervals");
            registerGlobalIntervals(fleet);
        });
    }
})();
