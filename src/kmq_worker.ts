/* eslint-disable node/no-sync */
import * as cp from "child_process";
import { BaseClusterWorker } from "eris-fleet";
import { IPCLogger } from "./logger";
import { config } from "dotenv";
import {
    registerIntervals,
    reloadCaches,
    updateBotStatus,
} from "./helpers/management_utils";
import EnvType from "./enums/env_type";
import EvalCommand from "./commands/admin/eval";
import LocalizationManager from "./helpers/localization_manager";
import ReloadCommand from "./commands/admin/reload";
import Session from "./structures/session";
import State from "./state";
import dbContext from "./database_context";
import fs from "fs";
import path from "path";
import schedule from "node-schedule";
import type KmqClient from "./kmq_client";

import BotListingManager from "./helpers/bot_listing_manager";
import SIGINTHandler from "./events/process/SIGINT";
import SpotifyManager from "./helpers/spotify_manager";
import channelDeleteHandler from "./events/client/channelDelete";
import connectHandler from "./events/client/connect";
import debugHandler from "./events/client/debug";
import disconnectHandler from "./events/client/disconnect";
import errorHandler from "./events/client/error";
import guildAvailableHandler from "./events/client/guildAvailable";
import guildCreateHandler from "./events/client/guildCreate";
import guildDeleteHandler from "./events/client/guildDelete";
import interactionCreateHandler from "./events/client/interactionCreate";
import messageCreateHandler from "./events/client/messageCreate";
import shardDisconnectHandler from "./events/client/shardDisconnect";
import shardReadyHandler from "./events/client/shardReady";
import shardResumeHandler from "./events/client/shardResume";
import unavailableGuildCreateHandler from "./events/client/unavailableGuildCreate";
import uncaughtExceptionHandler from "./events/process/uncaughtException";
import unhandledRejectionHandler from "./events/process/unhandledRejection";
import voiceChannelJoinHandler from "./events/client/voiceChannelJoin";
import voiceChannelLeaveHandler from "./events/client/voiceChannelLeave";
import voiceChannelSwitchHandler from "./events/client/voiceChannelSwitch";
import warnHandler from "./events/client/warn";

const logger = new IPCLogger("kmq");
config({ path: path.resolve(__dirname, "../.env") });

export default class BotWorker extends BaseClusterWorker {
    handleCommand = async (commandName: string): Promise<any> => {
        logger.debug(`Received cluster command: ${commandName}`);
        if (commandName.startsWith("eval")) {
            const evalString = commandName.substring(
                commandName.indexOf("|") + 1
            );

            const evalResult = await EvalCommand.eval(evalString);
            return evalResult;
        }

        if (commandName.startsWith("announce_restart")) {
            const components = commandName.split("|");
            components.shift();

            const isSoftRestart = parseInt(components[0], 10) === 1;
            const restartMinutes = parseInt(components[1], 10);

            if (isSoftRestart) {
                State.restartNotification = {
                    soft: isSoftRestart,
                    restartDate: null,
                };
            } else {
                const restartDate = new Date();
                restartDate.setMinutes(
                    restartDate.getMinutes() + restartMinutes
                );

                State.restartNotification = {
                    soft: isSoftRestart,
                    restartDate,
                };
            }

            logger.info(
                `Received restart notification: ${JSON.stringify(
                    State.restartNotification
                )}`
            );

            return null;
        }

        switch (commandName) {
            case "worker_version":
                return State.version;
            case "reload_commands":
                await ReloadCommand.reloadCommands();
                return null;
            case "game_session_stats": {
                const activePlayers = Object.values(State.gameSessions).reduce(
                    (total, curr) =>
                        total +
                        curr.scoreboard
                            .getPlayers()
                            .filter((x) => x.inVC)
                            .map((x) => x.id).length,
                    0
                );

                const activeGameSessions = Object.keys(
                    State.gameSessions
                ).length;

                return {
                    activePlayers,
                    activeGameSessions,
                };
            }

            case "clear_restart":
                if (!State.restartNotification) {
                    logger.warn("No active restart notification to clear");
                    return null;
                }

                if (State.restartNotification.soft) {
                    logger.warn(
                        "Cannot clear restart notification for soft restarts"
                    );
                    return null;
                }

                logger.info("Cleared pending restart notification");
                State.restartNotification = null;
                return null;
            default:
                return null;
        }
    };

    // eslint-disable-next-line class-methods-use-this
    registerClientEvents(client: KmqClient): void {
        // remove listeners registered by eris-fleet, handle on cluster instead
        client.removeAllListeners("warn");
        client.removeAllListeners("error");
        // register listeners
        client
            .on("messageCreate", messageCreateHandler)
            .on("voiceChannelLeave", voiceChannelLeaveHandler)
            .on("voiceChannelSwitch", voiceChannelSwitchHandler)
            .on("voiceChannelJoin", voiceChannelJoinHandler)
            .on("channelDelete", channelDeleteHandler)
            .on("connect", connectHandler)
            .on("error", errorHandler)
            .on("warn", warnHandler)
            .on("shardDisconnect", shardDisconnectHandler)
            .on("shardReady", shardReadyHandler)
            .on("shardResume", shardResumeHandler)
            .on("disconnect", disconnectHandler)
            .on("debug", debugHandler)
            .on("guildCreate", guildCreateHandler)
            .on("guildDelete", guildDeleteHandler)
            .on("unavailableGuildCreate", unavailableGuildCreateHandler)
            .on("guildAvailable", guildAvailableHandler)
            .on("interactionCreate", interactionCreateHandler);
    }

    // eslint-disable-next-line class-methods-use-this
    registerProcessEvents(): void {
        // remove listeners registered by eris-fleet, handle on cluster instead
        process.removeAllListeners("unhandledRejection");
        process.removeAllListeners("uncaughtException");

        process
            .on("unhandledRejection", unhandledRejectionHandler)
            .on("uncaughtException", uncaughtExceptionHandler)
            .on("SIGINT", SIGINTHandler);
    }

    // eslint-disable-next-line class-methods-use-this
    shutdown = async (done): Promise<void> => {
        logger.debug("SHUTDOWN received, cleaning up...");

        const endSessionPromises = Object.keys(State.gameSessions).map(
            async (guildID) => {
                const session = Session.getSession(guildID);
                logger.debug(`gid: ${guildID} | Forcing session end`);
                await session.endSession();
            }
        );

        await Promise.allSettled(endSessionPromises);

        for (const job of Object.entries(schedule.scheduledJobs)) {
            job[1].cancel();
        }

        await dbContext.destroy();
        done();
    };

    constructor(setup) {
        super(setup);
        State.ipc = this.ipc;
        State.client = this.bot as KmqClient;

        try {
            State.version = cp
                .execSync("git describe --tags")
                .toString()
                .trim();
        } catch (e) {
            State.version = `v${
                JSON.parse(
                    fs
                        .readFileSync(path.join(__dirname, "../package.json"))
                        .toString()
                ).version
            }`;
        }

        this.ipc.register("softRestartPending", (timeRemaining) => {
            const restartDate = new Date();
            restartDate.setMinutes(
                restartDate.getMinutes() + timeRemaining / (1000 * 60)
            );
            State.restartNotification.restartDate = restartDate;

            logger.info(
                `Soft restart ready to proceed: ${JSON.stringify(
                    State.restartNotification
                )}`
            );
        });

        LocalizationManager.localizer = new LocalizationManager();
        logger.info(
            `Started worker ID: ${this.workerID} on cluster ID: ${this.clusterID}`
        );

        logger.info("Registering cron tasks...");
        registerIntervals(this.clusterID);

        logger.info("Registering client event handlers...");
        this.registerClientEvents(State.client);

        logger.info("Registering process event handlers...");
        this.registerProcessEvents();

        if (process.env.NODE_ENV === EnvType.PROD && this.clusterID === 0) {
            logger.info("Initializing bot stats poster...");
            const botListingManager = new BotListingManager();
            botListingManager.start();

            logger.info("Initializing Spotify manager...");
            State.spotifyManager = new SpotifyManager();
            State.spotifyManager.start();
        }

        if (
            [EnvType.CI, EnvType.DRY_RUN].includes(
                process.env.NODE_ENV as EnvType
            )
        ) {
            logger.info("Dry run finished successfully.");
            State.ipc.totalShutdown();
            return;
        }

        logger.info("Loading cached application data...");
        reloadCaches();

        logger.info("Updating bot's status..");
        updateBotStatus();
        logger.info(
            `Logged in as ${State.client.user.username}#${
                State.client.user.discriminator
            }! in '${process.env.NODE_ENV}' mode (${
                (Date.now() - State.processStartTime) / 1000
            }s)`
        );
    }
}
