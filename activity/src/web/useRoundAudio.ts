import { useCallback, useEffect, useRef, useState } from "react";

const VOLUME_STORAGE_KEY = "kmq_web_volume";
const DEFAULT_VOLUME = 0.6;

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
    volume: number;
    setVolume: (volume: number) => void;
    muted: boolean;
    toggleMuted: () => void;
    /** Feed a roundAudio event's (or snapshot's) stream URL. */
    handleRoundAudio: (audioUrl: string) => void;
    /** Session over: silence and drop the pending URL. */
    stop: () => void;
    /** Call from a click handler; retries the pending stream. */
    unlock: () => void;
}

/**
 * Owns the standalone website's single <audio> element. Each roundAudio
 * event swaps in a new stream URL; the server seeks every GET to the live
 * position, so (re)fetching the same URL after a block/unlock or a reload
 * stays in sync with the room. Playback deliberately runs to the stream's
 * end rather than stopping at roundEnd — the Discord bot keeps playing
 * through the reveal too, only stopping when the next round starts (a new
 * URL arrives) or the session ends (stop()).
 * @param enabled - false on the embedded Activity, where Discord plays the
 * audio and this hook must stay inert
 * @returns the audio element controls
 */
export default function useRoundAudio(enabled: boolean): RoundAudio {
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [volume, setVolumeState] = useState(readStoredVolume);
    const [muted, setMuted] = useState(false);

    const elementRef = useRef<HTMLAudioElement | null>(null);
    // The most recent stream URL, kept while autoplay is blocked so the
    // unlock gesture can retry it.
    const pendingUrlRef = useRef<string | null>(null);
    const volumeRef = useRef(volume);
    const mutedRef = useRef(muted);

    const getElement = (): HTMLAudioElement => {
        let el = elementRef.current;
        if (!el) {
            el = new Audio();
            el.preload = "none";
            el.addEventListener("ended", () => setPlaying(false));
            el.addEventListener("error", () => setPlaying(false));
            elementRef.current = el;
        }

        return el;
    };

    // Detach the current stream. Clearing src closes the connection, which
    // kills the server-side ffmpeg instead of encoding to a dead socket.
    const detach = (): void => {
        const el = elementRef.current;
        if (!el) return;
        el.removeAttribute("src");
        el.load();
        setPlaying(false);
    };

    const startPlayback = useCallback((audioUrl: string): void => {
        const el = getElement();
        el.volume = mutedRef.current ? 0 : volumeRef.current;
        el.src = audioUrl;
        el.play().then(
            () => {
                setNeedsUnlock(false);
                setPlaying(true);
            },
            () => {
                // Autoplay policy (or a dead stream). Abort the fetch but
                // keep the URL: the server re-seeks to the live position on
                // the next GET, so the unlock retry is still in sync.
                detach();
                setNeedsUnlock(true);
            },
        );
    }, []);

    const handleRoundAudio = useCallback(
        (audioUrl: string): void => {
            if (!enabled) return;
            // Snapshots re-delivered on (re)connect repeat the current URL;
            // don't restart a stream that's already playing it.
            const el = elementRef.current;
            if (pendingUrlRef.current === audioUrl && el && !el.paused) {
                return;
            }

            pendingUrlRef.current = audioUrl;
            startPlayback(audioUrl);
        },
        [enabled, startPlayback],
    );

    const stop = useCallback((): void => {
        pendingUrlRef.current = null;
        detach();
    }, []);

    const unlock = useCallback((): void => {
        // Must run synchronously inside the user gesture for the play() call
        // to be blessed by the autoplay policy.
        setNeedsUnlock(false);
        const url = pendingUrlRef.current;
        if (url) {
            startPlayback(url);
        }
    }, [startPlayback]);

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

    // Unmount: silence and release the element.
    useEffect(
        () => () => {
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
        volume,
        setVolume,
        muted,
        toggleMuted,
        handleRoundAudio,
        stop,
        unlock,
    };
}
