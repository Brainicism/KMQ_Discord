/* eslint-disable global-require */
import Eris from "eris";
/* eslint-disable import/no-dynamic-require */
import { IPCLogger } from "../logger";
import { chooseRandom, delay, isPrimaryInstance, isWeekend } from "./utils";
import {
    cleanupInactiveGameSessions,
    cleanupInactiveListeningSessions,
    isPowerHour,
} from "./game_utils";
import { sendInfoMessage, sendPowerHourNotification } from "./discord_utils";
import { sql } from "kysely";
import GameRound from "../structures/game_round";
import KmqConfiguration from "../kmq_configuration";
import MessageContext from "../structures/message_context";
import NewsCommand from "../commands/misc_commands/news";
import NewsRange from "../enums/news_range";
import State from "../state";
import _ from "lodash";
import dbContext from "../database_context";
import i18n from "./localization_manager";
import schedule from "node-schedule";
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
        (restartNotificationTime - new Date().getTime()) / (1000 * 60),
    );
}

/**
 * Sends a warning message to all active GameSessions for impending restarts at predefined intervals
 * @param timeUntilRestart - time until the restart
 */
export async function warnServersImpendingRestart(
    timeUntilRestart: number,
): Promise<void> {
    let serversWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeUntilRestart)) {
        for (const session of [
            ...Object.values(State.gameSessions),
            ...Object.values(State.listeningSessions),
        ]) {
            if (session.finished) continue;
            // eslint-disable-next-line no-await-in-loop
            await sendInfoMessage(
                new MessageContext(
                    session.textChannelID,
                    null,
                    session.guildID,
                ),
                {
                    title: i18n.translate(
                        session.guildID,
                        "misc.restart.title",
                        {
                            timeUntilRestart: String(timeUntilRestart),
                        },
                    ),
                    description: i18n.translate(
                        session.guildID,
                        "misc.restart.description_hard",
                        {
                            downtimeMinutes: String(5),
                        },
                    ),
                },
            );
            // eslint-disable-next-line no-await-in-loop
            await delay(200);
            serversWarned++;
        }

        logger.info(
            `Impending bot restart in ${timeUntilRestart} minutes. ${serversWarned} servers warned.`,
        );
    }
}

/** Clear inactive voice connections */
function clearInactiveVoiceConnections(): void {
    const existingVoiceChannelGuildIDs = Array.from(
        State.client.voiceConnections.keys(),
    ) as Array<string>;

    const activeGameVoiceChannelGuildIDs = new Set(
        Object.values(State.gameSessions).map((x) => x.guildID),
    );

    const activeListeningVoiceChannelGuildIDs = new Set(
        Object.values(State.listeningSessions).map((x) => x.guildID),
    );

    for (const existingVoiceChannelGuildID of existingVoiceChannelGuildIDs) {
        if (
            !activeGameVoiceChannelGuildIDs.has(existingVoiceChannelGuildID) &&
            !activeListeningVoiceChannelGuildIDs.has(
                existingVoiceChannelGuildID,
            )
        ) {
            const voiceConnection = State.client.voiceConnections.get(
                existingVoiceChannelGuildID,
            );

            if (voiceConnection) {
                const voiceChannelID = voiceConnection.channelID;

                logger.info(
                    `gid: ${existingVoiceChannelGuildID}, vid: ${voiceChannelID} | Disconnected inactive voice connection`,
                );

                try {
                    State.client.voiceConnections.leave(
                        existingVoiceChannelGuildID,
                    );
                } catch (e) {
                    logger.error(
                        `Failed to disconnect inactive voice connection for gid: ${existingVoiceChannelGuildID}. err = ${e}`,
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
            type: Eris.Constants.ActivityTypes.STREAMING,
        });
        return;
    }

    if (isPowerHour() && !isWeekend()) {
        client.editStatus("online", {
            name: "🎶 Power Hour! 🎶",
            type: Eris.Constants.ActivityTypes.COMPETING,
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

    client.editStatus("online", {
        name: `"${randomPopularSong["song_name_en"]}" by ${randomPopularSong["artist_name_en"]}`,
        type: Eris.Constants.ActivityTypes.STREAMING,
        url: `https://www.youtube.com/watch?v=${randomPopularSong["link"]}`,
    });
}

/** Reload song/artist aliases */
export async function reloadAliases(): Promise<void> {
    const songAliasMapping = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .select(["vlink as link", "alias as song_aliases"])
        .where("alias", "<>", "")
        .execute();

    const artistAliasMapping: {
        artist_name_en: string;
        artist_aliases: string;
        previous_name_en: string | null;
        previous_name_ko: string | null;
        full_artist_name: string | null;
    }[] = await dbContext.kpopVideos
        .selectFrom("app_kpop_group_safe")
        .select([
            "name as artist_name_en",
            "alias as artist_aliases",
            "previous_name as previous_name_en",
            "previous_kname as previous_name_ko",
            "fname as full_artist_name",
        ])
        .distinct()
        .where(({ or, eb }) =>
            or([
                eb("alias", "<>", ""),
                eb("previous_name", "<>", ""),
                eb("previous_kname", "<>", ""),
                eb("fname", "<>", ""),
            ]),
        )
        .execute();

    const songAliases: { [songName: string]: string[] } = {};
    for (const mapping of songAliasMapping) {
        songAliases[mapping["link"]] = mapping["song_aliases"]
            .split(";")
            .map((x) => x.trim())
            .filter((x: string) => x);
    }

    const artistAliases: { [artistName: string]: string[] } = {};
    for (const mapping of artistAliasMapping) {
        const aliases: Array<string> = mapping["artist_aliases"]
            .split(";")
            .map((x) => x.trim())
            .filter((x: string) => x);

        const previousNameEn = mapping["previous_name_en"];
        const previousNameKo = mapping["previous_name_ko"];
        const fullArtistName = mapping["full_artist_name"];

        if (previousNameEn) aliases.push(previousNameEn);
        if (previousNameKo) aliases.push(previousNameKo);
        if (fullArtistName) aliases.push(fullArtistName);

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
            .selectFrom("app_kpop_group_safe")
            .select(["name"])
            .where("is_collab", "=", "n")
            .where("has_songs", "=", 1)
            .orderBy(
                sql`RAND(${
                    date.getFullYear() +
                    date.getMonth() * 997 +
                    date.getDate() * 37
                })`,
            )
            .limit(bonusGroupCount)
            .execute()
    )
        .map((x) => x.name)
        .sort();

    State.bonusArtists = new Set(artistNameQuery);
}

/**
 *Reload artist name data for autocomplete
 */
export async function reloadArtists(): Promise<void> {
    const artistAliasMapping = await dbContext.kmq
        .selectFrom("available_songs")
        .select([
            "artist_name_en",
            "artist_name_ko",
            "artist_aliases",
            "id_artist",
        ])
        .distinct()
        .where("artist_name_en", "not like", "% + %")
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
            GameRound.normalizePunctuationInName(mapping["artist_name_en"])
        ] = artistEntry;

        if (mapping["artist_name_ko"]) {
            State.artistToEntry[mapping["artist_name_ko"]] = artistEntry;
        }

        for (const alias in aliases) {
            if (alias.length > 0) {
                State.artistToEntry[
                    GameRound.normalizePunctuationInName(alias)
                ] = artistEntry;
            }
        }
    }

    State.topArtists = (
        await dbContext.kmq
            .selectFrom("available_songs")
            .innerJoin(
                "kpop_videos.app_kpop_group",
                "available_songs.id_artist",
                "app_kpop_group.id",
            )
            .select([
                "available_songs.id_artist as id",
                "available_songs.artist_name_en as name",
                "available_songs.artist_name_ko as hangulName",
            ])
            .orderBy((eb) => eb.fn("SUM", ["available_songs.views"]), "desc")
            .groupBy("available_songs.id_artist")
            .limit(25)
            .execute()
    ).map((x) => ({
        id: x.id,
        name: x.name,
        hangulName: x.hangulName,
    }));
}

/**
 * Reload song names for autocomplete
 */
export async function reloadSongs(): Promise<void> {
    const songMapping = await dbContext.kmq
        .selectFrom("available_songs")
        .select(["link", "song_name_en", "song_name_ko", "id_artist"])
        .execute();

    for (const mapping of songMapping) {
        const songEntry = {
            name: mapping["song_name_en"],
            hangulName: mapping["song_name_ko"],
            artistID: mapping["id_artist"],
            songLink: mapping["link"],
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

function cleanupPlaylistParsingLocks(): void {
    State.playlistManager.cleanupPlaylistParsingLocks();
}

/**
 * Clears any existing restart timers
 */
export function clearRestartNotification(): void {
    State.restartNotification = null;
}

async function reloadBanData(): Promise<void> {
    const bannedServers = (
        await dbContext.kmq.selectFrom("banned_servers").select("id").execute()
    ).map((x) => x.id);

    State.bannedServers = new Set(bannedServers);

    const bannedPlayers = (
        await dbContext.kmq.selectFrom("banned_players").select("id").execute()
    ).map((x) => x.id);

    State.bannedPlayers = new Set(bannedPlayers);
}

async function sendNewsNotifications(newsRange: NewsRange): Promise<void> {
    if (!KmqConfiguration.Instance.newsSubscriptionsEnabled()) {
        return;
    }

    const subscriptions = await dbContext.kmq
        .selectFrom("news_subscriptions")
        .selectAll()
        .where("range", "=", newsRange)
        .execute();

    logger.info(
        `Sending ${newsRange} news notifications to ${subscriptions.length} channels`,
    );

    for (const subscription of subscriptions) {
        if (!State.client.guilds.has(subscription.guild_id)) continue;

        const subscriptionContext = new MessageContext(
            subscription.text_channel_id,
            null,
            subscription.guild_id,
        );

        try {
            // eslint-disable-next-line no-await-in-loop
            await NewsCommand.sendNews(
                subscriptionContext,
                subscription.range as NewsRange,
                true,
            );
        } catch (e) {
            logger.warn(
                `Failed to send news for guild ${subscriptionContext.guildID}. e = ${e}`,
            );
        }
    }
}

/**
 * @param clusterID - The cluster ID
 *  Sets up recurring cron-based tasks
 * */
export function registerIntervals(clusterID: number): void {
    // busiest times for r/kpop are 6pm and midnight KST
    // 15:00 UTC => midnight KST (busiest time for r/kpop)
    // wait a couple hours for NA to upvote posts
    schedule.scheduleJob("0 18 * * *", async () => {
        await sendNewsNotifications(NewsRange.DAILY);
    });

    schedule.scheduleJob("5 18 * * 0", async () => {
        await sendNewsNotifications(NewsRange.WEEKLY);
    });

    schedule.scheduleJob("10 18 1 * *", async () => {
        await sendNewsNotifications(NewsRange.MONTHLY);
    });

    // Everyday at 12am UTC => 7pm ET
    schedule.scheduleJob("0 0 * * *", async () => {
        // New bonus groups
        await reloadBonusGroups();
    });

    // Every hour
    schedule.scheduleJob("0 * * * *", async () => {
        if (isPowerHour() && !isWeekend()) {
            // Ping a role in KMQ server notifying of power hour
            await sendPowerHourNotification();
        }
    });

    // Every 10 minutes
    schedule.scheduleJob("*/10 * * * *", async () => {
        // Cleanup inactive game sessions
        await cleanupInactiveGameSessions(State.gameSessions);
        // Cleanup inactive listening sessions
        await cleanupInactiveListeningSessions(State.listeningSessions);
        // Change bot's status (song playing, power hour, etc.)
        await updateBotStatus();
        // Clear any guilds stuck in parsing Playlist state
        cleanupPlaylistParsingLocks();
        // Reload ban data
        await reloadBanData();
    });

    // Every 5 minutes
    schedule.scheduleJob("*/5 * * * *", async () => {
        // Update song/artist aliases
        await reloadAliases();
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
            await updateBotStatus();
            await warnServersImpendingRestart(timeUntilRestart);
        }
    });
}

/** Reloads caches */
export async function reloadCaches(): Promise<void> {
    await reloadAliases();
    await reloadArtists();
    await reloadBonusGroups();
    await reloadLocales();
    await reloadSongs();
    await reloadBanData();
}
