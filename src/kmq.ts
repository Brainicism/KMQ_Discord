import { config } from "dotenv";
import path from "path";
import { BaseClusterWorker } from "eris-fleet";
import schedule from "node-schedule";
import { IPCLogger } from "./logger";
import { EnvType, State } from "./types";
import {
    registerClientEvents, registerIntervals, registerProcessEvents, reloadCaches, updateBotStatus,
} from "./helpers/management_utils";
import BotListingManager from "./helpers/bot_listing_manager";
import RateLimiter from "./rate_limiter";
import dbContext from "./database_context";
import KmqClient from "./kmq_client";
import ReloadCommand from "./commands/admin/reload";
import EvalCommand from "./commands/admin/eval";
import LeaderboardCommand, { LeaderboardDuration } from "./commands/game_commands/leaderboard";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = new IPCLogger("kmq");
config({ path: path.resolve(__dirname, "../.env") });

const state: State = {
    gameSessions: {},
    client: null,
    aliases: {
        artist: {},
        song: {},
    },
    processStartTime: Date.now(),
    ipc: null,
    rateLimiter: new RateLimiter(15, 30),
};

export { state };

export class BotWorker extends BaseClusterWorker {
    handleCommand = async (commandName: string) => {
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
                const activePlayers = Object.values(state.gameSessions).reduce((total, curr) => total + curr.participants.size, 0);
                const activeGameSessions = Object.keys(state.gameSessions).length;
                return {
                    activePlayers, activeGameSessions,
                };
            }

            default:
                return null;
        }
    };

    shutdown = async (done) => {
        logger.debug("SHUTDOWN received, cleaning up...");

        const endSessionPromises = Object.keys(state.gameSessions).map(async (guildID) => {
            const gameSession = state.gameSessions[guildID];
            logger.debug(`gid: ${guildID} | Forcing game session end`);
            await gameSession.endSession();
        });

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
        logger.info(`Started worker ID: ${this.workerID} on cluster ID: ${this.clusterID}`);

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

            logger.info("Registering master cron tasks...");
            // every first of the month at 12am UTC => 7pm EST
            schedule.scheduleJob("0 0 1 * *", async () => {
                LeaderboardCommand.sendDebugLeaderboard(LeaderboardDuration.MONTHLY);
            });

            // every sunday at 12am UTC => saturday 7pm EST
            schedule.scheduleJob("0 0 * * SUN", async () => {
                LeaderboardCommand.sendDebugLeaderboard(LeaderboardDuration.WEEKLY);
            });

            // everyday at 12am UTC => 7pm EST
            schedule.scheduleJob("0 0 * * *", async () => {
                LeaderboardCommand.sendDebugLeaderboard(LeaderboardDuration.DAILY);
            });
        }

        if ([EnvType.CI, EnvType.DRY_RUN].includes(process.env.NODE_ENV as EnvType)) {
            logger.info("Dry run finished successfully.");
            state.ipc.totalShutdown();
            return;
        }

        logger.info("Loading cached application data...");
        reloadCaches();

        logger.info("Updating bot's status..");
        updateBotStatus();
        logger.info(`Logged in as ${state.client.user.username}#${state.client.user.discriminator}! in '${process.env.NODE_ENV}' mode (${(Date.now() - state.processStartTime) / 1000}s)`);
    }
}
