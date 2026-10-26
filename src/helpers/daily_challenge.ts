import {
    DAILY_CHALLENGE_GUESS_TIMEOUT_SEC,
    DAILY_CHALLENGE_POOL_SIZE,
    DAILY_CHALLENGE_ROUNDS,
} from "../constants";
import { sql } from "kysely";
import GuessModeType from "../enums/option_types/guess_mode_type";
import GuildPreference from "../structures/guild_preference";
import _ from "lodash";
import type { RawBuilder } from "kysely";
import type GameOptions from "../interfaces/game_options";
import type QueriedSong from "../structures/queried_song";

/** Sentinel guild ID for the ephemeral GuildPreference used to query the daily
 *  pool. The pool is global (not guild-scoped), so this never persists. */
const DAILY_CHALLENGE_GUILD_ID = "daily-challenge";

/**
 * The challenge date (UTC) for a given instant, as an ISO `YYYY-MM-DD` string.
 * UTC so every player worldwide shares one challenge per calendar day.
 * @param now - the instant to derive the date from (defaults to current time)
 * @returns the ISO date string
 */
export function getDailyChallengeDate(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

/**
 * The DB bind value for a challenge `DATE` column — a plain `YYYY-MM-DD` string
 * passed as a SQL parameter. Using a string (not a JS Date) avoids the driver's
 * timezone conversion, which would attach a time component and break equality
 * against a DATE column. Used by BOTH the write and the reads so they agree.
 * @param isoDate - `YYYY-MM-DD`
 * @returns a SQL expression binding the date string
 */
export function dailyChallengeDateValue(isoDate: string): RawBuilder<Date> {
    return sql<Date>`${isoDate}`;
}

/**
 * Derives a stable 32-bit seed from an ISO date string (FNV-1a hash).
 * @param isoDate - `YYYY-MM-DD`
 * @returns an unsigned 32-bit seed
 */
export function dailySeedFromDate(isoDate: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < isoDate.length; i++) {
        hash ^= isoDate.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}

/**
 * mulberry32 — a small, fast, deterministic PRNG. Same seed ⇒ same sequence.
 * @param seed - an unsigned 32-bit seed
 * @returns a function returning the next float in [0, 1)
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Fisher-Yates shuffle using the supplied RNG. Pure: returns a new array.
 * @param items - the items to shuffle
 * @param rng - a [0, 1) random source (seed it for determinism)
 * @returns a new shuffled array
 */
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }

    return out;
}

/**
 * The locked GameOptions every daily challenge runs with — fixed so the
 * challenge is identical and fair for everyone, independent of any guild's
 * saved preferences.
 * @returns a fresh locked GameOptions
 */
function buildDailyGameOptions(): GameOptions {
    const options = _.cloneDeep(GuildPreference.DEFAULT_OPTIONS);
    options.limitStart = 0;
    options.limitEnd = DAILY_CHALLENGE_POOL_SIZE;
    options.guessModeType = GuessModeType.SONG_NAME;
    options.guessTimeout = DAILY_CHALLENGE_GUESS_TIMEOUT_SEC;
    options.goal = null;
    options.duration = null;
    return options;
}

/**
 * Builds the deterministic daily song set: queries the eligible pool with the
 * locked daily options, then seeded-shuffles it by the date and takes the first
 * N. Same date ⇒ same songs in the same order for everyone.
 * @param isoDate - the challenge date (`YYYY-MM-DD`)
 * @returns the day's ordered songs (up to DAILY_CHALLENGE_ROUNDS)
 */
async function buildDailySongSet(isoDate: string): Promise<QueriedSong[]> {
    const guildPreference = new GuildPreference(
        DAILY_CHALLENGE_GUILD_ID,
        buildDailyGameOptions(),
    );

    await guildPreference.songSelector.reloadSongs();
    const pool = [...guildPreference.songSelector.getSongs().songs];
    const rng = mulberry32(dailySeedFromDate(isoDate));
    return seededShuffle(pool, rng).slice(0, DAILY_CHALLENGE_ROUNDS);
}

/**
 * Builds a GuildPreference for a Daily Challenge session: locked options with
 * the day's fixed song set pre-loaded as an in-order queue. Not persisted.
 * @param guildID - the guild the session runs in
 * @param isoDate - the challenge date (`YYYY-MM-DD`)
 * @returns the configured GuildPreference
 */
export async function buildDailyGuildPreference(
    guildID: string,
    isoDate: string,
): Promise<GuildPreference> {
    const guildPreference = new GuildPreference(
        guildID,
        buildDailyGameOptions(),
    );

    const songs = await buildDailySongSet(isoDate);
    guildPreference.songSelector.setFixedQueue(songs);
    return guildPreference;
}
