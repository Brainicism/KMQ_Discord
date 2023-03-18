import { BaseServiceWorker } from "eris-fleet";
import { IPCLogger } from "./logger";
import BotListingManager from "./helpers/bot_listing_manager";
import EnvType from "./enums/env_type";
import type { Setup } from "eris-fleet/dist/services/BaseServiceWorker";

const logger = new IPCLogger("kmq_service");

export default class ServiceWorker extends BaseServiceWorker {
    constructor(setup: Setup) {
        super(setup);
        if (process.env.NODE_ENV === EnvType.PROD) {
            logger.info("Initializing bot stats poster...");
            const botListingManager = new BotListingManager(this.ipc);
            botListingManager.start();
        }

        this.serviceReady();
    }

    shutdown = (done: () => void): void => {
        done();
    };
}
