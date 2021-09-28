import Eris from "eris";
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
import { PROFILE_COMMAND_NAME, BOOKMARK_COMMAND_NAME } from "./events/client/interactionCreate";
import RateLimiter from "./rate_limiter";
import dbContext from "./database_context";
import KmqClient from "./kmq_client";

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

        logger.info("Registering event loops...");
        registerIntervals(this.clusterID);

        logger.info("Registering client event handlers...");
        registerClientEvents();

        logger.info("Registering process event handlers...");
        registerProcessEvents();

        this.ipc.register("reload_commands", async () => {
            logger.info("Received 'reload_commands' IPC message");
            state.client.reloadCommands();
        });

        if (process.env.NODE_ENV === EnvType.PROD && this.clusterID === 0) {
            logger.info("Initializing bot stats poster...");
            const botListingManager = new BotListingManager();
            botListingManager.start();
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

        if (process.env.NODE_ENV === EnvType.PROD) {
            state.client.createCommand({
                name: BOOKMARK_COMMAND_NAME,
                type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
            });

            state.client.createCommand({
                name: PROFILE_COMMAND_NAME,
                type: Eris.Constants.ApplicationCommandTypes.USER,
            });
        } else if (process.env.NODE_ENV === EnvType.DEV) {
            state.client.guilds.get(process.env.DEBUG_SERVER_ID).createCommand({
                name: BOOKMARK_COMMAND_NAME,
                type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
            });

            state.client.guilds.get(process.env.DEBUG_SERVER_ID).createCommand({
                name: PROFILE_COMMAND_NAME,
                type: Eris.Constants.ApplicationCommandTypes.USER,
            });
        }
    }
}
