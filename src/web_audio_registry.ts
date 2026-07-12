import * as uuid from "uuid";
import { WEB_AUDIO_TOKEN_TTL_BUFFER_MS } from "./constants";

// Late joiners closer than this to the playback's end get a 410 instead of a
// sliver of audio; below it there's nothing worth hearing.
const MIN_STREAMABLE_REMAINING_SEC = 0.5;

// Elapsed times under this skip the output-side seek entirely: the listener
// connected essentially at round start, and a sub-quarter-second trim costs
// more in decode work than it buys in sync.
const MIN_SEEKABLE_ELAPSED_SEC = 0.25;

/** The playback parameters carried by a worker's roundAudio event. */
export interface WebAudioSpec {
    /** Absolute path of the source audio file. */
    songLocation: string;
    /** ffmpeg args preceding `-i` (input seek, or empty for REVERSE). */
    inputArgs: string[];
    /** Flattened output args (`["-t", "20", "-af", "..."]`). */
    encoderArgs: string[];
    /** Nominal wall-clock playback length in seconds. */
    playbackDurationSec: number;
}

export interface WebAudioEntry extends WebAudioSpec {
    token: string;
    guildID: string;
    /**
     * When the hub received the roundAudio event — the wall-clock reference
     * all listeners sync to. Deliberately not the worker's songStartedAt:
     * clip replays re-emit with the original round timestamp, but the replay
     * audibly starts now.
     */
    mintedAt: number;
    expiresAt: number;
}

/**
 * Seconds of audible playback left, measured against the mint time.
 * @param entry - the registry entry
 * @param now - current epoch ms
 * @returns remaining seconds (may be negative once playback has ended)
 */
export function remainingPlaybackSec(
    entry: WebAudioEntry,
    now: number,
): number {
    return entry.playbackDurationSec - (now - entry.mintedAt) / 1000;
}

/**
 * Admiral-side registry mapping opaque audio tokens to playback specs. The
 * spec names the song (file path), so it must never reach clients pre-reveal;
 * browsers only ever see `/api/web/audio/<token>`. One live entry per guild —
 * each new playback (next round, clip replay, answer clip) replaces the last.
 */
export class WebAudioRegistry {
    private byToken: Map<string, WebAudioEntry> = new Map();

    private byGuild: Map<string, WebAudioEntry> = new Map();

    /**
     * Registers a new playback for the guild, replacing any previous one.
     * @param guildID - the (synthetic) guild the audio belongs to
     * @param spec - the playback parameters from the worker's roundAudio event
     * @param now - current epoch ms
     * @returns the newly minted entry
     */
    mint(guildID: string, spec: WebAudioSpec, now: number): WebAudioEntry {
        this.clearGuild(guildID);
        const entry: WebAudioEntry = {
            ...spec,
            token: uuid.v4(),
            guildID,
            mintedAt: now,
            expiresAt:
                now +
                spec.playbackDurationSec * 1000 +
                WEB_AUDIO_TOKEN_TTL_BUFFER_MS,
        };

        this.byToken.set(entry.token, entry);
        this.byGuild.set(guildID, entry);
        return entry;
    }

    /**
     * Looks up an entry by token.
     * @param token - the opaque token from the audio URL
     * @param now - current epoch ms
     * @returns the entry, or null if unknown or expired
     */
    get(token: string, now: number): WebAudioEntry | null {
        const entry = this.byToken.get(token);
        if (!entry) return null;
        if (entry.expiresAt <= now) {
            this.removeEntry(entry);
            return null;
        }

        return entry;
    }

    /**
     * The guild's live playback, for decorating snapshots so late joiners and
     * reconnects hear the current song.
     * @param guildID - the (synthetic) guild
     * @param now - current epoch ms
     * @returns the entry, or null if none or already past its audible end
     */
    currentForGuild(guildID: string, now: number): WebAudioEntry | null {
        const entry = this.byGuild.get(guildID);
        if (!entry) return null;
        if (remainingPlaybackSec(entry, now) <= MIN_STREAMABLE_REMAINING_SEC) {
            return null;
        }

        return entry;
    }

    /**
     * Drops the guild's live entry (session ended / room closed).
     * @param guildID - the (synthetic) guild
     */
    clearGuild(guildID: string): void {
        const entry = this.byGuild.get(guildID);
        if (entry) {
            this.removeEntry(entry);
        }
    }

    /**
     * Evicts expired entries.
     * @param now - current epoch ms
     */
    sweep(now: number): void {
        for (const entry of this.byToken.values()) {
            if (entry.expiresAt <= now) {
                this.removeEntry(entry);
            }
        }
    }

    /** @returns number of live entries */
    size(): number {
        return this.byToken.size;
    }

    private removeEntry(entry: WebAudioEntry): void {
        this.byToken.delete(entry.token);
        if (this.byGuild.get(entry.guildID) === entry) {
            this.byGuild.delete(entry.guildID);
        }
    }
}

/**
 * Builds the full ffmpeg argv streaming this entry as chunked MP3, seeked to
 * wherever playback is *right now* so every listener hears the same moment.
 *
 * The catch-up seek is output-side (`-ss` after `-i`): the original input
 * args and filters run untouched, and the first `elapsed` seconds of the
 * *filtered* output are decoded and discarded. Input-side seeking would be
 * cheaper but wrong for the special modes — rubberband tempo changes and
 * areverse change the mapping between song time and wall time, while the
 * filtered output is by definition in wall time for every mode.
 * @param entry - the registry entry
 * @param now - current epoch ms
 * @returns the argv, or null when playback has (nearly) ended → 410
 */
export function buildAudioStreamArgs(
    entry: WebAudioEntry,
    now: number,
): string[] | null {
    const elapsedSec = (now - entry.mintedAt) / 1000;
    const remainingSec = remainingPlaybackSec(entry, now);
    if (remainingSec <= MIN_STREAMABLE_REMAINING_SEC) {
        return null;
    }

    // The worker's -t (clip length) was relative to playback start; ours is
    // relative to the output seek point, so it shrinks to what's left. Also
    // set it when the worker had none — it bounds the encode at the same
    // point the round timer will fire anyway.
    const encoderArgs = [...entry.encoderArgs];
    const tIndex = encoderArgs.indexOf("-t");
    if (tIndex !== -1 && tIndex + 1 < encoderArgs.length) {
        encoderArgs[tIndex + 1] = remainingSec.toFixed(3);
    } else {
        encoderArgs.push("-t", remainingSec.toFixed(3));
    }

    return [
        "-hide_banner",
        "-loglevel",
        "error",
        ...entry.inputArgs,
        "-i",
        entry.songLocation,
        ...encoderArgs,
        ...(elapsedSec > MIN_SEEKABLE_ELAPSED_SEC
            ? ["-ss", elapsedSec.toFixed(3)]
            : []),
        "-vn",
        "-map_metadata",
        "-1",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        "-f",
        "mp3",
        "pipe:1",
    ];
}
