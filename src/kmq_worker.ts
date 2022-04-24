import { BaseClusterWorker } from "eris-fleet";
import { Campaign } from "patreon-discord";
import { config } from "dotenv";
import path from "path";
import schedule from "node-schedule";

import { IPCLogger } from "./logger";
import {
    registerClientEvents,
    registerIntervals,
    registerProcessEvents,
    reloadCaches,
    updateBotStatus,
} from "./helpers/management_utils";
import BotListingManager from "./helpers/bot_listing_manager";
import EnvType from "./enums/env_type";
import EvalCommand from "./commands/admin/eval";
import LocalizationManager from "./helpers/localization_manager";
import ReloadCommand from "./commands/admin/reload";
import Session from "./structures/session";
import State from "./state";
import dbContext from "./database_context";
import type KmqClient from "./kmq_client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

        switch (commandName) {
            case "reload_commands":
                ReloadCommand.reloadCommands();
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

        if (process.env.NODE_ENV === EnvType.PROD && this.clusterID === 0) {
            logger.info("Initializing bot stats poster...");
            const botListingManager = new BotListingManager();
            botListingManager.start();

            if (
                process.env.PATREON_CREATOR_ACCESS_TOKEN &&
                process.env.PATREON_CAMPAIGN_ID
            ) {
                logger.info("Initializing Patreon manager...");
                State.patreonCampaign = new Campaign({
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
