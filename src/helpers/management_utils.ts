/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import { IPCLogger } from "../logger";
import { chooseRandom, delay, isWeekend } from "./utils";
import { isPowerHour } from "./game_utils";
import { sendInfoMessage } from "./discord_utils";
import { sql } from "kysely";
import GameRound from "../structures/game_round";
import KmqConfiguration from "../kmq_configuration";
import MessageContext from "../structures/message_context";
import NewsCommand from "../commands/misc_commands/news";
import _ from "lodash";
import dbContext from "../database_context";
import i18n from "./localization_manager";
import type {
    ArtistAliasCache,
    ArtistCache,
    BannedPlayerCache,
    BannedServerCache,
    BonusGroupCache,
    LocaleCache,
    NewSongCache,
    SongAliasCache,
    SongCache,
    TopArtistCache,
} from "../interfaces/worker_cache";
import type GameSession from "../structures/game_session";
import type KmqClient from "../kmq_client";
import type ListeningSession from "../structures/listening_session";
import type LocaleType from "../enums/locale_type";
import type MatchedArtist from "../interfaces/matched_artist";
import type NewsRange from "../enums/news_range";
import type NewsSubscription from "../interfaces/news_subscription";
import type PlaylistManager from "./playlist_manager";
import type RestartNotification from "../interfaces/restart_notification";
import type WorkerCache from "../interfaces/worker_cache";

const logger = new IPCLogger("management_utils");
const RESTART_WARNING_INTERVALS = new Set([10, 5, 3, 2, 1]);

/**
 * Gets the remaining time until the next server restart
 * @param restartNotification - The restart notification
 * @returns null if no restart is imminent, a date in epoch milliseconds
 */
export function getTimeUntilRestart(
    restartNotification: RestartNotification | null,
): number | null {
    if (!restartNotification?.restartDate) return null;
    const restartNotificationTime = restartNotification.restartDate.getTime();

    return Math.ceil(
        (restartNotificationTime - new Date().getTime()) / (1000 * 60),
    );
}

/**
 * Sends a warning message to all active GameSessions for impending restarts at predefined intervals
 * @param gameSessions - The active game sessions
 * @param listeningSessions - The active listening sessions
 * @param timeUntilRestart - time until the restart
 */
export async function warnServersImpendingRestart(
    gameSessions: { [guildID: string]: GameSession },
    listeningSessions: { [guildID: string]: ListeningSession },
    timeUntilRestart: number,
): Promise<void> {
    let serversWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeUntilRestart)) {
        for (const session of [
            ...Object.values(gameSessions),
            ...Object.values(listeningSessions),
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

/** Clear inactive voice connections
 * @param client - The bot client
 * @param gameSessions - Existing game sessions
 * @param listeningSessions - Existing listening sessions
 */
export function clearInactiveVoiceConnections(
    client: KmqClient,
    gameSessions: { [guildID: string]: GameSession },
    listeningSessions: { [guildID: string]: ListeningSession },
): void {
    const existingVoiceChannelGuildIDs = Array.from(
        client.voiceConnections.keys(),
    ) as Array<string>;

    const activeGameVoiceChannelGuildIDs = new Set(
        Object.values(gameSessions).map((x) => x.guildID),
    );

    const activeListeningVoiceChannelGuildIDs = new Set(
        Object.values(listeningSessions).map((x) => x.guildID),
    );

    for (const existingVoiceChannelGuildID of existingVoiceChannelGuildIDs) {
        if (
            !activeGameVoiceChannelGuildIDs.has(existingVoiceChannelGuildID) &&
            !activeListeningVoiceChannelGuildIDs.has(
                existingVoiceChannelGuildID,
            )
        ) {
            const voiceConnection = client.voiceConnections.get(
                existingVoiceChannelGuildID,
            );

            if (voiceConnection) {
                const voiceChannelID = voiceConnection.channelID;

                logger.info(
                    `gid: ${existingVoiceChannelGuildID}, vid: ${voiceChannelID} | Disconnected inactive voice connection`,
                );

                try {
                    client.voiceConnections.leave(existingVoiceChannelGuildID);
                } catch (e) {
                    logger.error(
                        `Failed to disconnect inactive voice connection for gid: ${existingVoiceChannelGuildID}. err = ${e}`,
                    );
                }
            }
        }
    }
}

/** Updates system statistics
 * @param client - The bot client
 * @param clusterID - The cluster ID
 */
export async function updateSystemStats(
    client: KmqClient,
    clusterID: number,
): Promise<void> {
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

/** Updates the bot's song listening status
 * @param client - The bot client
 * @param restartNotification - The restart notification
 */
export async function updateBotStatus(
    client: KmqClient,
    restartNotification: RestartNotification | null,
): Promise<void> {
    const timeUntilRestart = getTimeUntilRestart(restartNotification);
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

    client.editStatus("online", {
        name: `"${randomPopularSong["song_name_en"]}" by ${randomPopularSong["artist_name_en"]}`,
        type: 1,
        url: `https://www.youtube.com/watch?v=${randomPopularSong["link"]}`,
    });
}

/** Reload artist aliases
 * @returns the updated artist aliases
 */
export async function reloadArtistAliases(): Promise<ArtistAliasCache> {
    const artistAliasMapping: {
        artist_name_en: string;
        artist_aliases: string;
        previous_name_en: string | null;
        previous_name_ko: string | null;
        full_artist_name: string | null;
    }[] = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
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

    return artistAliases;
}

/** Reload song aliases
 * @returns the updated song aliases
 */
export async function reloadSongAliases(): Promise<SongAliasCache> {
    const songAliasMapping = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .select(["vlink as link", "alias as song_aliases"])
        .where("alias", "<>", "")
        .execute();

    const songAliases: { [songName: string]: string[] } = {};
    for (const mapping of songAliasMapping) {
        songAliases[mapping["link"]] = mapping["song_aliases"]
            .split(";")
            .map((x) => x.trim())
            .filter((x: string) => x);
    }

    logger.info("Reloaded alias data");
    return songAliases;
}

/** Reload bonus groups (same groups chosen on the same day)
 * @returns the updated bonus groups
 */
export async function reloadBonusGroups(): Promise<BonusGroupCache> {
    const bonusGroupCount = 10;
    const date = new Date();
    const artistNameQuery: string[] = (
        await dbContext.kpopVideos
            .selectFrom("app_kpop_group")
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

    return new Set(artistNameQuery);
}

/**
 *Reload artist name data for autocomplete
 @returns the updated artists and top artists
 */
export async function reloadArtists(): Promise<ArtistCache> {
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

    const artistToEntry: { [artistNameOrAlias: string]: MatchedArtist } = {};

    for (const mapping of artistAliasMapping) {
        const aliases = mapping["artist_aliases"]
            .split(";")
            .filter((x: string) => x);

        const artistEntry = {
            name: mapping["artist_name_en"],
            hangulName: mapping["artist_name_ko"],
            id: mapping["id_artist"],
        } as MatchedArtist;

        artistToEntry[
            GameRound.normalizePunctuationInName(mapping["artist_name_en"])
        ] = artistEntry;

        if (mapping["artist_name_ko"]) {
            artistToEntry[mapping["artist_name_ko"]] = artistEntry;
        }

        for (const alias in aliases) {
            if (alias.length > 0) {
                artistToEntry[GameRound.normalizePunctuationInName(alias)] =
                    artistEntry;
            }
        }
    }

    return artistToEntry;
}

/**
 * Reloads the top artists
 * @returns the updated top artists
 */
export async function reloadTopArtists(): Promise<TopArtistCache> {
    return dbContext.kmq
        .selectFrom("available_songs")
        .innerJoin(
            "kpop_videos.app_kpop_group",
            "available_songs.id_artist",
            "app_kpop_group.id",
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

/**
 * Reload song names for autocomplete
 * @returns the updated songs mapping
 */
export async function reloadSongs(): Promise<SongCache> {
    const songMapping = await dbContext.kmq
        .selectFrom("available_songs")
        .select(["link", "song_name_en", "song_name_ko", "id_artist"])
        .execute();

    const songLinkToEntry: {
        [songLink: string]: {
            name: string;
            hangulName: string | null;
            artistID: number;
        };
    } = {};

    for (const mapping of songMapping) {
        const songEntry = {
            name: mapping["song_name_en"],
            hangulName: mapping["song_name_ko"],
            artistID: mapping["id_artist"],
            songLink: mapping["link"],
        };

        songLinkToEntry[songEntry.songLink] = songEntry;
    }

    return songLinkToEntry;
}

/**
 * Reloads new songs
 * @returns newly added songs
 */
export async function reloadNewSongs(): Promise<NewSongCache> {
    return dbContext.kmq
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

/**
 * Reloads server locales
 * @returns the updated locales
 */
export async function reloadLocales(): Promise<LocaleCache> {
    const updatedLocales = await dbContext.kmq
        .selectFrom("locale")
        .select(["locale", "guild_id"])
        .execute();

    const locales: { [guildID: string]: LocaleType } = {};
    for (const l of updatedLocales) {
        locales[l.guild_id] = l.locale as LocaleType;
    }

    return locales;
}

/**
 * Removes any stale playlist locks
 * @param playlistManager - The playlist manager
 */
export function cleanupPlaylistParsingLocks(
    playlistManager: PlaylistManager,
): void {
    playlistManager.cleanupPlaylistParsingLocks();
}

/**
 * Reloads the banned servers
 * @returns the updated banned servers
 */
export async function reloadBannedServers(): Promise<BannedServerCache> {
    const bannedServers = (
        await dbContext.kmq.selectFrom("banned_servers").select("id").execute()
    ).map((x) => x.id);

    return new Set(bannedServers);
}

/**
 * Reloads the banned players
 * @returns the updated banned players
 */
export async function reloadBannedPlayers(): Promise<BannedPlayerCache> {
    const bannedPlayers = (
        await dbContext.kmq.selectFrom("banned_players").select("id").execute()
    ).map((x) => x.id);

    return new Set(bannedPlayers);
}

/**
 * Sends news notifications to all subscribed channels
 * @param newsRange - The news range
 */
export async function sendNewsNotifications(
    newsRange: NewsRange,
): Promise<void> {
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

    await Promise.allSettled(
        subscriptions.map(async (s) => {
            const subscription: NewsSubscription = {
                guildID: s.guild_id,
                textChannelID: s.text_channel_id,
                range: s.range as NewsRange,
                createdAt: new Date(s.created_at),
            };

            const subscriptionContext = new MessageContext(
                subscription.textChannelID,
                null,
                subscription.guildID,
            );

            await NewsCommand.sendNews(
                subscriptionContext,
                subscription.range,
                true,
            );
        }),
    );
}

/**
 * Fetches up-to-date caches
 * @returns the latest caches
 * */
export async function reloadCaches(): Promise<WorkerCache> {
    return {
        artistAliases: await reloadArtistAliases(),
        songAliases: await reloadSongAliases(),
        artists: await reloadArtists(),
        topArtists: await reloadTopArtists(),
        bonusGroups: await reloadBonusGroups(),
        locales: await reloadLocales(),
        songs: await reloadSongs(),
        newSongs: await reloadNewSongs(),
        bannedPlayers: await reloadBannedPlayers(),
        bannedServers: await reloadBannedServers(),
    };
}
