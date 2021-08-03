import { config } from "dotenv";
import path from "path";
import { BaseClusterWorker } from "eris-fleet";
import { IPCLogger } from "./logger";
import { EnvType, State } from "./types";
import {
    registerClientEvents, registerCommands, registerIntervals, reloadCaches, reloadCommands, updateBotStatus,
} from "./helpers/management_utils";
import BotListingManager from "./helpers/bot_listing_manager";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = new IPCLogger("kmq");
config({ path: path.resolve(__dirname, "../.env") });

const state: State = {
    commands: {},
    gameSessions: {},
    client: null,
    aliases: {
        artist: {},
        song: {},
    },
    processStartTime: Date.now(),
    ipc: null,
};

export { state };

export class BotWorker extends BaseClusterWorker {
    constructor(setup) {
        super(setup);
        state.ipc = this.ipc;
        state.client = this.bot;
        logger.info(`Started worker ID: ${this.workerID} on cluster ID: ${this.clusterID}`);

        logger.info("Registering commands...");
        registerCommands(true);

        logger.info("Registering event loops...");
        registerIntervals(this.clusterID);

        logger.info("Registering client event handlers...");
        registerClientEvents();

        this.ipc.register("reload_commands", async () => {
            logger.info("Received 'reload_commands' IPC message");
            reloadCommands();
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
    }
}
