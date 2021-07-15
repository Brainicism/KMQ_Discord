import Eris from "eris";
import { config } from "dotenv";
import path from "path";
import Axios from "axios";
import fs from "fs";
import fastify from "fastify";
import _logger from "./logger";
import { EnvType, State } from "./types";
import {
    registerClientEvents, registerProcessEvents, registerCommands, registerIntervals,
    initializeBotStatsPoster, reloadCaches, clearRestartNotification,
} from "./helpers/management_utils";
import { userVoted } from "./helpers/bot_listing_manager";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("kmq");
config({ path: path.resolve(__dirname, "../.env") });

const ERIS_INTENTS = Eris.Constants.Intents;

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
    bonusUsers: new Set(),
};

export default state;

async function startWebServer() {
    const httpServer = fastify({});
    httpServer.post("/voted", {}, async (request, reply) => {
        const requestAuthorizationToken = request.headers["authorization"];
        if (requestAuthorizationToken !== process.env.TOP_GG_WEBHOOK_AUTH) {
            logger.warn("Webhook received with non-matching authorization token");
            reply.code(401).send();
            return;
        }
        const userID = request.body["user"];
        await userVoted(userID);
        reply.code(200).send();
    });

    httpServer.get("/groups", async (_request, reply) => {
        const groups = (await fs.promises.readFile(path.resolve(__dirname, "../data/group_list.txt"))).toString();
        reply.send(groups);
    });

    try {
        await httpServer.listen(process.env.WEB_SERVER_PORT, "0.0.0.0");
    } catch (err) {
        logger.error(`Erroring starting HTTP server: ${err}`);
    }
}

(async () => {
    if (require.main === module) {
        logger.info("Registering commands...");
        if ([EnvType.CI, EnvType.DRY_RUN].includes(process.env.NODE_ENV as EnvType)) {
            await registerCommands(true);
        } else {
            registerCommands(true);
        }
        logger.info("Registering event loops...");
        registerIntervals();
        logger.info("Registering process event handlers...");
        registerProcessEvents();

        if ([EnvType.CI, EnvType.DRY_RUN].includes(process.env.NODE_ENV as EnvType)) {
            logger.info("Dry run finished successfully.");
            process.exit(0);
        }

        logger.info("Loading cached application data...");
        reloadCaches();

        logger.info("Initializing bot stats poster...");
        initializeBotStatsPoster();

        logger.info("Clearing existing restart notifications...");
        await clearRestartNotification();

        logger.info("Starting web server...");
        await startWebServer();

        state.client = new Eris.Client(process.env.BOT_TOKEN, {
            disableEvents: {
                GUILD_ROLE_DELETE: true,
                CHANNEL_PINS_UPDATE: true,
                MESSAGE_UPDATE: true,
                MESSAGE_DELETE: true,
                MESSAGE_DELETE_BULK: true,
                MESSAGE_REACTION_REMOVE: true,
                MESSAGE_REACTION_REMOVE_ALL: true,
                MESSAGE_REACTION_REMOVE_EMOJI: true,
                GUILD_BAN_ADD: true,
                GUILD_BAN_REMOVE: true,
                TYPING_START: true,
            },
            restMode: true,
            maxShards: "auto",
            messageLimit: 0,
            useMaxConcurrency: true,
            intents: ERIS_INTENTS.guilds ^ ERIS_INTENTS.guildVoiceStates ^ ERIS_INTENTS.guildMessages ^ ERIS_INTENTS.guildMessageReactions,
        });

        logger.info("Registering client event handlers...");
        registerClientEvents();
        const gatewayResponse = (await Axios.get("https://discordapp.com/api/gateway/bot", {
            headers: {
                Authorization: `Bot ${process.env.BOT_TOKEN}`,
            },
        })).data;

        logger.info(`Number of shards: ${gatewayResponse["shards"]}. max_concurrency: ${gatewayResponse["session_start_limit"]["max_concurrency"]}`);
        state.client.connect();
    }
})();
