import { useCallback, useEffect, useRef, useState } from "react";

const VOLUME_STORAGE_KEY = "kmq_web_volume";
const DEFAULT_VOLUME = 0.6;

// Recovery tuning. A dropped stream is re-fetched from the live position, so
// a retry costs one HTTP request and resumes mid-song rather than restarting
// it — cheap enough to try eagerly, but capped so a genuinely dead playback
// (song file gone, token revoked) doesn't hammer the server for the round.
const MAX_AUTO_RETRIES = 4;
// A stream that keeps dying after delivering a little audio resets the retry
// budget every time (it *did* make progress), so bound the total fetches per
// playback too — each one spawns a transcode server-side.
const MAX_LOADS_PER_PLAYBACK = 6;
const RETRY_BASE_DELAY_MS = 400;
// No decode progress for this long while the element believes it's playing =
// a stalled stream. Generous enough to ride out ordinary rebuffering.
const STALL_TIMEOUT_MS = 5_000;
const WATCHDOG_INTERVAL_MS = 2_000;
// `ended` this close to the expected finish is a normal end, not a truncation.
const END_GRACE_MS = 2_000;

function readStoredVolume(): number {
    try {
        const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
        const parsed = raw === null ? NaN : parseFloat(raw);
        if (Number.isFinite(parsed)) {
            return Math.min(1, Math.max(0, parsed));
        }
    } catch {
        // ignore
    }

    return DEFAULT_VOLUME;
}

export interface RoundAudio {
    /**
     * True when the browser blocked autoplay: nothing will sound until
     * unlock() is called from inside a user gesture.
     */
    needsUnlock: boolean;
    /** True while a stream is loaded and playing. */
    playing: boolean;
    /**
     * True when playback dropped out and the automatic retries were used up
     * while the song should still be sounding — the UI offers a manual retry.
     */
    stalled: boolean;
    volume: number;
    setVolume: (volume: number) => void;
    muted: boolean;
    toggleMuted: () => void;
    /**
     * Feed a roundAudio event's (or snapshot's) stream URL. The nominal
     * playback length bounds how long a dropout is worth recovering from.
     */
    handleRoundAudio: (audioUrl: string, playbackDurationSec: number) => void;
    /** Session over: silence and drop the pending URL. */
    stop: () => void;
    /** Call from a click handler; retries the pending stream. */
    unlock: () => void;
    /** Manual "sound stopped, get it back" — resets the retry budget. */
    retry: () => void;
}

/**
 * Owns the standalone website's single <audio> element. Each roundAudio
 * event swaps in a new stream URL; the server seeks every GET to the live
 * position, so (re)fetching the same URL after a block/unlock, a reload, or a
 * mid-song failure stays in sync with the room. Playback deliberately runs to
 * the stream's end rather than stopping at roundEnd — the Discord bot keeps
 * playing through the reveal too, only stopping when the next round starts (a
 * new URL arrives) or the session ends (stop()).
 *
 * Because that re-fetch is always safe, every way a stream can die — a network
 * error, a truncated body (ffmpeg killed mid-encode), a silent stall, a laptop
 * resuming from sleep — is recovered the same way: re-request the same URL and
 * let the server seek to wherever the room is now. Without this a single blip
 * meant silence for the rest of the round with no affordance to fix it.
 * @param enabled - false on the embedded Activity, where Discord plays the
 * audio and this hook must stay inert
 * @returns the audio element controls
 */
export default function useRoundAudio(enabled: boolean): RoundAudio {
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [stalled, setStalled] = useState(false);
    const [volume, setVolumeState] = useState(readStoredVolume);
    const [muted, setMuted] = useState(false);

    const elementRef = useRef<HTMLAudioElement | null>(null);
    // The most recent stream URL, kept while autoplay is blocked (so the
    // unlock gesture can retry it) and for recovery re-fetches.
    const pendingUrlRef = useRef<string | null>(null);
    // Epoch ms after which the current playback is over and a dropout is no
    // longer worth chasing. null = nothing should be sounding.
    const deadlineRef = useRef<number | null>(null);
    const retriesRef = useRef(0);
    const loadsRef = useRef(0);
    const retryTimerRef = useRef<number | null>(null);
    // Decode-progress watchdog bookkeeping.
    const lastTimeRef = useRef(0);
    const lastProgressAtRef = useRef(0);
    const volumeRef = useRef(volume);
    const mutedRef = useRef(muted);
    // Bumped per (re)fetch and appended to the URL so a retry is always a
    // fresh request rather than the media cache replaying the dead response.
    const attemptRef = useRef(0);
    // Indirection so load() can trigger recovery even though scheduleRetry is
    // defined in terms of load().
    const scheduleRetryRef = useRef<() => void>(() => {});

    const clearRetryTimer = (): void => {
        if (retryTimerRef.current !== null) {
            window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    };

    /** True while the room should still be hearing the current playback. */
    const shouldBePlaying = (): boolean =>
        pendingUrlRef.current !== null &&
        deadlineRef.current !== null &&
        Date.now() < deadlineRef.current;

    // Detach the current stream. Clearing src closes the connection, which
    // kills the server-side ffmpeg instead of encoding to a dead socket.
    const detach = (): void => {
        const el = elementRef.current;
        if (!el) return;
        el.removeAttribute("src");
        el.load();
        setPlaying(false);
    };

    const load = useCallback((audioUrl: string): void => {
        const el = elementRef.current;
        if (!el) return;
        attemptRef.current += 1;
        loadsRef.current += 1;
        const attempt = attemptRef.current;
        const separator = audioUrl.includes("?") ? "&" : "?";
        el.volume = mutedRef.current ? 0 : volumeRef.current;
        el.src = `${audioUrl}${separator}a=${attempt}`;
        lastTimeRef.current = 0;
        lastProgressAtRef.current = Date.now();
        el.play().then(
            () => {
                setNeedsUnlock(false);
                setStalled(false);
                setPlaying(true);
            },
            (err: unknown) => {
                // A newer load already owns the element (that play() call
                // reports its own outcome); this rejection is just its
                // AbortError echo.
                if (attemptRef.current !== attempt) return;

                if ((err as Error | null)?.name === "NotAllowedError") {
                    // Autoplay policy. Abort the fetch but keep the URL: the
                    // server re-seeks to the live position on the next GET, so
                    // the unlock retry is still in sync.
                    detach();
                    setNeedsUnlock(true);
                    return;
                }

                // Anything else (a dead or undecodable stream) is a dropout,
                // not a permission problem — recover rather than asking the
                // viewer to click a button that wouldn't help.
                setPlaying(false);
                scheduleRetryRef.current();
            },
        );
    }, []);

    /**
     * Re-fetch the live position after a dropout, backing off between tries.
     * Gives up (and hands the user a manual retry) once the budget is spent
     * or the playback's own end has passed.
     */
    const scheduleRetry = useCallback((): void => {
        if (retryTimerRef.current !== null) return;
        if (!shouldBePlaying()) {
            setPlaying(false);
            return;
        }

        if (
            retriesRef.current >= MAX_AUTO_RETRIES ||
            loadsRef.current >= MAX_LOADS_PER_PLAYBACK
        ) {
            setPlaying(false);
            setStalled(true);
            return;
        }

        const delay = RETRY_BASE_DELAY_MS * 2 ** retriesRef.current;
        retriesRef.current += 1;
        retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            const url = pendingUrlRef.current;
            if (url && shouldBePlaying()) {
                load(url);
            }
        }, delay);
    }, [load]);

    scheduleRetryRef.current = scheduleRetry;

    const getElement = useCallback((): HTMLAudioElement => {
        let el = elementRef.current;
        if (!el) {
            el = new Audio();
            el.preload = "none";
            elementRef.current = el;

            // Real decode progress: the stream is healthy, so forgive the
            // earlier failures that led here.
            el.addEventListener("timeupdate", () => {
                if (el && el.currentTime !== lastTimeRef.current) {
                    lastTimeRef.current = el.currentTime;
                    lastProgressAtRef.current = Date.now();
                    retriesRef.current = 0;
                }
            });

            el.addEventListener("playing", () => {
                lastProgressAtRef.current = Date.now();
                setStalled(false);
                setPlaying(true);
            });

            // A body that ends early (ffmpeg killed, connection cut) looks
            // exactly like a normal end — tell them apart by the clock.
            el.addEventListener("ended", () => {
                setPlaying(false);
                const deadline = deadlineRef.current;
                if (deadline !== null && Date.now() < deadline - END_GRACE_MS) {
                    scheduleRetry();
                }
            });

            el.addEventListener("error", () => {
                setPlaying(false);
                scheduleRetry();
            });

            el.addEventListener("stalled", () => scheduleRetry());
        }

        return el;
    }, [scheduleRetry]);

    const startPlayback = useCallback(
        (audioUrl: string): void => {
            getElement();
            load(audioUrl);
        },
        [getElement, load],
    );

    const handleRoundAudio = useCallback(
        (audioUrl: string, playbackDurationSec: number): void => {
            if (!enabled) return;
            clearRetryTimer();
            // A late joiner's snapshot reports the playback's full length
            // rather than what's left, so this deadline can overshoot; the
            // only cost is a doomed retry that the server answers with 410.
            deadlineRef.current =
                Date.now() + Math.max(0, playbackDurationSec) * 1000;

            // Snapshots re-delivered on (re)connect repeat the current URL;
            // don't restart a stream that's already playing it.
            const el = elementRef.current;
            if (pendingUrlRef.current === audioUrl && el && !el.paused) {
                return;
            }

            retriesRef.current = 0;
            loadsRef.current = 0;
            setStalled(false);
            pendingUrlRef.current = audioUrl;
            startPlayback(audioUrl);
        },
        [enabled, startPlayback],
    );

    const stop = useCallback((): void => {
        clearRetryTimer();
        pendingUrlRef.current = null;
        deadlineRef.current = null;
        setStalled(false);
        detach();
    }, []);

    const restart = useCallback((): void => {
        clearRetryTimer();
        retriesRef.current = 0;
        loadsRef.current = 0;
        setStalled(false);
        const url = pendingUrlRef.current;
        if (url) {
            startPlayback(url);
        }
    }, [startPlayback]);

    const unlock = useCallback((): void => {
        // Must run synchronously inside the user gesture for the play() call
        // to be blessed by the autoplay policy.
        setNeedsUnlock(false);
        restart();
    }, [restart]);

    const setVolume = useCallback((next: number): void => {
        const clamped = Math.min(1, Math.max(0, next));
        volumeRef.current = clamped;
        setVolumeState(clamped);
        // Dragging the slider un-mutes; muting-then-adjusting is never what
        // the user meant.
        mutedRef.current = false;
        setMuted(false);
        const el = elementRef.current;
        if (el) {
            el.volume = clamped;
        }

        try {
            window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
        } catch {
            // ignore
        }
    }, []);

    const toggleMuted = useCallback((): void => {
        const next = !mutedRef.current;
        mutedRef.current = next;
        setMuted(next);
        const el = elementRef.current;
        if (el) {
            el.volume = next ? 0 : volumeRef.current;
        }
    }, []);

    // While blocked, any interaction with the page (clicking anything,
    // typing a guess) doubles as the unlock gesture — the pill is only
    // needed by someone who watches without touching anything.
    useEffect(() => {
        if (!needsUnlock) return undefined;
        const handler = (): void => unlock();
        window.addEventListener("pointerdown", handler, { once: true });
        window.addEventListener("keydown", handler, { once: true });
        return () => {
            window.removeEventListener("pointerdown", handler);
            window.removeEventListener("keydown", handler);
        };
    }, [needsUnlock, unlock]);

    // Stall watchdog. A stream can die without ever firing `error` or `ended`
    // — the element just stops advancing (dropped connection mid-body, a
    // sleeping laptop, an exhausted buffer). Poll for that and recover the
    // same way as an outright failure.
    useEffect(() => {
        if (!enabled) return undefined;
        const id = window.setInterval(() => {
            const el = elementRef.current;
            if (!el || el.paused || el.ended) return;
            if (!shouldBePlaying()) return;
            if (retryTimerRef.current !== null) return;
            if (Date.now() - lastProgressAtRef.current > STALL_TIMEOUT_MS) {
                scheduleRetry();
            }
        }, WATCHDOG_INTERVAL_MS);

        return () => window.clearInterval(id);
    }, [enabled, scheduleRetry]);

    // Coming back from an offline stretch or a background tab: if the room
    // should still be sounding and we aren't, re-fetch immediately on a full
    // budget rather than waiting out the backoff.
    useEffect(() => {
        if (!enabled) return undefined;
        const recover = (): void => {
            if (document.visibilityState === "hidden") return;
            if (!shouldBePlaying()) return;
            const el = elementRef.current;
            if (el && !el.paused && !el.ended) return;
            if (needsUnlock) return;
            restart();
        };

        window.addEventListener("online", recover);
        document.addEventListener("visibilitychange", recover);
        return () => {
            window.removeEventListener("online", recover);
            document.removeEventListener("visibilitychange", recover);
        };
    }, [enabled, needsUnlock, restart]);

    // Unmount: silence and release the element.
    useEffect(
        () => () => {
            clearRetryTimer();
            const el = elementRef.current;
            if (el) {
                el.removeAttribute("src");
                el.load();
            }

            elementRef.current = null;
        },
        [],
    );

    return {
        needsUnlock,
        playing,
        stalled,
        volume,
        setVolume,
        muted,
        toggleMuted,
        handleRoundAudio,
        stop,
        unlock,
        retry: restart,
    };
}
