import { config } from "dotenv";
import { BaseClusterWorker } from "eris-fleet";
import schedule from "node-schedule";
import path from "path";
import { Campaign } from "patreon-discord";

import { IPCLogger } from "./logger";
import { EnvType, State } from "./types";
import {
    registerClientEvents,
    registerIntervals,
    registerProcessEvents,
    reloadCaches,
    updateBotStatus,
} from "./helpers/management_utils";
import BotListingManager from "./helpers/bot_listing_manager";
import RateLimiter from "./rate_limiter";
import dbContext from "./database_context";
import KmqClient from "./kmq_client";
import ReloadCommand from "./commands/admin/reload";
import EvalCommand from "./commands/admin/eval";
import LocalizationManager from "./helpers/localization_manager";
import Session from "./structures/session";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = new IPCLogger("kmq");
config({ path: path.resolve(__dirname, "../.env") });

const state: State = {
    gameSessions: {},
    musicSessions: {},
    client: null,
    aliases: {
        artist: {},
        song: {},
    },
    processStartTime: Date.now(),
    ipc: null,
    rateLimiter: new RateLimiter(15, 30),
    bonusArtists: new Set<string>(),
    locales: {},
    localizer: null,
    patreonCampaign: null,
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
                    activePlayers,
                    activeGameSessions,
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

            if (
                process.env.PATREON_CREATOR_ACCESS_TOKEN &&
                process.env.PATREON_CAMPAIGN_ID
            ) {
                logger.info("Initializing Patreon manager...");
                state.patreonCampaign = new Campaign({
                    campaignId: process.env.PATREON_CAMPAIGN_ID,
                    patreonToken: process.env.PATREON_CREATOR_ACCESS_TOKEN,
                });
            }
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
