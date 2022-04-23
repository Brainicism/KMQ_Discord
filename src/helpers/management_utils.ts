/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import schedule from "node-schedule";
import _ from "lodash";
import { IPCLogger } from "../logger";
import State from "../state";
import { sendInfoMessage, sendPowerHourNotification } from "./discord_utils";
import messageCreateHandler from "../events/client/messageCreate";
import voiceChannelLeaveHandler from "../events/client/voiceChannelLeave";
import voiceChannelSwitchHandler from "../events/client/voiceChannelSwitch";
import voiceChannelJoinHandler from "../events/client/voiceChannelJoin";
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
import {
    cleanupInactiveGameSessions,
    getMatchingGroupNames,
    isPowerHour,
} from "./game_utils";
import type { LocaleType } from "../enums/locale_type";
import updatePremiumUsers from "./patreon_manager";
import dbContext from "../database_context";
import debugHandler from "../events/client/debug";
import guildCreateHandler from "../events/client/guildCreate";
import guildDeleteHandler from "../events/client/guildDelete";
import unavailableGuildCreateHandler from "../events/client/unavailableGuildCreate";
import guildAvailableHandler from "../events/client/guildAvailable";
import interactionCreateHandler from "../events/client/interactionCreate";
import { chooseRandom, isWeekend } from "./utils";
import { reloadFactCache } from "../fact_generator";
import MessageContext from "../structures/message_context";
import channelDeleteHandler from "../events/client/channelDelete";
import { EnvType } from "../enums/env_type";

const logger = new IPCLogger("management_utils");

const RESTART_WARNING_INTERVALS = new Set([10, 5, 3, 2, 1]);

/** Registers listeners on client events */
export function registerClientEvents(): void {
    const { client } = State;
    // remove listeners registered by eris-fleet, handle on cluster instead
    client.removeAllListeners("warn");
    client.removeAllListeners("error");

    // register listeners
    client
        .on("messageCreate", messageCreateHandler)
        .on("voiceChannelLeave", voiceChannelLeaveHandler)
        .on("voiceChannelSwitch", voiceChannelSwitchHandler)
        .on("voiceChannelJoin", voiceChannelJoinHandler)
        .on("channelDelete", channelDeleteHandler)
        .on("connect", connectHandler)
        .on("error", errorHandler)
        .on("warn", warnHandler)
        .on("shardDisconnect", shardDisconnectHandler)
        .on("shardReady", shardReadyHandler)
        .on("shardResume", shardResumeHandler)
        .on("disconnect", disconnectHandler)
        .on("debug", debugHandler)
        .on("guildCreate", guildCreateHandler)
        .on("guildDelete", guildDeleteHandler)
        .on("unavailableGuildCreate", unavailableGuildCreateHandler)
        .on("guildAvailable", guildAvailableHandler)
        .on("interactionCreate", interactionCreateHandler);
}

/** Registers listeners on process events */
export function registerProcessEvents(): void {
    // remove listeners registered by eris-fleet, handle on cluster instead
    process.removeAllListeners("unhandledRejection");
    process.removeAllListeners("uncaughtException");

    process
        .on("unhandledRejection", unhandledRejectionHandler)
        .on("uncaughtException", uncaughtExceptionHandler)
        .on("SIGINT", SIGINTHandler);
}

/**
 * Gets the remaining time until the next server restart
 * @returns null if no restart is imminent, a date in epoch milliseconds
 */
export async function getTimeUntilRestart(): Promise<number> {
    const restartNotificationTime = (
        await dbContext.kmq("restart_notifications").where("id", 1)
    )[0].restart_time;

    if (!restartNotificationTime) return null;
    return Math.floor(
        (restartNotificationTime - new Date().getTime()) / (1000 * 60)
    );
}

/**
 * Sends a warning message to all active GameSessions for impending restarts at predefined intervals
 * @param timeUntilRestart - time until the restart
 */
export const checkRestartNotification = async (
    timeUntilRestart: number
): Promise<void> => {
    let serversWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeUntilRestart)) {
        for (const gameSession of Object.values(State.gameSessions)) {
            if (gameSession.finished) continue;
            await sendInfoMessage(
                new MessageContext(gameSession.textChannelID),
                {
                    title: `Upcoming Bot Restart in ${timeUntilRestart} Minutes.`,
                    description:
                        "Downtime will be approximately 2 minutes. Please end the current game to ensure your progress is saved!",
                }
            );
            serversWarned++;
        }

        logger.info(
            `Impending bot restart in ${timeUntilRestart} minutes. ${serversWarned} servers warned.`
        );
    }
};

/** Clear inactive voice connections */
function clearInactiveVoiceConnections(): void {
    const existingVoiceChannelGuildIDs = Array.from(
        State.client.voiceConnections.keys()
    ) as Array<string>;

    const activeGameVoiceChannelGuildIDs = new Set(
        Object.values(State.gameSessions).map((x) => x.guildID)
    );

    const activeMusicVoiceChannelGuildIDs = new Set(
        Object.values(State.musicSessions).map((x) => x.guildID)
    );

    for (const existingVoiceChannelGuildID of existingVoiceChannelGuildIDs) {
        if (
            !activeGameVoiceChannelGuildIDs.has(existingVoiceChannelGuildID) &&
            !activeMusicVoiceChannelGuildIDs.has(existingVoiceChannelGuildID)
        ) {
            const voiceChannelID = State.client.voiceConnections.get(
                existingVoiceChannelGuildID
            ).channelID;

            logger.info(
                `gid: ${existingVoiceChannelGuildID}, vid: ${voiceChannelID} | Disconnected inactive voice connection`
            );
            State.client.voiceConnections.leave(existingVoiceChannelGuildID);
        }
    }
}

/* Updates system statistics */
async function updateSystemStats(clusterID: number): Promise<void> {
    const { client } = State;
    const latencies = client.shards.map((x) => x.latency);
    const meanLatency = _.mean(latencies);
    const maxLatency = _.max(latencies);
    const minLatency = _.min(latencies);
    if ([meanLatency, maxLatency, minLatency].some((x) => x === Infinity))
        return;

    await dbContext.kmq("system_stats").insert({
        cluster_id: clusterID,
        stat_name: "mean_latency",
        stat_value: meanLatency,
        date: new Date(),
    });

    await dbContext.kmq("system_stats").insert({
        cluster_id: clusterID,
        stat_name: "min_latency",
        stat_value: minLatency,
        date: new Date(),
    });

    await dbContext.kmq("system_stats").insert({
        cluster_id: clusterID,
        stat_name: "max_latency",
        stat_value: maxLatency,
        date: new Date(),
    });
}

/** Updates the bot's song listening status */
export async function updateBotStatus(): Promise<void> {
    const { client } = State;
    const timeUntilRestart = await getTimeUntilRestart();
    if (timeUntilRestart) {
        client.editStatus("dnd", {
            name: `Restarting in ${timeUntilRestart} minutes...`,
            type: 1,
        });
        return;
    }

    if (isPowerHour() && !isWeekend()) {
        client.editStatus("online", {
            name: "🎶 Power Hour! 🎶",
            type: 5,
        });
        return;
    }

    const randomPopularSongs = await dbContext
        .kmq("available_songs")
        .orderBy("publishedon", "DESC")
        .limit(25);

    const randomPopularSong = chooseRandom(randomPopularSongs);
    if (!randomPopularSong) {
        client.editStatus("online");
        return;
    }

    client.editStatus("online", {
        name: `"${randomPopularSong["song_name_en"]}" by ${randomPopularSong["artist_name_en"]}`,
        type: 1,
        url: `https://www.youtube.com/watch?v=${randomPopularSong["link"]}`,
    });
}

/** Reload song/artist aliases */
export async function reloadAliases(): Promise<void> {
    const songAliasMapping = await dbContext
        .kmq("available_songs")
        .select(["link", "song_aliases"])
        .where("song_aliases", "<>", "");

    const artistAliasMapping = await dbContext
        .kmq("available_songs")
        .distinct(["artist_name_en", "artist_aliases"])
        .select(["artist_name_en", "artist_aliases"])
        .where("artist_aliases", "<>", "");

    const songAliases = {};
    for (const mapping of songAliasMapping) {
        songAliases[mapping["link"]] = mapping["song_aliases"]
            .split(";")
            .filter((x: string) => x);
    }

    const artistAliases = {};
    for (const mapping of artistAliasMapping) {
        artistAliases[mapping["artist_name_en"]] = mapping["artist_aliases"]
            .split(";")
            .filter((x: string) => x);
    }

    State.aliases.artist = artistAliases;
    State.aliases.song = songAliases;
    logger.info("Reloaded alias data");
}

/** Reload bonus groups (same groups chosen on the same day) */
export async function reloadBonusGroups(): Promise<void> {
    const bonusGroupCount = 10;
    const date = new Date();
    const artistNameQuery: string[] = (
        await dbContext
            .kpopVideos("app_kpop_group")
            .select(["name"])
            .where("is_collab", "=", "n")
            .orderByRaw(
                `RAND(${
                    date.getFullYear() +
                    date.getMonth() * 997 +
                    date.getDate() * 37
                })`
            )
            .limit(bonusGroupCount)
    ).map((x) => x.name);

    State.bonusArtists = new Set(
        (await getMatchingGroupNames(artistNameQuery)).matchedGroups.map(
            (x) => x.name
        )
    );
}

async function reloadLocales(): Promise<void> {
    const updatedLocales = await dbContext.kmq("locale").select("*");
    for (const l of updatedLocales) {
        State.locales[l.guild_id] = l.locale as LocaleType;
    }
}

/**
 * Clears any existing restart timers
 */
export async function clearRestartNotification(): Promise<void> {
    await dbContext
        .kmq("restart_notifications")
        .where("id", "=", "1")
        .update({ restart_time: null });
}

/**
 * @param clusterID - The cluster ID
 *  Sets up recurring cron-based tasks
 * */
export function registerIntervals(clusterID: number): void {
    // Everyday at 12am UTC => 7pm EST
    schedule.scheduleJob("0 0 * * *", () => {
        // New fun facts
        reloadFactCache();
        // New bonus groups
        reloadBonusGroups();
    });

    // Every hour
    schedule.scheduleJob("0 * * * *", () => {
        if (!isPowerHour() || isWeekend()) return;
        if (!State.client.guilds.has(process.env.DEBUG_SERVER_ID)) return;
        // Ping a role in KMQ server notifying of power hour
        sendPowerHourNotification();
    });

    // Every 10 minutes
    schedule.scheduleJob("*/10 * * * *", () => {
        // Cleanup inactive game sessions
        cleanupInactiveGameSessions();
        // Change bot's status (song playing, power hour, etc.)
        updateBotStatus();
    });

    // Every 5 minutes
    schedule.scheduleJob("*/5 * * * *", async () => {
        // Update song/artist aliases
        reloadAliases();
        // Cleanup inactive Discord voice connections
        clearInactiveVoiceConnections();
        // Store per-cluster stats
        await updateSystemStats(clusterID);
        // Sync state with Patreon subscribers
        updatePremiumUsers();
    });

    // Every minute
    schedule.scheduleJob("* * * * *", async () => {
        if (process.env.NODE_ENV !== EnvType.PROD) return;
        // set up check for restart notifications
        const timeUntilRestart = await getTimeUntilRestart();
        if (timeUntilRestart) {
            updateBotStatus();
            await checkRestartNotification(timeUntilRestart);
        }
    });
}

/** Reloads caches */
export function reloadCaches(): void {
    reloadAliases();
    reloadFactCache();
    reloadBonusGroups();
    reloadLocales();
}
