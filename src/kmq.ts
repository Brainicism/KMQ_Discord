import { config } from "dotenv";
import path from "path";
import { BaseClusterWorker } from "eris-fleet";
import _logger from "./logger";
import { EnvType, State } from "./types";
import {
    registerClientEvents, registerCommands, registerIntervals, reloadCaches,
} from "./helpers/management_utils";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("kmq");
config({ path: path.resolve(__dirname, "../.env") });

const state: State = {
    commands: {},
    gameSessions: {},
    botListingManager: null,
    client: null,
    aliases: {
        artist: {},
        song: {},
    },
    processStartTime: Date.now(),
};

export { state };

export class BotWorker extends BaseClusterWorker {
    constructor(setup) {
        super(setup);
        state.client = this.bot;
        logger.info(`Started worker ID: ${this.workerID} on cluster ID: ${this.clusterID}`);
        logger.info("Registering commands...");
        if ([EnvType.CI, EnvType.DRY_RUN].includes(process.env.NODE_ENV as EnvType)) {
            registerCommands(true);
        } else {
            registerCommands(true);
        }
        logger.info("Registering event loops...");
        registerIntervals();

        if ([EnvType.CI, EnvType.DRY_RUN].includes(process.env.NODE_ENV as EnvType)) {
            logger.info("Dry run finished successfully.");
            process.exit(0);
        }

        logger.info("Loading cached application data...");
        reloadCaches();

        logger.info("Registering client event handlers...");
        registerClientEvents();
    }
}
