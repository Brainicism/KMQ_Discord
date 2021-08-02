/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import path from "path";
import fs from "fs";
import schedule from "node-schedule";
import fastify from "fastify";
import { IPCLogger } from "../logger";
import { state } from "../kmq";
import { EMBED_INFO_COLOR, sendInfoMessage } from "./discord_utils";
import messageCreateHandler from "../events/client/messageCreate";
import voiceChannelLeaveHandler from "../events/client/voiceChannelLeave";
import voiceChannelSwitchHandler from "../events/client/voiceChannelSwitch";
import connectHandler from "../events/client/connect";
import errorHandler from "../events/client/error";
import warnHandler from "../events/client/warn";
import shardDisconnectHandler from "../events/client/shardDisconnect";
import shardReadyHandler from "../events/client/shardReady";
import shardResumeHandler from "../events/client/shardResume";
import disconnectHandler from "../events/client/disconnect";
import unhandledRejectionHandler from "../events/process/unhandledRejection";
import uncaughtExceptionHandler from "../events/process/uncaughtException";
import SIGINTHandler from "../events/process/SIGINT";
import { cleanupInactiveGameSessions } from "./game_utils";
import dbContext from "../database_context";
import BaseCommand from "../commands/interfaces/base_command";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import debugHandler from "../events/client/debug";
import guildCreateHandler from "../events/client/guildCreate";
import guildDeleteHandler from "../events/client/guildDelete";
import unavailableGuildCreateHandler from "../events/client/unavailableGuildCreate";
import guildAvailableHandler from "../events/client/guildAvailable";
import { userVoted } from "./bot_listing_manager";
import backupKmqDatabase from "../scripts/backup-kmq-database";
import { chooseRandom } from "./utils";
import { reloadFactCache } from "../fact_generator";
import MessageContext from "../structures/message_context";
import { EnvType } from "../types";

const logger = new IPCLogger("management_utils");

const RESTART_WARNING_INTERVALS = new Set([10, 5, 3, 2, 1]);

let cachedCommandFiles: { [commandName: string]: BaseCommand } = null;

/** Registers listeners on client events */
export function registerClientEvents() {
    const { client } = state;
    client.on("messageCreate", messageCreateHandler)
        .on("voiceChannelLeave", voiceChannelLeaveHandler)
        .on("voiceChannelSwitch", voiceChannelSwitchHandler)
        .on("connect", connectHandler)
        .on("error", errorHandler)
        .on("warn", warnHandler)
        .on("shardDisconnect", shardDisconnectHandler)
        .on("shardReady", shardReadyHandler)
        .on("shardResume", shardResumeHandler)
        .on("disconnect", disconnectHandler)
        // .on("debug", debugHandler)
        .on("guildCreate", guildCreateHandler)
        .on("guildDelete", guildDeleteHandler)
        .on("unavailableGuildCreate", unavailableGuildCreateHandler)
        .on("guildAvailable", guildAvailableHandler);
}

/** Registers listeners on process events */
export function registerProcessEvents() {
    process.on("unhandledRejection", unhandledRejectionHandler)
        .on("uncaughtException", uncaughtExceptionHandler)
        .on("SIGINT", SIGINTHandler);
}

/** Starts web server */
export async function startWebServer() {
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

/**
 * Gets the remaining time until the next server restart
 * @returns null if no restart is imminent, a date in epoch milliseconds
 */
export async function getTimeUntilRestart(): Promise<number> {
    const restartNotificationTime = (await dbContext.kmq("restart_notifications").where("id", 1))[0].restart_time;
    if (!restartNotificationTime) return null;
    return Math.floor((restartNotificationTime - (new Date()).getTime()) / (1000 * 60));
}

/**
 * Sends a warning message to all active GameSessions for impending restarts at predefined intervals
 * @param restartNotification - The date of the impending restart
 */
export const checkRestartNotification = async (timeUntilRestart: number): Promise<void> => {
    let serversWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeUntilRestart)) {
        for (const gameSession of Object.values(state.gameSessions)) {
            if (gameSession.finished) continue;
            await sendInfoMessage(new MessageContext(gameSession.textChannelID), {
                color: EMBED_INFO_COLOR,
                title: `Upcoming bot restart in ${timeUntilRestart} minutes.`,
                description: "Downtime will be approximately 2 minutes. Please end the current game to ensure your progress is saved!",
            });
            serversWarned++;
        }

        logger.info(`Impending bot restart in ${timeUntilRestart} minutes. ${serversWarned} servers warned.`);
    }
};

/** Clear inactive voice connections */
function clearInactiveVoiceConnections() {
    const existingVoiceChannelGuildIDs = Array.from(state.client.voiceConnections.keys()) as Array<string>;
    const activeVoiceChannelGuildIDs = Object.values(state.gameSessions).map((x) => x.guildID);
    for (const existingVoiceChannelGuildID of existingVoiceChannelGuildIDs) {
        if (!activeVoiceChannelGuildIDs.includes(existingVoiceChannelGuildID)) {
            const voiceChannelID = state.client.voiceConnections.get(existingVoiceChannelGuildID).channelID;
            logger.info(`gid: ${existingVoiceChannelGuildID}, vid: ${voiceChannelID} | Disconnected inactive voice connection`);
            state.client.voiceConnections.leave(existingVoiceChannelGuildID);
        }
    }
}

/* Updates each cluster's current game activity info */
async function updateClusterActivityStats(clusterID: number) {
    const activeGameSessions = Object.keys(state.gameSessions).length;
    const activeUsers = Object.values(state.gameSessions).reduce((total, curr) => total + curr.participants.size, 0);
    await dbContext.kmq("cluster_stats")
        .insert({
            cluster_id: clusterID,
            stat_name: "active_players",
            stat_value: activeUsers,
            last_updated: new Date(),
        })
        .onConflict(["cluster_id", "stat_name"])
        .merge();

    await dbContext.kmq("cluster_stats")
        .insert({
            cluster_id: clusterID,
            stat_name: "active_sessions",
            stat_value: activeGameSessions,
            last_updated: new Date(),
        })
        .onConflict(["cluster_id", "stat_name"])
        .merge();
}

/* Clears cluster activity info */
export async function clearClusterActivityStats() {
    await dbContext.kmq("cluster_stats")
        .del();
}

/** Updates the bot's song listening status */
export async function updateBotStatus() {
    const { client } = state;
    const timeUntilRestart = await getTimeUntilRestart();
    if (timeUntilRestart) {
        client.editStatus("dnd", {
            name: `Restarting in ${timeUntilRestart} minutes...`,
        });
        return;
    }

    const randomPopularSongs = await dbContext.kmq("available_songs")
        .orderBy("views", "DESC")
        .limit(25);

    const randomPopularSong = chooseRandom(randomPopularSongs);
    if (!randomPopularSong) {
        client.editStatus("online");
        return;
    }

    client.editStatus("online", {
        name: `"${randomPopularSong["song_name"]}" by ${randomPopularSong["artist_name"]}`,
        type: 1,
        url: `https://www.youtube.com/watch?v=${randomPopularSong["link"]}`,
    });
}

/** Reload song/artist aliases */
export async function reloadAliases() {
    const songAliasMapping = await dbContext.kmq("available_songs")
        .select(["link", "song_aliases"])
        .where("song_aliases", "<>", "");

    const artistAliasMapping = await dbContext.kmq("available_songs")
        .distinct(["artist_name", "artist_aliases"])
        .select(["artist_name", "artist_aliases"])
        .where("artist_aliases", "<>", "");

    const newSongAliases = {};
    for (const mapping of songAliasMapping) {
        newSongAliases[mapping["link"]] = mapping["song_aliases"].split(";");
    }

    const newArtistAliases = {};
    for (const mapping of artistAliasMapping) {
        newArtistAliases[mapping["artist_name"]] = mapping["artist_aliases"].split(";");
    }

    state.aliases.artist = newArtistAliases;
    state.aliases.song = newSongAliases;
    logger.info("Reloaded alias data");
}

/**
 * Clears any existing restart timers
 */
export async function clearRestartNotification() {
    await dbContext.kmq("restart_notifications").where("id", "=", "1")
        .update({ restart_time: null });
}

/** Sets up recurring cron-based tasks */
export function registerIntervals(clusterID: number) {
    // set up cleanup for inactive game sessions
    schedule.scheduleJob("*/10 * * * *", () => {
        cleanupInactiveGameSessions();
        updateBotStatus();
    });

    // set up check for restart notifications
    schedule.scheduleJob("* * * * *", async () => {
        if (process.env.NODE_ENV !== EnvType.PROD) return;
        // unscheduled restarts
        const timeUntilRestart = await getTimeUntilRestart();
        if (timeUntilRestart) {
            updateBotStatus();
            await checkRestartNotification(timeUntilRestart);
        }
    });

    // everyday at 12am UTC => 7pm EST
    schedule.scheduleJob("0 0 * * *", async () => {
        reloadFactCache();
    });

    // every sunday at 1am UTC => 8pm saturday EST
    schedule.scheduleJob("0 1 * * 0", async () => {
        if (process.env.NODE_ENV !== EnvType.PROD) return;
        logger.info("Backing up kmq database");
        await backupKmqDatabase();
    });

    // every 5 minutes
    schedule.scheduleJob("*/5 * * * *", async () => {
        reloadAliases();
        clearInactiveVoiceConnections();
    });

    // every 1 minutes
    schedule.scheduleJob("*/1 * * * *", async () => {
        await updateClusterActivityStats(clusterID);
    });
}

/** Reloads caches */
export async function reloadCaches() {
    reloadAliases();
    reloadFactCache();
}

/** @returns a mapping of command name to command source file */
export function getCommandFiles(shouldReload: boolean): { [commandName: string]: BaseCommand } {
    if (cachedCommandFiles && !shouldReload) {
        return cachedCommandFiles;
    }

    const commandMap = {};
    try {
        let files: Array<string> = [];
        for (const category of ["admin", "game_options", "game_commands"]) {
            files = files.concat(fs.readdirSync(path.resolve(__dirname, "../commands", category))
                .filter((x) => x.endsWith(".js"))
                .map((x) => path.resolve(__dirname, "../commands", category, x)));
        }

        for (const commandFile of files) {
            const commandFilePath = path.resolve(__dirname, "../commands", commandFile);
            if (shouldReload) {
                // invalidate require cache
                delete require.cache[require.resolve(commandFilePath)];
            }

            try {
                const command = require(commandFilePath);
                const commandName = path.parse(commandFile).name;
                // eslint-disable-next-line new-cap
                commandMap[commandName] = new command.default();
            } catch (e) {
                throw new Error(`Failed to load file: ${commandFilePath}`);
            }
        }

        cachedCommandFiles = commandMap;
        return commandMap;
    } catch (err) {
        logger.error(`Unable to read commands error = ${err}`);
        throw err;
    }
}

/**
 * Registers a command
 * @param command - The Command class
 * @param commandName - The name/alias of the command
 */
function registerCommand(command: BaseCommand, commandName: string) {
    if (commandName in state.commands) {
        logger.error(`Command \`${commandName}\` already exists. Possible conflict?`);
    }

    state.commands[commandName] = command;
}

/** Registers commands */
export function registerCommands(initialLoad: boolean) {
    // load commands
    state.commands = {};
    const commandFiles = getCommandFiles(!initialLoad);
    for (const [commandName, command] of Object.entries(commandFiles)) {
        registerCommand(command, commandName);
        if (command.aliases) {
            for (const alias of command.aliases) {
                registerCommand(command, alias);
            }
        }
    }
}

/** Reloads commands */
export function reloadCommands() {
    logger.info("Reloading KMQ commands");
    registerCommands(false);
    logger.info("Reload KMQ commands complete");
}

/**
 * Deletes the GameSession corresponding to a given guild ID
 * @param guildID - The guild ID
 */
export function deleteGameSession(guildID: string) {
    if (!(guildID in state.gameSessions)) {
        logger.debug(`gid: ${guildID} | GameSession already ended`);
        return;
    }

    delete state.gameSessions[guildID];
}
