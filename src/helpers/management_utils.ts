/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import schedule from "node-schedule";
import _ from "lodash";
import { IPCLogger } from "../logger";
import { state } from "../kmq_worker";
import { sendInfoMessage } from "./discord_utils";
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
import {
    cleanupInactiveGameSessions,
    getMatchingGroupNames,
} from "./game_utils";
import dbContext from "../database_context";
import debugHandler from "../events/client/debug";
import guildCreateHandler from "../events/client/guildCreate";
import guildDeleteHandler from "../events/client/guildDelete";
import unavailableGuildCreateHandler from "../events/client/unavailableGuildCreate";
import guildAvailableHandler from "../events/client/guildAvailable";
import interactionCreateHandler from "../events/client/interactionCreate";
import { chooseRandom } from "./utils";
import { reloadFactCache } from "../fact_generator";
import MessageContext from "../structures/message_context";
import { EnvType } from "../types";
import channelDeleteHandler from "../events/client/channelDelete";
import { LocaleType } from "./localization_manager";

const logger = new IPCLogger("management_utils");

const RESTART_WARNING_INTERVALS = new Set([10, 5, 3, 2, 1]);

/** Registers listeners on client events */
export function registerClientEvents(): void {
    const { client } = state;
    // remove listeners registered by eris-fleet, handle on cluster instead
    client.removeAllListeners("warn");
    client.removeAllListeners("error");

    // register listeners
    client
        .on("messageCreate", messageCreateHandler)
        .on("voiceChannelLeave", voiceChannelLeaveHandler)
        .on("voiceChannelSwitch", voiceChannelSwitchHandler)
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
        for (const gameSession of Object.values(state.gameSessions)) {
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
        state.client.voiceConnections.keys()
    ) as Array<string>;

    const activeVoiceChannelGuildIDs = Object.values(state.gameSessions).map(
        (x) => x.guildID
    );

    for (const existingVoiceChannelGuildID of existingVoiceChannelGuildIDs) {
        if (!activeVoiceChannelGuildIDs.includes(existingVoiceChannelGuildID)) {
            const voiceChannelID = state.client.voiceConnections.get(
                existingVoiceChannelGuildID
            ).channelID;

            logger.info(
                `gid: ${existingVoiceChannelGuildID}, vid: ${voiceChannelID} | Disconnected inactive voice connection`
            );
            state.client.voiceConnections.leave(existingVoiceChannelGuildID);
        }
    }
}

/* Updates system statistics */
async function updateSystemStats(clusterID: number): Promise<void> {
    const { client } = state;
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
    const { client } = state;
    const timeUntilRestart = await getTimeUntilRestart();
    if (timeUntilRestart) {
        client.editStatus("dnd", {
            name: `Restarting in ${timeUntilRestart} minutes...`,
            type: 1,
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
        name: `"${randomPopularSong["song_name"]}" by ${randomPopularSong["artist_name"]}`,
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

    const hangulSongMapping = await dbContext
        .kmq("available_songs")
        .select(["link", "hangul_song_name"])
        .where("hangul_song_name", "<>", "");

    const artistAliasMapping = await dbContext
        .kmq("available_songs")
        .distinct(["artist_name", "artist_aliases"])
        .select(["artist_name", "artist_aliases"])
        .where("artist_aliases", "<>", "");

    const hangulArtistMapping = await dbContext
        .kmq("available_songs")
        .distinct(["artist_name", "hangul_artist_name"])
        .select(["artist_name", "hangul_artist_name"])
        .where("hangul_artist_name", "<>", "");

    const songAliases = {};
    for (const mapping of songAliasMapping) {
        songAliases[mapping["link"]] = mapping["song_aliases"]
            .split(";")
            .filter((x: string) => x);
    }

    const songHangul = {};
    for (const mapping of hangulSongMapping) {
        songHangul[mapping["link"]] = mapping["hangul_song_name"];
    }

    const artistAliases = {};
    for (const mapping of artistAliasMapping) {
        artistAliases[mapping["artist_name"]] = mapping["artist_aliases"]
            .split(";")
            .filter((x: string) => x);
    }

    const artistHangul = {};
    for (const mapping of hangulArtistMapping) {
        artistHangul[mapping["artist_name"]] = mapping["hangul_artist_name"];
    }

    state.aliases.artist = artistAliases;
    state.aliases.artistHangul = artistHangul;
    state.aliases.song = songAliases;
    state.aliases.songHangul = songHangul;
    logger.info("Reloaded alias data");
}

/** Reload bonus groups (same groups chosen on the same day) */
export async function reloadBonusGroups(): Promise<void> {
    const bonusGroupCount = 10;
    const date = new Date();
    const artistNameQuery: string[] = (
        await dbContext
            .kmq("kpop_groups")
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

    state.bonusArtists = new Set(
        (await getMatchingGroupNames(artistNameQuery)).matchedGroups.map(
            (x) => x.name
        )
    );
}

async function reloadLocales(): Promise<void> {
    const updatedLocales = await dbContext.kmq("locale").select("*");
    for (const l of updatedLocales) {
        state.locales[l.guild_id] = l.locale as LocaleType;
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
        reloadBonusGroups();
    });

    // every 5 minutes
    schedule.scheduleJob("*/5 * * * *", async () => {
        reloadAliases();
        clearInactiveVoiceConnections();
        await updateSystemStats(clusterID);
    });
}

/** Reloads caches */
export async function reloadCaches(): Promise<void> {
    reloadAliases();
    reloadFactCache();
    reloadBonusGroups();
    reloadLocales();
}

/**
 * Deletes the GameSession corresponding to a given guild ID
 * @param guildID - The guild ID
 */
export function deleteGameSession(guildID: string): void {
    if (!(guildID in state.gameSessions)) {
        logger.debug(`gid: ${guildID} | GameSession already ended`);
        return;
    }

    delete state.gameSessions[guildID];
}
