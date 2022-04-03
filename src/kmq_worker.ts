import { config } from "dotenv";
import { BaseClusterWorker } from "eris-fleet";
import schedule from "node-schedule";
import path from "path";

import EvalCommand from "./commands/admin/eval";
import ReloadCommand from "./commands/admin/reload";
import dbContext from "./database_context";
import BotListingManager from "./helpers/bot_listing_manager";
import LocalizationManager from "./helpers/localization_manager";
import {
    registerClientEvents,
    registerIntervals,
    registerProcessEvents,
    reloadCaches,
    updateBotStatus,
} from "./helpers/management_utils";
import KmqClient from "./kmq_client";
import { IPCLogger } from "./logger";
import RateLimiter from "./rate_limiter";
import { EnvType, State } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = new IPCLogger("kmq");
config({ path: path.resolve(__dirname, "../.env") });

const state: State = {
    aliases: {
        artist: {},
        song: {},
    },
    bonusArtists: new Set<string>(),
    client: null,
    gameSessions: {},
    ipc: null,
    locales: {},
    localizer: null,
    processStartTime: Date.now(),
    rateLimiter: new RateLimiter(15, 30),
};

export { state };

export class BotWorker extends BaseClusterWorker {
    handleCommand = async (commandName: string): Promise<any> => {
        logger.debug(`Received cluster command: ${commandName}`);
        if (commandName.startsWith("eval")) {
            const evalString = commandName.substr(commandName.indexOf("|") + 1);
            const evalResult = await EvalCommand.eval(evalString);
            return evalResult;
        }

        switch (commandName) {
            case "reload_commands":
                ReloadCommand.reloadCommands();
                return null;
            case "game_session_stats": {
                const activePlayers = Object.values(state.gameSessions).reduce(
                    (total, curr) =>
                        total +
                        curr.scoreboard
                            .getPlayers()
                            .filter((x) => x.inVC)
                            .map((x) => x.id).length,
                    0
                );

                const activeGameSessions = Object.keys(
                    state.gameSessions
                ).length;

                return {
                    activeGameSessions,
                    activePlayers,
                };
            }

            default:
                return null;
        }
    };

    shutdown = async (done): Promise<void> => {
        logger.debug("SHUTDOWN received, cleaning up...");

        const endSessionPromises = Object.keys(state.gameSessions).map(
            async (guildID) => {
                const gameSession = state.gameSessions[guildID];
                logger.debug(`gid: ${guildID} | Forcing game session end`);
                await gameSession.endSession();
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
        state.ipc = this.ipc;
        state.client = this.bot as KmqClient;
        state.localizer = new LocalizationManager();
        logger.info(
            `Started worker ID: ${this.workerID} on cluster ID: ${this.clusterID}`
        );

        logger.info("Registering cron tasks...");
        registerIntervals(this.clusterID);

        logger.info("Registering client event handlers...");
        registerClientEvents();

        logger.info("Registering process event handlers...");
        registerProcessEvents();

        if (process.env.NODE_ENV === EnvType.PROD && this.clusterID === 0) {
            logger.info("Initializing bot stats poster...");
            const botListingManager = new BotListingManager();
            botListingManager.start();
        }

        if (
            [EnvType.CI, EnvType.DRY_RUN].includes(
                process.env.NODE_ENV as EnvType
            )
        ) {
            logger.info("Dry run finished successfully.");
            state.ipc.totalShutdown();
            return;
        }

        logger.info("Loading cached application data...");
        reloadCaches();

        logger.info("Updating bot's status..");
        updateBotStatus();
        logger.info(
            `Logged in as ${state.client.user.username}#${
                state.client.user.discriminator
            }! in '${process.env.NODE_ENV}' mode (${
                (Date.now() - state.processStartTime) / 1000
            }s)`
        );
    }
}
