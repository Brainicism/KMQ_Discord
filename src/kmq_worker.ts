/* eslint-disable node/no-sync */
import * as cp from "child_process";
import { BaseClusterWorker } from "eris-fleet";
import { IPCLogger } from "./logger";
import { config } from "dotenv";
import {
    registerClientEvents,
    registerIntervals,
    registerProcessEvents,
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
        registerClientEvents();

        logger.info("Registering process event handlers...");
        registerProcessEvents();

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
