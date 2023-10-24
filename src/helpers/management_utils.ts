/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import { IPCLogger } from "../logger";
import { chooseRandom, delay, isPrimaryInstance, isWeekend } from "./utils";
import {
    cleanupInactiveGameSessions,
    cleanupInactiveListeningSessions,
    getMatchingGroupNames,
    isPowerHour,
} from "./game_utils";
import { normalizePunctuationInName } from "../structures/game_round";
import { reloadFactCache } from "../fact_generator";
import { sendInfoMessage, sendPowerHourNotification } from "./discord_utils";
import { sql } from "kysely";
import KmqConfiguration from "../kmq_configuration";
import MessageContext from "../structures/message_context";
import State from "../state";
import _ from "lodash";
import dbContext from "../database_context";
import i18n from "./localization_manager";
import schedule from "node-schedule";
import updatePremiumUsers from "./patreon_manager";
import type LocaleType from "../enums/locale_type";
import type MatchedArtist from "../interfaces/matched_artist";

const logger = new IPCLogger("management_utils");
const RESTART_WARNING_INTERVALS = new Set([10, 5, 3, 2, 1]);

/**
 * Gets the remaining time until the next server restart
 * @returns null if no restart is imminent, a date in epoch milliseconds
 */
export function getTimeUntilRestart(): number | null {
    if (!State.restartNotification?.restartDate) return null;
    const restartNotificationTime =
        State.restartNotification.restartDate.getTime();

    return Math.ceil(
        (restartNotificationTime - new Date().getTime()) / (1000 * 60)
    );
}

/**
 * Sends a warning message to all active GameSessions for impending restarts at predefined intervals
 * @param timeUntilRestart - time until the restart
 */
export async function warnServersImpendingRestart(
    timeUntilRestart: number
): Promise<void> {
    let serversWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeUntilRestart)) {
        for (const gameSession of Object.values(State.gameSessions)) {
            if (gameSession.finished) continue;
            // eslint-disable-next-line no-await-in-loop
            await sendInfoMessage(
                new MessageContext(
                    gameSession.textChannelID,
                    null,
                    gameSession.guildID
                ),
                {
                    title: i18n.translate(
                        gameSession.guildID,
                        "misc.restart.title",
                        {
                            timeUntilRestart: String(timeUntilRestart),
                        }
                    ),
                    description: i18n.translate(
                        gameSession.guildID,
                        "misc.restart.description_hard",
                        {
                            downtimeMinutes: String(5),
                        }
                    ),
                }
            );
            // eslint-disable-next-line no-await-in-loop
            await delay(200);
            serversWarned++;
        }

        logger.info(
            `Impending bot restart in ${timeUntilRestart} minutes. ${serversWarned} servers warned.`
        );
    }
}

/** Clear inactive voice connections */
function clearInactiveVoiceConnections(): void {
    const existingVoiceChannelGuildIDs = Array.from(
        State.client.voiceConnections.keys()
    ) as Array<string>;

    const activeGameVoiceChannelGuildIDs = new Set(
        Object.values(State.gameSessions).map((x) => x.guildID)
    );

    const activeListeningVoiceChannelGuildIDs = new Set(
        Object.values(State.listeningSessions).map((x) => x.guildID)
    );

    for (const existingVoiceChannelGuildID of existingVoiceChannelGuildIDs) {
        if (
            !activeGameVoiceChannelGuildIDs.has(existingVoiceChannelGuildID) &&
            !activeListeningVoiceChannelGuildIDs.has(
                existingVoiceChannelGuildID
            )
        ) {
            const voiceConnection = State.client.voiceConnections.get(
                existingVoiceChannelGuildID
            );

            if (voiceConnection) {
                const voiceChannelID = voiceConnection.channelID;

                logger.info(
                    `gid: ${existingVoiceChannelGuildID}, vid: ${voiceChannelID} | Disconnected inactive voice connection`
                );

                try {
                    State.client.voiceConnections.leave(
                        existingVoiceChannelGuildID
                    );
                } catch (e) {
                    logger.error(
                        `Failed to disconnect inactive voice connection for gid: ${existingVoiceChannelGuildID}. err = ${e}`
                    );
                }
            }
        }
    }
}

/* Updates system statistics */
async function updateSystemStats(clusterID: number): Promise<void> {
    const { client } = State;
    const latencies = client.shards.map((x) => x.latency);
    const meanLatency = _.mean(latencies);
    const maxLatency = _.max(latencies) as number;
    const minLatency = _.min(latencies) as number;
    if ([meanLatency, maxLatency, minLatency].some((x) => x === Infinity))
        return;

    await dbContext.kmq
        .insertInto("system_stats")
        .values({
            cluster_id: clusterID,
            stat_name: "mean_latency",
            stat_value: meanLatency,
            date: new Date(),
        })
        .execute();

    await dbContext.kmq
        .insertInto("system_stats")
        .values({
            cluster_id: clusterID,
            stat_name: "min_latency",
            stat_value: minLatency,
            date: new Date(),
        })
        .execute();

    await dbContext.kmq
        .insertInto("system_stats")
        .values({
            cluster_id: clusterID,
            stat_name: "max_latency",
            stat_value: maxLatency,
            date: new Date(),
        })
        .execute();
}

/** Updates the bot's song listening status */
export async function updateBotStatus(): Promise<void> {
    const { client } = State;
    const timeUntilRestart = getTimeUntilRestart();
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

    const randomPopularSongs = await dbContext.kmq
        .selectFrom("available_songs")
        .select(["song_name_en", "artist_name_en", "link"])
        .orderBy("publishedon", "desc")
        .limit(25)
        .execute();

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
    const songAliasMapping = await dbContext.kmq
        .selectFrom("available_songs")
        .select(["link", "song_aliases"])
        .where("song_aliases", "<>", "")
        .execute();

    const artistAliasMapping: {
        artist_name_en: string;
        artist_aliases: string;
        previous_name_en: string | null;
        previous_name_ko: string | null;
    }[] = await dbContext.kmq
        .selectFrom("available_songs")
        .select([
            "artist_name_en",
            "artist_aliases",
            "previous_name_en",
            "previous_name_ko",
        ])
        .distinct()
        .where(({ or, eb }) =>
            or([
                eb("artist_aliases", "<>", ""),
                eb("previous_name_en", "<>", ""),
                eb("previous_name_ko", "<>", ""),
            ])
        )
        .execute();

    const songAliases: { [songName: string]: string[] } = {};
    for (const mapping of songAliasMapping) {
        songAliases[mapping["link"]] = mapping["song_aliases"]
            .split(";")
            .filter((x: string) => x);
    }

    const artistAliases: { [artistName: string]: string[] } = {};
    for (const mapping of artistAliasMapping) {
        const aliases: Array<string> = mapping["artist_aliases"]
            .split(";")
            .filter((x: string) => x);

        const previousNameEn = mapping["previous_name_en"];
        const previousNameKo = mapping["previous_name_ko"];

        if (previousNameEn) aliases.push(previousNameEn);
        if (previousNameKo) aliases.push(previousNameKo);

        artistAliases[mapping["artist_name_en"]] = aliases;
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
        await dbContext.kpopVideos
            .selectFrom("app_kpop_group")
            .select(["name"])
            .where("is_collab", "=", "n")
            .orderBy(
                sql`RAND(${
                    date.getFullYear() +
                    date.getMonth() * 997 +
                    date.getDate() * 37
                })`
            )
            .limit(bonusGroupCount)
            .execute()
    ).map((x) => x.name);

    State.bonusArtists = new Set(
        (await getMatchingGroupNames(artistNameQuery)).matchedGroups.map(
            (x) => x.name
        )
    );
}

async function reloadArtists(): Promise<void> {
    const artistAliasMapping = await dbContext.kmq
        .selectFrom("available_songs")
        .select([
            "artist_name_en",
            "artist_name_ko",
            "artist_aliases",
            "id_artist",
        ])
        .distinct()
        .where("artist_name_en", "not like", "%+%")
        .execute();

    for (const mapping of artistAliasMapping) {
        const aliases = mapping["artist_aliases"]
            .split(";")
            .filter((x: string) => x);

        const artistEntry = {
            name: mapping["artist_name_en"],
            hangulName: mapping["artist_name_ko"],
            id: mapping["id_artist"],
        } as MatchedArtist;

        State.artistToEntry[
            normalizePunctuationInName(mapping["artist_name_en"])
        ] = artistEntry;

        if (mapping["artist_name_ko"]) {
            State.artistToEntry[mapping["artist_name_ko"]] = artistEntry;
        }

        for (const alias in aliases) {
            if (alias.length > 0) {
                State.artistToEntry[normalizePunctuationInName(alias)] =
                    artistEntry;
            }
        }
    }

    State.topArtists = await dbContext.kmq
        .selectFrom("available_songs")
        .innerJoin(
            "kpop_videos.app_kpop_group",
            "available_songs.id_artist",
            "app_kpop_group.id"
        )
        .select([
            "id_artist as id",
            "artist_name_en as name",
            "artist_name_ko as hangulName",
        ])
        .orderBy((eb) => eb.fn("SUM", ["views"]), "desc")
        .groupBy("id_artist")
        .limit(25)
        .execute();
}

async function reloadSongs(): Promise<void> {
    const songMapping = await dbContext.kmq
        .selectFrom("available_songs")
        .select([
            "link",
            "song_name_en",
            "song_name_ko",
            "id_artist",
            "clean_song_name_en",
            "clean_song_name_ko",
        ])
        .execute();

    for (const mapping of songMapping) {
        const songEntry = {
            name: mapping["song_name_en"],
            hangulName: mapping["song_name_ko"],
            artistID: mapping["id_artist"],
            songLink: mapping["link"],
            cleanName: normalizePunctuationInName(
                mapping["clean_song_name_en"]
            ),
            hangulCleanName: normalizePunctuationInName(
                mapping["clean_song_name_ko"]
            ),
        };

        State.songLinkToEntry[songEntry.songLink] = songEntry;
    }

    State.newSongs = await dbContext.kmq
        .selectFrom("available_songs")
        .select([
            "link as songLink",
            "song_name_en as name",
            "song_name_ko as hangulName",
            "id_artist as artistID",
        ])
        .orderBy("publishedon", "desc")
        .limit(25)
        .execute();
}

async function reloadLocales(): Promise<void> {
    const updatedLocales = await dbContext.kmq
        .selectFrom("locale")
        .select(["locale", "guild_id"])
        .execute();

    for (const l of updatedLocales) {
        State.locales[l.guild_id] = l.locale as LocaleType;
    }
}

function clearCachedSpotifyPlaylists(): void {
    State.spotifyManager.cachedPlaylists = {};
}

function cleanupSpotifyParsingLocks(): void {
    State.spotifyManager.cleanupSpotifyParsingLocks();
}

/**
 * Clears any existing restart timers
 */
export function clearRestartNotification(): void {
    State.restartNotification = null;
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
        // Groups used for autocomplete
        reloadArtists();
        // Songs used for autocomplete
        reloadSongs();
        // Removed cached Spotify playlists
        clearCachedSpotifyPlaylists();
    });

    // Every hour
    schedule.scheduleJob("0 * * * *", () => {
        if (!isPowerHour() || isWeekend()) return;
        if (!State.client.guilds.has(process.env.DEBUG_SERVER_ID as string))
            return;
        // Ping a role in KMQ server notifying of power hour
        sendPowerHourNotification();
    });

    // Every 10 minutes
    schedule.scheduleJob("*/10 * * * *", () => {
        // Cleanup inactive game sessions
        cleanupInactiveGameSessions();
        // Cleanup inactive listening sessions
        cleanupInactiveListeningSessions();
        // Change bot's status (song playing, power hour, etc.)
        updateBotStatus();
        // Clear any guilds stuck in parsing Spotify state
        cleanupSpotifyParsingLocks();
    });

    // Every 5 minutes
    schedule.scheduleJob("*/5 * * * *", async () => {
        // Update song/artist aliases
        reloadAliases();
        // Cleanup inactive Discord voice connections
        clearInactiveVoiceConnections();

        if (await isPrimaryInstance()) {
            // Store per-cluster stats
            await updateSystemStats(clusterID);
        }
    });

    // Every minute
    schedule.scheduleJob("* * * * *", async () => {
        KmqConfiguration.reload();
        // set up check for restart notifications
        const timeUntilRestart = getTimeUntilRestart();
        if (timeUntilRestart && State.restartNotification) {
            updateBotStatus();
            await warnServersImpendingRestart(timeUntilRestart);
        }

        // Sync state with Patreon subscribers
        if (await isPrimaryInstance()) {
            updatePremiumUsers();
        }
    });
}

/** Reloads caches */
export function reloadCaches(): void {
    reloadAliases();
    reloadArtists();
    reloadFactCache();
    reloadBonusGroups();
    reloadLocales();
    reloadSongs();
}
