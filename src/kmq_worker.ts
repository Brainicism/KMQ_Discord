/* eslint-disable node/no-sync */
import { BaseClusterWorker } from "eris-fleet";
import { IPCLogger } from "./logger";
import { RedditClient } from "./helpers/reddit_client";
import { config } from "dotenv";
import { durationSeconds } from "./helpers/utils";
import {
    registerIntervals,
    reloadArtists,
    reloadCaches,
    reloadSongs,
    updateBotStatus,
} from "./helpers/management_utils";
import { updateAppCommands } from "./helpers/discord_utils";
import AppCommandsAction from "./enums/app_command_action";
import EnvType from "./enums/env_type";
import EvalCommand from "./commands/admin/eval";
import GeminiClient from "./helpers/gemini_client";
import KmqConfiguration from "./kmq_configuration";
import PlaylistManager from "./helpers/playlist_manager";
import ReloadCommand from "./commands/admin/reload";
import SIGINTHandler from "./events/process/SIGINT";
import Session from "./structures/session";
import State from "./state";
import channelDeleteHandler from "./events/client/channelDelete";
import connectHandler from "./events/client/connect";
import dbContext from "./database_context";
import debugHandler from "./events/client/debug";
import disconnectHandler from "./events/client/disconnect";
import errorHandler from "./events/client/error";
import fs from "fs";
import guildAvailableHandler from "./events/client/guildAvailable";
import guildCreateHandler from "./events/client/guildCreate";
import guildDeleteHandler from "./events/client/guildDelete";
import interactionCreateHandler from "./events/client/interactionCreate";
import messageCreateHandler from "./events/client/messageCreate";
import path from "path";
import schedule from "node-schedule";
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
import type { Setup } from "eris-fleet/dist/clusters/BaseClusterWorker";
import type KmqClient from "./kmq_client";

const logger = new IPCLogger("kmq");
config({ path: path.resolve(__dirname, "../.env") });

export default class BotWorker extends BaseClusterWorker {
    ready = false;
    logHeader = (): string => `Cluster #${this.clusterID}`;

    handleCommand = async (commandName: string): Promise<any> => {
        logger.info(
            `${this.logHeader()} | Received cluster command: ${commandName}`,
        );
        if (commandName.startsWith("eval")) {
            const evalString = commandName.substring(
                commandName.indexOf("|") + 1,
            );

            const evalResult = await EvalCommand.eval(evalString);
            return evalResult;
        }

        if (commandName.startsWith("announce_restart")) {
            const components = commandName.split("|");
            components.shift();

            const restartMinutes = parseInt(components[0], 10);

            const restartDate = new Date();
            restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);

            State.restartNotification = {
                restartDate,
            };

            logger.info(
                `${this.logHeader()} | Received restart notification: ${JSON.stringify(
                    State.restartNotification,
                )}`,
            );

            return null;
        }

        switch (commandName) {
            case "ping":
                if (!this.ready) {
                    logger.warn(`Cluster #${this.clusterID} not yet ready`);
                }

                return this.ready;
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
                    0,
                );

                const activeGameSessions = Object.keys(
                    State.gameSessions,
                ).length;

                const activeListeningSessions = Object.keys(
                    State.listeningSessions,
                ).length;

                const activeListeners = Object.values(
                    State.listeningSessions,
                ).reduce(
                    (total, curr) => total + curr.getVoiceMembers().length,
                    0,
                );

                return {
                    activePlayers,
                    activeGameSessions,
                    activeListeningSessions,
                    activeListeners,
                };
            }

            case "reload_config":
                KmqConfiguration.reload();
                return null;

            case "clear_restart":
                if (!State.restartNotification) {
                    logger.warn(
                        `${this.logHeader()} | No active restart notification to clear`,
                    );
                    return null;
                }

                logger.info(
                    `${this.logHeader()} | Cleared pending restart notification `,
                );
                State.restartNotification = null;
                return null;
            case "activate":
                logger.info(
                    `${this.logHeader()} | Registering interactive client events`,
                );
                this.registerInteractiveClientEvents(State.client);
                return null;
            case "reload_autocomplete_data":
                logger.info(
                    `${this.logHeader()} | Reloading autocomplete data`,
                );
                reloadArtists();
                reloadSongs();
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
            .on("guildUnavailable", unavailableGuildCreateHandler);
    }

    // eslint-disable-next-line class-methods-use-this
    registerInteractiveClientEvents(client: KmqClient): void {
        client
            .on("messageCreate", messageCreateHandler)
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
    shutdown = async (done: () => void): Promise<void> => {
        logger.debug(`${this.logHeader()} | SHUTDOWN received, cleaning up...`);

        const endSessionPromises = Object.keys(State.gameSessions).map(
            async (guildID) => {
                const session = Session.getSession(guildID);
                logger.debug(
                    `${this.logHeader()} |  gid: ${guildID} | Forcing session end`,
                );
                await session.endSession("KMQ shutting down", true);
            },
        );

        await Promise.allSettled(endSessionPromises);

        for (const job of Object.entries(schedule.scheduledJobs)) {
            job[1].cancel();
        }

        await dbContext.destroy();
        done();
    };

    constructor(setup: Setup) {
        super(setup);
        State.ipc = this.ipc;
        State.client = this.bot as KmqClient;

        State.version = `v${
            JSON.parse(
                fs
                    .readFileSync(path.resolve(__dirname, "../package.json"))
                    .toString(),
            )["version"]
        }`;

        this.ipc.register("softRestartPending", (timeRemaining) => {
            const restartDate = new Date();
            restartDate.setMinutes(
                restartDate.getMinutes() + timeRemaining / (1000 * 60),
            );

            State.restartNotification = {
                restartDate,
            };

            logger.info(
                `${this.logHeader()} | Soft restart ready to proceed: ${JSON.stringify(
                    State.restartNotification,
                )}`,
            );
        });

        logger.info(
            `${this.logHeader()} | Started worker ID: ${this.workerID} on cluster ID: ${this.clusterID}`,
        );

        this.init();
    }

    async init(): Promise<void> {
        try {
            logger.info(
                `${this.logHeader()} | Registering client event handlers...`,
            );
            this.registerClientEvents(State.client);

            logger.info(
                `${this.logHeader()} | Registering process event handlers...`,
            );
            this.registerProcessEvents();
        } catch (e) {
            logger.error(`Fatal error during kmq worker initialization: ${e}`);
            process.exit(1);
        }

        try {
            logger.info(`${this.logHeader()} | Registering cron tasks...`);
            registerIntervals(this.clusterID);

            logger.info(
                `${this.logHeader()} | Initializing Playlist manager...`,
            );
            State.playlistManager = new PlaylistManager();
            await State.playlistManager.start();

            logger.info(`${this.logHeader()} | Initializing Reddit Client...`);
            State.redditClient = new RedditClient();

            logger.info(`${this.logHeader()} | Initializing Gemini Client...`);
            State.geminiClient = new GeminiClient();

            if (process.env.MINIMAL_RUN !== "true") {
                logger.info(
                    `${this.logHeader()} | Loading cached application data...`,
                );

                await reloadCaches();
            }

            logger.info(`${this.logHeader()} | Reloading app commands`);
            State.commandToID = await updateAppCommands(
                AppCommandsAction.RELOAD,
            );
            logger.info(`${this.logHeader()} | Updating bot's status..`);
            await updateBotStatus();
        } catch (e) {
            if (e instanceof Error) {
                logger.error(
                    `Non-fatal error during kmq workers initialization: | Name: ${e.name}. Reason: ${e.message}. Trace: ${e.stack}}`,
                );
            } else {
                logger.error(
                    `Non-fatal error during kmq worker initialization: ${e}`,
                );
            }
        } finally {
            this.ready = true;
        }

        logger.info(
            `${this.logHeader()} | Logged in as '${State.client.user.username}'! in '${
                process.env.NODE_ENV
            }' mode (${durationSeconds(State.processStartTime, Date.now())}s)`,
        );

        if (
            [EnvType.CI, EnvType.DRY_RUN].includes(
                process.env.NODE_ENV as EnvType,
            )
        ) {
            logger.info(`${this.logHeader()} | Dry run finished successfully.`);
            State.ipc.totalShutdown();
        }
    }
}
