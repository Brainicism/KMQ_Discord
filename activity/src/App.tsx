import { useEffect, useMemo, useRef, useState } from "react";
import {
    EXTERNAL_YOUTUBE_PROXY_PREFIX,
    MAX_GUESS_LENGTH,
    RECENT_GUESS_BUFFER_LIMIT,
    RECENT_GUESS_DISPLAY_LIMIT,
    ROUND_TIMER_TICK_MS,
    YOUTUBE_IMAGE_HOST_PATTERN,
    YOUTUBE_WATCH_URL_PREFIX,
} from "./constants";
import {
    bookmarkSong,
    endGame as apiEndGame,
    fetchArtistAutocomplete,
    fetchI18nBundle,
    fetchSnapshot,
    hintVote as apiHintVote,
    openActivityStream,
    setOption as apiSetOption,
    skipVote as apiSkipVote,
    startGame as apiStartGame,
    submitGuess,
} from "./api";
import { authenticate, openExternalUrl, readSdkLocale } from "./discordSdk";
import { makeTranslator } from "./i18n/translator";
import kmqLogoUrl from "./assets/kmq_logo.png";
import thumbsUpUrl from "./assets/thumbs_up.png";
import type { ActivityArtist } from "./types/activity_options_snapshot";
import type {
    ActivityArtistType,
    ActivityGender,
    ActivityGuessMode,
    ActivityLanguage,
    ActivityMultiguess,
    ActivityRelease,
    ActivitySeek,
    ActivityShuffle,
    ActivitySubunits,
} from "./types/activity_options_snapshot";
import type ActivityOptionsSnapshot from "./types/activity_options_snapshot";
import type { SetOptionRequest } from "./api";
import type { Translator } from "./i18n/translator";
import type ActivityEvent from "./types/activity_event";
import type ActivityRoundMeta from "./types/activity_round_meta";
import type ActivityScoreboardSnapshot from "./types/activity_scoreboard_snapshot";
import type ActivitySnapshot from "./types/activity_snapshot";
import type GuessRejectReason from "./types/guess_reject_reason";
import type HintState from "./types/hint_state";
import type SkipState from "./types/skip_state";
import type UiState from "./types/ui_state";

const initialHint: HintState = {
    requesters: 0,
    threshold: 0,
    revealed: null,
};

const initialSkip: SkipState = {
    requesters: 0,
    threshold: 0,
    achieved: false,
    userVoted: false,
};

// Rendered only between first paint and the /api/activity/i18n response.
// Every other string goes through the server-delivered bundle, so this map
// stays deliberately small — keeping it in sync with en.json isn't important
// because once the bundle arrives it overwrites these values.
const PRE_HYDRATE_STRINGS: Record<string, string> = {
    appTitle: "KMQ",
    statusConnecting: "Connecting...",
};

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "kmq:theme";
// Mirrors the bot's QUICK_GUESS_MS (src/constants.ts) — guesses at or under
// this get a ⚡ in the round-end reveal, matching the legacy text-chat look.
const QUICK_GUESS_MS = 3500;
// Legacy shows the 🔥 streak flair starting at 5 in a row.
const STREAK_DISPLAY_THRESHOLD = 5;

function readInitialTheme(): Theme {
    // localStorage can throw in sandboxed contexts (rare inside Discord's
    // iframe but not impossible). Fall back to the OS preference.
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "dark" || stored === "light") return stored;
    } catch {
        // ignore
    }

    // Discord's client defaults to dark; matching it is the better first
    // impression for most users.
    if (
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
        return "dark";
    }

    return "dark";
}

const initialUi: UiState = {
    session: null,
    scoreboard: null,
    currentRound: null,
    lastReveal: null,
    recentGuesses: [],
    sessionEnded: false,
    hint: initialHint,
    skip: initialSkip,
    bookmarkedLinks: new Set(),
    currentRoundBookmarked: false,
    hadSession: false,
    options: null,
    roundHistory: [],
};

function applySnapshot(prev: UiState, snapshot: ActivitySnapshot): UiState {
    return {
        ...prev,
        session: snapshot.session ?? null,
        scoreboard: snapshot.scoreboard ?? null,
        currentRound: snapshot.currentRound ?? null,
        options: snapshot.options,
        sessionEnded: !snapshot.hasSession,
        hadSession: prev.hadSession || snapshot.hasSession,
    };
}

// Discord Activities sandbox the iframe — only hosts registered as URL
// Mappings in the developer portal can be reached. Rewrite YouTube image
// hosts to a /external/yt/ prefix that the dev portal maps to i.ytimg.com.
function proxyImageUrl(url: string): string {
    return url.replace(
        YOUTUBE_IMAGE_HOST_PATTERN,
        EXTERNAL_YOUTUBE_PROXY_PREFIX,
    );
}

// YouTube doesn't generate every size for every video. maxresdefault.jpg is
// missing for pre-720p uploads, and even sd/hq can 404 on older clips. Walk
// down the chain until something loads, then stop. default.jpg is the only
// size guaranteed to exist for every video.
const THUMBNAIL_FALLBACK_CHAIN = [
    "maxresdefault.jpg",
    "sddefault.jpg",
    "hqdefault.jpg",
    "mqdefault.jpg",
    "default.jpg",
] as const;

function RevealThumbnail({
    thumbnailUrl,
    alt,
}: {
    thumbnailUrl: string;
    alt: string;
}): React.ReactElement | null {
    // Preload candidates via off-DOM Image() so the visible <img> only mounts
    // once we know a good URL. Otherwise the user sees a brief flash of
    // YouTube's 120x90 "no preview" placeholder before the chain advances
    // (the Discord URL Mapping proxy can rewrite the 404 to a 200).
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setResolvedUrl(null);
        const proxied = proxyImageUrl(thumbnailUrl);

        (async () => {
            for (const size of THUMBNAIL_FALLBACK_CHAIN) {
                if (cancelled) return;
                const candidate = proxied.replace(/\/[^/]+\.jpg$/, `/${size}`);
                const ok = await new Promise<boolean>((resolve) => {
                    const probe = new Image();
                    probe.onload = () =>
                        resolve(
                            size === "default.jpg" || probe.naturalWidth > 120,
                        );
                    probe.onerror = () => resolve(false);
                    probe.src = candidate;
                });
                if (ok && !cancelled) {
                    setResolvedUrl(candidate);
                    return;
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [thumbnailUrl]);

    if (!resolvedUrl) return null;
    return <img src={resolvedUrl} alt={alt} />;
}

function rejectReasonText(
    t: Translator,
    reason: GuessRejectReason | undefined,
): string {
    switch (reason) {
        case "no_session":
            return t("rejectNoSession");
        case "maintenance":
            return t("rejectMaintenance");
        case "banned":
            return t("rejectBanned");
        case "rate_limit":
            return t("rejectRateLimit");
        case "not_in_vc":
            return t("rejectNotInVC");
        case "bot_no_voice_perms":
            return t("rejectBotNoVoicePerms");
        case "unauthorized":
            return t("rejectUnauthorized");
        case "forbidden":
            return t("rejectForbidden");
        case "bad_request":
            return t("rejectBadRequest");
        case "session_already_running":
            return t("rejectSessionAlreadyRunning");
        case "no_round":
            return t("rejectNoRound");
        default:
            return t("rejectGeneric");
    }
}

function RoundTimer({
    songStartedAt,
    timerStartedAt,
    guessTimeoutSec,
}: {
    songStartedAt: number;
    timerStartedAt: number;
    guessTimeoutSec: number | null;
}) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), ROUND_TIMER_TICK_MS);
        return () => clearInterval(id);
    }, []);

    // With a guess-timer set, the main counter counts down to 0 from the
    // moment the timer started (which resets if the timer is changed mid-
    // round). Without a timer, it counts elapsed time up from song start.
    if (guessTimeoutSec !== null) {
        const remaining = Math.max(
            0,
            Math.ceil(guessTimeoutSec - (now - timerStartedAt) / 1000),
        );
        return <span className="round-timer counting-down">{remaining}s</span>;
    }

    const seconds = Math.max(0, Math.floor((now - songStartedAt) / 1000));
    return <span className="round-timer">{seconds}s</span>;
}

function Scoreboard({
    scoreboard,
    t,
}: {
    scoreboard: ActivityScoreboardSnapshot;
    t: Translator;
}) {
    const sorted = [...scoreboard.players]
        .filter((p) => p.score > 0 || p.inVC)
        .sort((a, b) => b.score - a.score);

    if (sorted.length === 0) {
        return <p className="empty">{t("scoreboardEmptyJoinVC")}</p>;
    }

    return (
        <ol className="scoreboard">
            {sorted.map((p, i) => (
                <li
                    key={p.id}
                    className={
                        scoreboard.winnerIDs.includes(p.id) ? "winner" : ""
                    }
                >
                    <span className="rank">#{i + 1}</span>
                    {p.avatarUrl && (
                        <img
                            className="avatar"
                            src={p.avatarUrl}
                            alt=""
                            width={24}
                            height={24}
                        />
                    )}
                    <span className="name">
                        {p.username}
                        {!p.inVC && (
                            <span className="afk"> {t("scoreboardLeft")}</span>
                        )}
                    </span>
                    <span className="score">{p.score}</span>
                    {p.expGain > 0 && (
                        <span className="exp">
                            {t("scoreboardExpGain", { exp: p.expGain })}
                        </span>
                    )}
                </li>
            ))}
        </ol>
    );
}

// Tiles up to 4 of the game's songs (2x2) into the end-of-game box. The
// dynamic YouTube thumbnails crop to fill each cell under object-fit: cover
// (handled in CSS). Songs are sampled evenly across the session so the
// montage spans the whole game rather than just its opening rounds.
function SongMontage({ history }: { history: UiState["roundHistory"] }) {
    // Cap at a 2x2 grid — 3x3 tiles are small enough that the thumbnails
    // look pixelated in the box.
    const tileCount = history.length >= 4 ? 4 : history.length;
    const cols = tileCount >= 4 ? 2 : tileCount;
    const rows = Math.ceil(tileCount / cols);

    const tiles: UiState["roundHistory"] = [];
    for (let i = 0; i < tileCount; i++) {
        tiles.push(history[Math.floor((i * history.length) / tileCount)]!);
    }

    return (
        <div
            className="song-montage"
            style={{
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
            }}
            aria-hidden
        >
            {tiles.map((song, i) => (
                <RevealThumbnail
                    key={`${song.youtubeLink}-${i}`}
                    thumbnailUrl={song.thumbnailUrl}
                    alt=""
                />
            ))}
        </div>
    );
}

function CurrentRound({
    round,
    reveal,
    bookmarkSlot,
    winnerText,
    history,
    guesses,
    t,
}: {
    round: ActivityRoundMeta | null;
    reveal: UiState["lastReveal"];
    bookmarkSlot: React.ReactNode;
    /** If non-null, the round-area idle state renders the session-end winner
     *  line in place of "Waiting for next round". */
    winnerText: string | null;
    /** Songs played this session, used to build the end-of-game montage. */
    history: UiState["roundHistory"];
    /** Live guesses, shown in the in-round stage as they come in. */
    guesses: UiState["recentGuesses"];
    t: Translator;
}) {
    return (
        <section className="round-area">
            {round ? (
                <div className="round-area-body in-round">
                    {/* Full-width "stage": big countdown is the focal point,
                        with the live guess feed below — replaces the old
                        decorative listening animation that left this space
                        doing nothing while the round was most active. */}
                    <div className="stage">
                        {bookmarkSlot && (
                            <div className="stage-bookmark">{bookmarkSlot}</div>
                        )}
                        <div className="stage-header">
                            <span className="stage-round-label">
                                {t("roundLabel", {
                                    num: round.roundIndex + 1,
                                })}
                            </span>
                            <span className="live-badge">
                                <span className="live-dot" />
                                LIVE
                            </span>
                        </div>
                        <div className="stage-countdown">
                            <RoundTimer
                                songStartedAt={round.songStartedAt}
                                timerStartedAt={round.timerStartedAt}
                                guessTimeoutSec={round.guessTimeoutSec}
                            />
                        </div>
                        {guesses.length > 0 ? (
                            <GuessTicker guesses={guesses} />
                        ) : (
                            <div className="stage-notes" aria-hidden>
                                <span className="note-float">♪</span>
                                <span className="note-float">♫</span>
                                <span className="note-float">♩</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : reveal ? (
                <div className="round-area-body has-reveal">
                    <div className="round-area-text">
                        <div className="reveal-header">
                            <h3>{reveal.song.songName}</h3>
                            {bookmarkSlot}
                        </div>
                        <p className="artist-line">
                            {reveal.song.artistName} ({reveal.song.publishYear})
                        </p>
                        <ul className="winners">
                            {reveal.correctGuessers.map((g) => {
                                const quick =
                                    g.timeToGuessMs !== null &&
                                    g.timeToGuessMs <= QUICK_GUESS_MS;
                                return (
                                    <li key={g.id}>
                                        {t("revealWinners", {
                                            username: g.username,
                                            points: g.pointsEarned,
                                            exp: g.expGain,
                                        })}
                                        {g.streak >=
                                            STREAK_DISPLAY_THRESHOLD && (
                                            <span
                                                className="winner-streak"
                                                title={t("streakTitle", {
                                                    streak: g.streak,
                                                })}
                                            >
                                                🔥{g.streak}
                                            </span>
                                        )}
                                        {g.timeToGuessMs !== null && (
                                            <span
                                                className={`winner-time ${
                                                    quick ? "quick" : ""
                                                }`}
                                            >
                                                {quick ? "⚡" : ""}
                                                {(
                                                    g.timeToGuessMs / 1000
                                                ).toFixed(1)}
                                                s
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="song-counter">
                            {t("songCounterLine", {
                                played: reveal.songCounter.uniqueSongsPlayed,
                                total: reveal.songCounter.totalSongs,
                            })}
                        </p>
                        {reveal.allGuesses.length > 0 && (
                            <details className="all-guesses" open>
                                <summary>
                                    {t("revealAllGuessesSummary", {
                                        count: reveal.allGuesses.length,
                                    })}
                                </summary>
                                <ul>
                                    {reveal.allGuesses
                                        .slice()
                                        .sort((a, b) => a.ts - b.ts)
                                        .map((g) => (
                                            <li
                                                key={g.userID}
                                                className={
                                                    g.isCorrect ? "correct" : ""
                                                }
                                            >
                                                <span className="g-name">
                                                    {g.username}
                                                </span>
                                                <span className="g-text">
                                                    {g.guess || "—"}
                                                </span>
                                                {g.isCorrect && (
                                                    <span className="g-mark">
                                                        ✓
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                </ul>
                            </details>
                        )}
                    </div>
                    <div className="thumbnail-slot">
                        <button
                            type="button"
                            className="thumbnail-link"
                            onClick={() =>
                                openExternalUrl(
                                    `${YOUTUBE_WATCH_URL_PREFIX}${reveal.song.youtubeLink}`,
                                )
                            }
                            title={t("openOnYouTube")}
                        >
                            <RevealThumbnail
                                key={reveal.song.thumbnailUrl}
                                thumbnailUrl={reveal.song.thumbnailUrl}
                                alt=""
                            />
                            <span className="thumbnail-overlay">
                                {t("youtubePlayLabel")}
                            </span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="round-area-body idle">
                    <div className="round-area-text">
                        {winnerText ? (
                            <p className="session-winner">{winnerText}</p>
                        ) : (
                            <p className="empty">{t("waitingForNextRound")}</p>
                        )}
                    </div>
                    {winnerText ? (
                        history.length > 0 ? (
                            <div className="thumbnail-slot session-montage">
                                <SongMontage history={history} />
                            </div>
                        ) : (
                            <div className="thumbnail-slot session-winner-art">
                                <img src={thumbsUpUrl} alt="" />
                            </div>
                        )
                    ) : (
                        <div className="thumbnail-slot placeholder" aria-hidden>
                            <span className="note-float">♪</span>
                            <span className="note-float">♫</span>
                            <span className="note-float">♩</span>
                            <span className="note-main">🎵</span>
                            <span className="listening-text">waiting...</span>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

function ControlButtons({
    accessToken,
    instanceId,
    hasSession,
    t,
}: {
    accessToken: string;
    instanceId: string;
    hasSession: boolean;
    t: Translator;
}) {
    const [busy, setBusy] = useState<null | "start" | "end">(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    // Auto-clear the action feedback so a stale message (e.g. "join the voice
    // channel first" after the user has since joined) doesn't linger and look
    // like a persistent error. Re-clicking re-evaluates regardless.
    useEffect(() => {
        if (!feedback) return undefined;
        const id = window.setTimeout(() => setFeedback(null), 6000);
        return () => window.clearTimeout(id);
    }, [feedback]);

    const run = async (
        action: "start" | "end",
        fn: () => Promise<{ ok: boolean; reason?: GuessRejectReason }>,
    ) => {
        if (busy) return;
        setBusy(action);
        setFeedback(null);
        try {
            const result = await fn();
            if (!result.ok) setFeedback(rejectReasonText(t, result.reason));
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : t("networkError"));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="control-buttons">
            {!hasSession && (
                <button
                    type="button"
                    className="primary"
                    disabled={busy !== null}
                    onClick={() =>
                        run("start", () =>
                            apiStartGame(accessToken, instanceId),
                        )
                    }
                >
                    {busy === "start"
                        ? t("startGameBusy")
                        : t("startGameButton")}
                </button>
            )}
            {hasSession && (
                <button
                    type="button"
                    className="danger"
                    disabled={busy !== null}
                    onClick={() =>
                        run("end", () => apiEndGame(accessToken, instanceId))
                    }
                >
                    {busy === "end" ? t("endGameBusy") : t("endGameButton")}
                </button>
            )}
            {feedback && <span className="control-feedback">{feedback}</span>}
        </div>
    );
}

function GuessInput({
    accessToken,
    instanceId,
    enabled,
    t,
}: {
    accessToken: string;
    instanceId: string;
    enabled: boolean;
    t: Translator;
}) {
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Clear any leftover text the instant a new round starts, so a stale
    // wrong guess from the previous round doesn't carry over. Only clears
    // on the false→true transition (when `enabled` becomes true again),
    // not on every re-render.
    const prevEnabledRef = useRef(enabled);
    useEffect(() => {
        if (!prevEnabledRef.current && enabled) {
            setText("");
            setFeedback(null);
        }

        prevEnabledRef.current = enabled;
    }, [enabled]);

    // Desktop only: auto-focus the box when it becomes typable (round start /
    // after a submit) for fast play. NEVER do this on touch devices — a
    // non-gesture .focus() can't open the soft keyboard there and actively
    // makes it flicker/close across round transitions. Since the input is
    // never disabled, a user-tapped input keeps focus (and the keyboard) on
    // its own on mobile, so no programmatic focus is needed.
    useEffect(() => {
        const coarsePointer =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(pointer: coarse)").matches;

        if (coarsePointer) return;
        if (enabled && !busy) {
            inputRef.current?.focus({ preventScroll: true });
        }
    }, [enabled, busy]);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!enabled || !trimmed || busy) return;
        setBusy(true);
        setFeedback(null);
        try {
            const result = await submitGuess(accessToken, instanceId, trimmed);
            if (result.ok) {
                setText("");
            } else {
                setFeedback(rejectReasonText(t, result.reason));
            }
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : t("networkError"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="guess-input" onSubmit={onSubmit}>
            {/* Intentionally never `disabled`: a disabled input loses focus,
                which closes the mobile soft keyboard on every round transition
                / submit (and programmatic .focus() can't reliably reopen it
                without a user gesture). Gate guessing via onSubmit + the
                button; show the inactive state with a class instead. */}
            <input
                ref={inputRef}
                type="text"
                inputMode="text"
                enterKeyHint="send"
                placeholder={
                    enabled
                        ? t("guessPlaceholderActive")
                        : t("guessPlaceholderWaiting")
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                className={enabled ? undefined : "waiting"}
                aria-disabled={!enabled}
                maxLength={MAX_GUESS_LENGTH}
            />
            <button type="submit" disabled={!enabled || busy || !text.trim()}>
                {t("guessButton")}
            </button>
            {feedback && <span className="guess-feedback">{feedback}</span>}
        </form>
    );
}

function SkipControl({
    accessToken,
    instanceId,
    skip,
    enabled,
    roundKey,
    t,
    onVoteStart,
    onVoteFailed,
}: {
    accessToken: string;
    instanceId: string;
    skip: SkipState;
    enabled: boolean;
    /** Identity of the round at render time; forwarded to callbacks so the
     *  parent can scope optimistic updates and rollbacks to the round the
     *  user actually clicked on. When a vote hits the majority threshold the
     *  server awaits endRound/startRound before replying, so the POST can
     *  resolve after the next round has already started. */
    roundKey: number | null;
    t: Translator;
    onVoteStart: () => void;
    onVoteFailed: (roundKey: number | null) => void;
}) {
    const [feedback, setFeedback] = useState<string | null>(null);

    const onClick = async () => {
        if (!enabled || skip.userVoted) return;
        const clickedRoundKey = roundKey;
        setFeedback(null);
        // Optimistic: disable immediately so the UI doesn't stall for the
        // full server round-trip (which blocks on endRound/startRound when
        // the vote hits the majority threshold). The reducer clears
        // userVoted on roundStart so the button re-enables as soon as the
        // next round begins.
        onVoteStart();
        try {
            const result = await apiSkipVote(accessToken, instanceId);
            if (!result.ok) {
                setFeedback(rejectReasonText(t, result.reason));
                onVoteFailed(clickedRoundKey);
            }
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : t("networkError"));
            onVoteFailed(clickedRoundKey);
        }
    };

    const tally =
        skip.threshold > 0
            ? `${skip.requesters}/${skip.threshold}`
            : t("skipVoteFallback");

    const pct =
        skip.threshold > 0
            ? Math.min(100, (skip.requesters / skip.threshold) * 100)
            : 0;

    const stateClass = skip.achieved
        ? "revealed"
        : skip.userVoted
          ? "voted"
          : "";

    return (
        <div className="hint-control">
            <button
                type="button"
                onClick={onClick}
                disabled={!enabled || skip.achieved || skip.userVoted}
                className={`skip-button ${stateClass}`}
                title={t("skipTitle")}
            >
                <span className="hint-icon">⏭️</span>
                <span className="hint-label">
                    {skip.achieved ? t("skipDone") : t("skipButton", { tally })}
                </span>
                <span
                    className="hint-progress skip-bar"
                    style={{ width: `${pct}%` }}
                />
            </button>
            {feedback && <span className="hint-feedback">{feedback}</span>}
        </div>
    );
}

function HintControl({
    accessToken,
    instanceId,
    hint,
    enabled,
    t,
}: {
    accessToken: string;
    instanceId: string;
    hint: HintState;
    enabled: boolean;
    t: Translator;
}) {
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    const onClick = async () => {
        if (busy || !enabled) return;
        setBusy(true);
        setFeedback(null);
        try {
            const result = await apiHintVote(accessToken, instanceId);
            if (!result.ok) setFeedback(rejectReasonText(t, result.reason));
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : t("networkError"));
        } finally {
            setBusy(false);
        }
    };

    const tally =
        hint.threshold > 0
            ? `${hint.requesters}/${hint.threshold}`
            : t("hintVoteFallback");

    const pct =
        hint.threshold > 0
            ? Math.min(100, (hint.requesters / hint.threshold) * 100)
            : 0;

    return (
        <div className="hint-control">
            <button
                type="button"
                onClick={onClick}
                disabled={busy || !enabled}
                className={hint.revealed ? "revealed" : ""}
                title={t("hintTitle")}
            >
                <span className="hint-icon">💡</span>
                <span className="hint-label">
                    {hint.revealed
                        ? t("hintRevealed")
                        : t("hintButton", { tally })}
                </span>
                <span className="hint-progress" style={{ width: `${pct}%` }} />
            </button>
            {hint.revealed && <div className="hint-text">{hint.revealed}</div>}
            {feedback && <span className="hint-feedback">{feedback}</span>}
        </div>
    );
}

function BookmarkStar({
    accessToken,
    instanceId,
    youtubeLink,
    isBookmarked,
    onBookmarked,
    t,
}: {
    accessToken: string;
    instanceId: string;
    /**
     * Known song link (after the reveal). Pass `null` during the active round
     * to bookmark whatever song is currently playing without exposing the
     * link to the iframe.
     */
    youtubeLink: string | null;
    isBookmarked: boolean;
    onBookmarked: (link: string) => void;
    t: Translator;
}) {
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    // Optimistic flip so the icon doesn't lag the click. Cleared once the
    // parent's `isBookmarked` catches up.
    const [optimistic, setOptimistic] = useState(false);

    useEffect(() => {
        if (isBookmarked) setOptimistic(false);
    }, [isBookmarked]);

    const showFilled = isBookmarked || optimistic;

    const onClick = async () => {
        if (busy || showFilled) return;
        setBusy(true);
        setFeedback(null);
        setOptimistic(true);
        try {
            const result = await bookmarkSong(
                accessToken,
                instanceId,
                youtubeLink ?? undefined,
            );

            if (result.ok) {
                const resolved = result.youtubeLink ?? youtubeLink;
                if (resolved) onBookmarked(resolved);
            } else {
                setFeedback(rejectReasonText(t, result.reason));
                setOptimistic(false);
            }
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : t("networkError"));
            setOptimistic(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            className={`bookmark-star ${showFilled ? "filled" : ""}`}
            onClick={onClick}
            disabled={busy || showFilled}
            title={
                showFilled ? t("bookmarkTitleDone") : t("bookmarkTitleActive")
            }
        >
            {showFilled ? "🔖" : "🏷️"}
            {feedback && <span className="bookmark-feedback">{feedback}</span>}
        </button>
    );
}

function resolveWinnerText(
    t: Translator,
    scoreboard: ActivityScoreboardSnapshot | null,
    viewerUserID: string | null,
): string {
    // scoreboard.winnerIDs / highestScore are populated by the server after
    // the final roundEnd, so we can reuse the same tie-aware logic the bot
    // uses in channel embeds without any additional state.
    if (
        !scoreboard ||
        scoreboard.winnerIDs.length === 0 ||
        scoreboard.highestScore === 0
    ) {
        return t("sessionWinnerNone");
    }

    const isOnePoint = scoreboard.highestScore === 1;

    if (scoreboard.winnerIDs.length === 1) {
        const winnerID = scoreboard.winnerIDs[0]!;
        const isViewer = viewerUserID !== null && winnerID === viewerUserID;
        if (isViewer) {
            return t(
                isOnePoint
                    ? "sessionWinnerSoloYouOne"
                    : "sessionWinnerSoloYouMany",
                { score: scoreboard.highestScore },
            );
        }
        const username =
            scoreboard.players.find((p) => p.id === winnerID)?.username ??
            winnerID;
        return t(
            isOnePoint ? "sessionWinnerSoloOne" : "sessionWinnerSoloMany",
            { username, score: scoreboard.highestScore },
        );
    }

    const nameByID = new Map(scoreboard.players.map((p) => [p.id, p.username]));
    const winnerNames = scoreboard.winnerIDs.map(
        (id) => nameByID.get(id) ?? id,
    );

    return t(isOnePoint ? "sessionWinnerTieOne" : "sessionWinnerTieMany", {
        names: winnerNames.join(", "),
        score: scoreboard.highestScore,
    });
}

const GENDER_OPTIONS: ActivityGender[] = ["male", "female", "coed"];
const GUESS_MODE_OPTIONS: ActivityGuessMode[] = ["song", "artist", "both"];
const SHUFFLE_OPTIONS: ActivityShuffle[] = [
    "random",
    "weighted_easy",
    "weighted_hard",
    "popularity",
    "chronological",
    "reversechronological",
];
const SEEK_OPTIONS: ActivitySeek[] = ["random", "beginning", "middle"];
const LANGUAGE_OPTIONS: ActivityLanguage[] = ["all", "korean"];
const RELEASE_OPTIONS: ActivityRelease[] = ["official", "bside", "all"];
const ARTIST_TYPE_OPTIONS: ActivityArtistType[] = [
    "soloists",
    "groups",
    "both",
];
const SUBUNITS_OPTIONS: ActivitySubunits[] = ["include", "exclude"];

/**
 * An option's heading plus an optional ⓘ that reveals a short explanation
 * (the gist of what `/help <option>` shows) on hover/focus.
 */
function OptionLabel({
    label,
    help,
}: {
    label: React.ReactNode;
    help?: string;
}) {
    return (
        <div className="option-label">
            <span>{label}</span>
            {help && (
                <button
                    type="button"
                    className="option-info"
                    aria-label={help}
                    title={help}
                    onClick={(e) => e.preventDefault()}
                >
                    ?
                </button>
            )}
        </div>
    );
}

/** One option in the grid: a label (+ help) over its pill controls. The
 *  .options-group wrapper makes it a single grid cell in the options panel. */
function PillField({
    label,
    help,
    children,
}: {
    label: string;
    help: string;
    children: React.ReactNode;
}) {
    return (
        <div className="options-group">
            <OptionLabel label={label} help={help} />
            <div className="pills">{children}</div>
        </div>
    );
}

function OptionsPanel({
    accessToken,
    instanceId,
    options,
    t,
    onOptimistic,
    onRollback,
}: {
    accessToken: string;
    instanceId: string;
    options: ActivityOptionsSnapshot;
    t: Translator;
    /** Applied instantly on click so the UI doesn't stall for the server
     *  round-trip. Rolled back to the pre-click value if the request fails. */
    onOptimistic: (next: ActivityOptionsSnapshot) => void;
    onRollback: (prev: ActivityOptionsSnapshot) => void;
}) {
    const [feedback, setFeedback] = useState<string | null>(null);

    const submit = async (
        req: SetOptionRequest,
        nextOptions: ActivityOptionsSnapshot,
    ): Promise<void> => {
        const prev = options;
        onOptimistic(nextOptions);
        setFeedback(null);
        try {
            const result = await apiSetOption(accessToken, instanceId, req);
            if (!result.ok) {
                setFeedback(rejectReasonText(t, result.reason));
                onRollback(prev);
            }
        } catch (e) {
            setFeedback(e instanceof Error ? e.message : t("networkError"));
            onRollback(prev);
        }
    };

    const isAlternating = options.gender[0] === "alternating";

    const toggleGender = (g: ActivityGender): void => {
        const set = new Set<ActivityGender>(
            isAlternating ? [] : options.gender,
        );
        if (set.has(g)) {
            set.delete(g);
        } else {
            set.add(g);
        }

        const next = Array.from(set);
        void submit(
            { kind: "gender", genders: next },
            { ...options, gender: next },
        );
    };

    const toggleAlternating = (): void => {
        const next: ActivityGender[] = isAlternating ? [] : ["alternating"];
        void submit(
            { kind: "gender", genders: next },
            { ...options, gender: next },
        );
    };

    const pickGuessMode = (mode: ActivityGuessMode): void => {
        if (mode === options.guessMode) return;
        void submit(
            { kind: "guessMode", guessMode: mode },
            { ...options, guessMode: mode },
        );
    };

    const toggleMultiguess = (): void => {
        const next: ActivityMultiguess =
            options.multiguess === "on" ? "off" : "on";
        void submit(
            { kind: "multiguess", multiguess: next },
            { ...options, multiguess: next },
        );
    };

    const submitLimit = (start: number, end: number): void => {
        // The game engine requires end > start (a zero/negative-width range
        // selects no songs), matching the /limit slash command. Surface a
        // message instead of silently dropping the change (e.g. "1 - 1").
        if (start >= end) {
            setFeedback(t("options.limitRangeError"));
            return;
        }

        void submit(
            { kind: "limit", limitStart: start, limitEnd: end },
            { ...options, limitStart: start, limitEnd: end },
        );
    };

    const submitCutoff = (beginning: number, end: number): void => {
        if (beginning > end) {
            setFeedback(t("options.cutoffRangeError"));
            return;
        }

        void submit(
            { kind: "cutoff", beginningYear: beginning, endYear: end },
            { ...options, beginningYear: beginning, endYear: end },
        );
    };

    const submitGoal = (goal: number | null): void => {
        void submit({ kind: "goal", goal }, { ...options, goal });
    };

    const submitTimer = (timer: number | null): void => {
        void submit({ kind: "timer", timer }, { ...options, timer });
    };

    const submitDuration = (duration: number | null): void => {
        void submit({ kind: "duration", duration }, { ...options, duration });
    };

    const pickShuffle = (shuffle: ActivityShuffle): void => {
        if (shuffle === options.shuffle) return;
        void submit({ kind: "shuffle", shuffle }, { ...options, shuffle });
    };

    const pickSeek = (seek: ActivitySeek): void => {
        if (seek === options.seek) return;
        void submit({ kind: "seek", seek }, { ...options, seek });
    };

    const pickLanguage = (language: ActivityLanguage): void => {
        if (language === options.language) return;
        void submit({ kind: "language", language }, { ...options, language });
    };

    const pickRelease = (release: ActivityRelease): void => {
        if (release === options.release) return;
        void submit({ kind: "release", release }, { ...options, release });
    };

    const pickArtistType = (artisttype: ActivityArtistType): void => {
        if (artisttype === options.artisttype) return;
        void submit(
            { kind: "artisttype", artisttype },
            { ...options, artisttype },
        );
    };

    const pickSubunits = (subunits: ActivitySubunits): void => {
        if (subunits === options.subunits) return;
        void submit({ kind: "subunits", subunits }, { ...options, subunits });
    };

    const submitArtistList = (
        listKind: "groups" | "includes" | "excludes",
        next: ActivityArtist[],
    ): void => {
        void submit(
            { kind: listKind, artistIDs: next.map((a) => a.id) },
            { ...options, [listKind]: next.length === 0 ? null : next },
        );
    };

    return (
        <div className="options-panel">
            <PillField
                label={t("options.gender")}
                help={t("options.help.gender")}
            >
                {GENDER_OPTIONS.map((g) => {
                    const active = !isAlternating && options.gender.includes(g);

                    return (
                        <button
                            key={g}
                            type="button"
                            className={`pill ${active ? "on" : ""}`}
                            onClick={() => toggleGender(g)}
                        >
                            {t(`options.${g}`)}
                        </button>
                    );
                })}
                <button
                    type="button"
                    className={`pill ${isAlternating ? "on" : ""}`}
                    onClick={toggleAlternating}
                >
                    {t("options.alternating")}
                </button>
            </PillField>

            <PillField
                label={t("options.guessMode")}
                help={t("options.help.guessMode")}
            >
                {GUESS_MODE_OPTIONS.map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        className={`pill ${
                            options.guessMode === mode ? "on" : ""
                        }`}
                        onClick={() => pickGuessMode(mode)}
                    >
                        {t(`options.${mode}`)}
                    </button>
                ))}
            </PillField>

            <PillField
                label={t("options.multiguess")}
                help={t("options.help.multiguess")}
            >
                <button
                    type="button"
                    className={`pill ${
                        options.multiguess === "on" ? "on" : ""
                    }`}
                    onClick={toggleMultiguess}
                >
                    {options.multiguess === "on"
                        ? t("options.on")
                        : t("options.off")}
                </button>
            </PillField>

            <PillField
                label={t("options.shuffle")}
                help={t("options.help.shuffle")}
            >
                {SHUFFLE_OPTIONS.map((s) => (
                    <button
                        key={s}
                        type="button"
                        className={`pill ${options.shuffle === s ? "on" : ""}`}
                        onClick={() => pickShuffle(s)}
                    >
                        {t(`options.${s}`)}
                    </button>
                ))}
            </PillField>

            <PillField label={t("options.seek")} help={t("options.help.seek")}>
                {SEEK_OPTIONS.map((s) => (
                    <button
                        key={s}
                        type="button"
                        className={`pill ${options.seek === s ? "on" : ""}`}
                        onClick={() => pickSeek(s)}
                    >
                        {t(`options.${s}`)}
                    </button>
                ))}
            </PillField>

            <PillField
                label={t("options.language")}
                help={t("options.help.language")}
            >
                {LANGUAGE_OPTIONS.map((l) => (
                    <button
                        key={l}
                        type="button"
                        className={`pill ${options.language === l ? "on" : ""}`}
                        onClick={() => pickLanguage(l)}
                    >
                        {t(`options.${l}`)}
                    </button>
                ))}
            </PillField>

            <PillField
                label={t("options.release")}
                help={t("options.help.release")}
            >
                {RELEASE_OPTIONS.map((r) => (
                    <button
                        key={r}
                        type="button"
                        className={`pill ${options.release === r ? "on" : ""}`}
                        onClick={() => pickRelease(r)}
                    >
                        {t(`options.${r}`)}
                    </button>
                ))}
            </PillField>

            <PillField
                label={t("options.artisttype")}
                help={t("options.help.artisttype")}
            >
                {ARTIST_TYPE_OPTIONS.map((a) => (
                    <button
                        key={a}
                        type="button"
                        className={`pill ${
                            options.artisttype === a ? "on" : ""
                        }`}
                        onClick={() => pickArtistType(a)}
                    >
                        {t(`options.${a}`)}
                    </button>
                ))}
            </PillField>

            <PillField
                label={t("options.subunits")}
                help={t("options.help.subunits")}
            >
                {SUBUNITS_OPTIONS.map((s) => (
                    <button
                        key={s}
                        type="button"
                        className={`pill ${options.subunits === s ? "on" : ""}`}
                        onClick={() => pickSubunits(s)}
                    >
                        {t(`options.${s}`)}
                    </button>
                ))}
            </PillField>

            <NumberRangeGroup
                label={t("options.limit")}
                help={t("options.help.limit")}
                startValue={options.limitStart}
                endValue={options.limitEnd}
                startMin={0}
                startMax={100000}
                endMin={1}
                endMax={100000}
                onCommit={submitLimit}
            />

            <NumberRangeGroup
                label={t("options.cutoff")}
                help={t("options.help.cutoff")}
                startValue={options.beginningYear}
                endValue={options.endYear}
                startMin={1900}
                startMax={new Date().getFullYear()}
                endMin={1900}
                endMax={new Date().getFullYear()}
                onCommit={submitCutoff}
            />

            <NullableNumberGroup
                label={t("options.goal")}
                help={t("options.help.goal")}
                value={options.goal}
                min={1}
                max={100000}
                onCommit={submitGoal}
                offLabel={t("options.off")}
            />

            <NullableNumberGroup
                label={t("options.timer")}
                help={t("options.help.timer")}
                value={options.timer}
                min={2}
                max={180}
                onCommit={submitTimer}
                offLabel={t("options.off")}
            />

            <NullableNumberGroup
                label={t("options.duration")}
                help={t("options.help.duration")}
                value={options.duration}
                min={2}
                max={600}
                onCommit={submitDuration}
                offLabel={t("options.off")}
            />

            <ArtistListGroup
                label={t("options.groups")}
                help={t("options.help.groups")}
                accessToken={accessToken}
                artists={options.groups ?? []}
                onCommit={(next) => submitArtistList("groups", next)}
            />

            <ArtistListGroup
                label={t("options.includes")}
                help={t("options.help.includes")}
                accessToken={accessToken}
                artists={options.includes ?? []}
                onCommit={(next) => submitArtistList("includes", next)}
            />

            <ArtistListGroup
                label={t("options.excludes")}
                help={t("options.help.excludes")}
                accessToken={accessToken}
                artists={options.excludes ?? []}
                onCommit={(next) => submitArtistList("excludes", next)}
            />

            {feedback && <span className="options-feedback">{feedback}</span>}
        </div>
    );
}

function ArtistListGroup({
    label,
    help,
    accessToken,
    artists,
    onCommit,
}: {
    label: string;
    help?: string;
    accessToken: string;
    artists: ActivityArtist[];
    onCommit: (next: ActivityArtist[]) => void;
}) {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<ActivityArtist[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Debounce the autocomplete fetch so typing doesn't hammer the server.
    // 200ms is the shortest delay that feels like "instant" in practice.
    useEffect(() => {
        if (!showSuggestions) return;
        const trimmed = query.trim();
        // Guard against out-of-order responses: a slower fetch for an earlier
        // query must not overwrite the results of the query the user has since
        // typed. Cleanup marks this run stale so its response is dropped.
        let cancelled = false;
        const id = setTimeout(() => {
            void (async () => {
                try {
                    const results = await fetchArtistAutocomplete(
                        accessToken,
                        trimmed,
                    );
                    if (cancelled) return;
                    const selectedIDs = new Set(artists.map((a) => a.id));
                    setSuggestions(
                        results
                            .filter((r) => !selectedIDs.has(r.id))
                            .map((r) => ({ id: r.id, name: r.name })),
                    );
                } catch {
                    if (!cancelled) setSuggestions([]);
                }
            })();
        }, 200);
        return () => {
            cancelled = true;
            clearTimeout(id);
        };
    }, [query, accessToken, showSuggestions, artists]);

    const addArtist = (a: ActivityArtist): void => {
        onCommit([...artists, a]);
        setQuery("");
    };

    const removeArtist = (id: number): void => {
        onCommit(artists.filter((a) => a.id !== id));
    };

    return (
        <div className="options-group options-group-wide">
            <OptionLabel label={label} help={help} />
            {artists.length > 0 && (
                <div className="artist-chips">
                    {artists.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            className="artist-chip"
                            onClick={() => removeArtist(a.id)}
                            title="Remove"
                        >
                            {a.name}
                            <span className="artist-chip-x">×</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="artist-autocomplete">
                <input
                    type="text"
                    className="option-number"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() =>
                        setTimeout(() => setShowSuggestions(false), 150)
                    }
                    placeholder="Add artist..."
                />
                {showSuggestions && suggestions.length > 0 && (
                    <ul className="artist-suggestions">
                        {suggestions.map((s) => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        addArtist(s);
                                    }}
                                >
                                    {s.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function NumberRangeGroup({
    label,
    help,
    startValue,
    endValue,
    startMin,
    startMax,
    endMin,
    endMax,
    onCommit,
}: {
    label: string;
    help?: string;
    startValue: number;
    endValue: number;
    startMin: number;
    startMax: number;
    endMin: number;
    endMax: number;
    onCommit: (start: number, end: number) => void;
}) {
    const [start, setStart] = useState(String(startValue));
    const [end, setEnd] = useState(String(endValue));

    useEffect(() => setStart(String(startValue)), [startValue]);
    useEffect(() => setEnd(String(endValue)), [endValue]);

    const commit = (): void => {
        const s = parseInt(start, 10);
        const e = parseInt(end, 10);
        if (!Number.isInteger(s) || !Number.isInteger(e)) {
            setStart(String(startValue));
            setEnd(String(endValue));
            return;
        }
        if (s === startValue && e === endValue) return;
        onCommit(s, e);
    };

    return (
        <div className="options-group">
            <OptionLabel label={label} help={help} />
            <div className="number-row">
                <input
                    type="number"
                    className="option-number"
                    value={start}
                    min={startMin}
                    max={startMax}
                    onChange={(e) => setStart(e.target.value)}
                    onBlur={commit}
                />
                <span className="option-range-sep">–</span>
                <input
                    type="number"
                    className="option-number"
                    value={end}
                    min={endMin}
                    max={endMax}
                    onChange={(e) => setEnd(e.target.value)}
                    onBlur={commit}
                />
            </div>
        </div>
    );
}

function NullableNumberGroup({
    label,
    help,
    value,
    min,
    max,
    onCommit,
    offLabel,
}: {
    label: string;
    help?: string;
    value: number | null;
    min: number;
    max: number;
    onCommit: (next: number | null) => void;
    offLabel: string;
}) {
    const [text, setText] = useState(value === null ? "" : String(value));

    useEffect(() => {
        setText(value === null ? "" : String(value));
    }, [value]);

    const commit = (): void => {
        if (text.trim() === "") {
            if (value !== null) onCommit(null);
            return;
        }
        const n = parseInt(text, 10);
        if (!Number.isInteger(n) || n < min || n > max) {
            setText(value === null ? "" : String(value));
            return;
        }
        if (n === value) return;
        onCommit(n);
    };

    return (
        <div className="options-group">
            <OptionLabel label={label} help={help} />
            <div className="number-row">
                <input
                    type="number"
                    className="option-number"
                    value={text}
                    min={min}
                    max={max}
                    placeholder={offLabel}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={commit}
                />
                <button
                    type="button"
                    className={`pill ${value === null ? "on" : ""}`}
                    onClick={() => onCommit(null)}
                >
                    {offLabel}
                </button>
            </div>
        </div>
    );
}

function SongHistory({
    history,
    bookmarkedLinks,
    auth,
    onBookmarked,
    t,
}: {
    history: UiState["roundHistory"];
    bookmarkedLinks: Set<string>;
    /** Auth context for bookmarking from the list; null before auth resolves
     *  (no buttons rendered then). */
    auth: { accessToken: string; instanceId: string } | null;
    onBookmarked: (link: string) => void;
    t: Translator;
}) {
    if (history.length === 0) {
        return <p className="empty">{t("historyEmpty")}</p>;
    }

    // Newest first feels more natural when the list starts growing past the
    // fold — the last revealed song is always at the top.
    const ordered = [...history].reverse();

    return (
        <ol className="song-history">
            {ordered.map((song, i) => {
                const roundNum = history.length - i;
                return (
                    <li key={`${roundNum}-${song.youtubeLink}`}>
                        <span className="history-round">#{roundNum}</span>
                        <div className="history-text">
                            <div className="history-song">{song.songName}</div>
                            <div className="history-artist">
                                {song.artistName} ({song.publishYear})
                            </div>
                        </div>
                        {auth && (
                            <BookmarkStar
                                accessToken={auth.accessToken}
                                instanceId={auth.instanceId}
                                youtubeLink={song.youtubeLink}
                                isBookmarked={bookmarkedLinks.has(
                                    song.youtubeLink,
                                )}
                                onBookmarked={onBookmarked}
                                t={t}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

function GuessTicker({ guesses }: { guesses: UiState["recentGuesses"] }) {
    if (guesses.length === 0) return null;

    return (
        <ul className="guess-ticker">
            {guesses.slice(-RECENT_GUESS_DISPLAY_LIMIT).map((g) => (
                <li
                    key={`${g.userID}-${g.ts}`}
                    className={g.isCorrect ? "correct" : "incorrect"}
                >
                    {g.isCorrect ? "✓" : "·"} {g.username}
                </li>
            ))}
        </ul>
    );
}

/** A connection problem to surface on the error screen. Both are rendered
 *  with the current i18n bundle at render time (never a string captured when
 *  the error happened): "disconnected" = the socket dropped after connecting;
 *  "fatal" = connect/reconnect failed. The underlying error/status is logged
 *  to the console rather than shown, so users see a friendly line. */
type ConnectionError = { kind: "disconnected" } | { kind: "fatal" };

export default function App() {
    const [error, setError] = useState<ConnectionError | null>(null);
    const [ready, setReady] = useState(false);
    const [ui, setUi] = useState<UiState>(initialUi);
    const [authState, setAuthState] = useState<{
        accessToken: string;
        instanceId: string;
        userID: string;
    } | null>(null);
    const [bundle, setBundle] = useState<Record<string, string> | null>(null);
    // Both drawers default closed. On desktop the scoreboard rail is always
    // shown via the grid (this flag only drives its mobile drawer), and history
    // opens on demand; on mobile nothing covers the screen on load.
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [theme, setTheme] = useState<Theme>(readInitialTheme);
    // Bumped to re-run the whole connect flow (auth → snapshot → stream)
    // without reloading the iframe — drives the Reconnect button.
    const [connectNonce, setConnectNonce] = useState(0);
    const [reconnecting, setReconnecting] = useState(false);

    // Mirror theme → <html data-theme>. Persist to localStorage so the
    // next iframe load doesn't flash the other theme while React boots.
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // ignore
        }
    }, [theme]);

    const streamRef = useRef<{ close: () => void } | null>(null);
    // Translator is stable for a given bundle. Seed with an English stub for
    // the two strings rendered before the /api/activity/i18n fetch resolves,
    // so the splash isn't "appTitle" / "statusConnecting".
    const t = useMemo<Translator>(
        () => makeTranslator(bundle ?? PRE_HYDRATE_STRINGS),
        [bundle],
    );

    useEffect(() => {
        let cancelled = false;
        // Captured per run: present on a reconnect, null on the first connect.
        const existingAuth = authState;
        (async () => {
            try {
                // First connect: run the full OAuth handshake. Reconnect: reuse
                // the existing token/instance instead of re-running
                // sdk.commands.authorize() — re-authorizing in the same Activity
                // session can reject (with a non-Error, which surfaced as the
                // old "Unknown error"), and the access token is still valid.
                let accessToken: string;
                let instanceId: string;
                let userID: string;
                if (existingAuth) {
                    accessToken = existingAuth.accessToken;
                    instanceId = existingAuth.instanceId;
                    userID = existingAuth.userID;
                } else {
                    const auth = await authenticate();
                    if (cancelled) return;
                    accessToken = auth.accessToken;
                    instanceId = auth.sdk.instanceId;
                    userID = auth.user.id;
                }

                // Fetch the snapshot and initial i18n bundle. The i18n endpoint
                // is public; seeding from the snapshot's viewerLocale (OAuth
                // user.locale) avoids an extra SDK round-trip on first render.
                const snapshot = await fetchSnapshot(accessToken, instanceId);

                if (cancelled) return;
                const initialBundle = await fetchI18nBundle(
                    snapshot.viewerLocale || "en",
                );

                if (cancelled) return;
                setBundle(initialBundle.strings);
                setUi((prev) => applySnapshot(prev, snapshot));
                setAuthState({ accessToken, instanceId, userID });
                setReady(true);

                // The SDK exposes the live Discord client locale, which can
                // differ from the OAuth-embedded user.locale. Fetch the
                // matching bundle and swap if it's different.
                const sdkLocale = await readSdkLocale();
                if (
                    !cancelled &&
                    sdkLocale &&
                    sdkLocale !== snapshot.viewerLocale
                ) {
                    try {
                        const next = await fetchI18nBundle(sdkLocale);
                        if (!cancelled) setBundle(next.strings);
                    } catch (e) {
                        console.warn("locale swap failed", e);
                    }
                }

                const stream = await openActivityStream(
                    accessToken,
                    instanceId,
                    (event) => {
                        setUi((prev) => reduce(prev, event));
                    },
                    () => {
                        // Socket closed (often a flaky connection). Record the
                        // state (not a translated string — `t` here is captured
                        // from when the effect ran); the render translates it
                        // with the current bundle. The error screen offers
                        // Reconnect, which re-runs this flow.
                        if (!cancelled) {
                            setReconnecting(false);
                            setError({ kind: "disconnected" });
                        }
                    },
                );

                if (cancelled) {
                    stream.close();
                    return;
                }

                streamRef.current = stream;
                setReconnecting(false);
            } catch (e) {
                // Log the real error/status for debugging; show the user a
                // friendly, generic line instead of "Snapshot failed: 502" etc.
                console.error(e);
                if (!cancelled) {
                    setReconnecting(false);
                    setError({ kind: "fatal" });
                }
            }
        })();

        return () => {
            cancelled = true;
            streamRef.current?.close();
            streamRef.current = null;
        };
        // Re-runs when connectNonce changes (the Reconnect button). t's
        // identity changes with the bundle, but we don't want a locale flip to
        // tear down and rebuild the stream, so it's intentionally omitted.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectNonce]);

    const reconnect = (): void => {
        setReconnecting(true);
        setError(null);
        setReady(false);
        setConnectNonce((n) => n + 1);
    };

    if (error) {
        return (
            <div className="kmq-app error">
                <h2>{t("appTitle")}</h2>
                <p>
                    {error.kind === "disconnected"
                        ? t("statusDisconnected")
                        : t("connectFailed")}
                </p>
                <button
                    type="button"
                    className="primary"
                    onClick={reconnect}
                    disabled={reconnecting}
                >
                    {reconnecting ? t("reconnecting") : t("reconnectButton")}
                </button>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="kmq-app loading">
                <img
                    className="kmq-splash-logo"
                    src={kmqLogoUrl}
                    alt={t("appTitle")}
                />
                <p>{t("statusConnecting")}</p>
            </div>
        );
    }

    return (
        <>
            {/* Decorative background stars */}
            <span
                className="deco-star"
                style={{ top: "12%", left: "8%" }}
                aria-hidden
            >
                ✦
            </span>
            <span
                className="deco-star"
                style={{ top: "45%", left: "3%" }}
                aria-hidden
            >
                ♡
            </span>
            <span
                className="deco-star"
                style={{ top: "30%", right: "15%" }}
                aria-hidden
            >
                ✧
            </span>
            <span
                className="deco-star"
                style={{ top: "70%", left: "12%" }}
                aria-hidden
            >
                ✦
            </span>
            <span
                className="deco-star"
                style={{ top: "85%", right: "8%" }}
                aria-hidden
            >
                ♡
            </span>

            {/* Left sidebar toggle — song history */}
            <button
                type="button"
                className={`sidebar-toggle left ${historyOpen ? "active" : ""}`}
                onClick={() => setHistoryOpen((o) => !o)}
                title={t("historyHeading")}
            >
                <span>🎵</span>
            </button>

            {/* Right sidebar toggle — scoreboard + options */}
            <button
                type="button"
                className={`sidebar-toggle ${sidebarOpen ? "active" : ""}`}
                onClick={() => setSidebarOpen((o) => !o)}
                title={t("scoreboardHeading")}
            >
                <span>🏆</span>
            </button>

            {/* Theme toggle — sun/moon */}
            <button
                type="button"
                className="sidebar-toggle theme"
                onClick={() =>
                    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
                title={t(
                    theme === "dark" ? "themeToggleLight" : "themeToggleDark",
                )}
                aria-label={t(
                    theme === "dark" ? "themeToggleLight" : "themeToggleDark",
                )}
            >
                <span>{theme === "dark" ? "☀" : "☾"}</span>
            </button>

            <div
                className={`kmq-layout ${historyOpen ? "left-open" : ""} ${
                    sidebarOpen ? "right-open" : ""
                }`}
            >
                {/* Left sidebar — song history */}
                <aside
                    className={`kmq-sidebar left ${historyOpen ? "open" : ""}`}
                    aria-label={t("historyHeading")}
                >
                    <div className="sidebar-header">
                        <span className="sidebar-title">
                            {t("historyHeading")}
                        </span>
                        <button
                            type="button"
                            className="sidebar-close"
                            onClick={() => setHistoryOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                    <div className="sidebar-body">
                        <SongHistory
                            history={ui.roundHistory}
                            bookmarkedLinks={ui.bookmarkedLinks}
                            auth={
                                authState
                                    ? {
                                          accessToken: authState.accessToken,
                                          instanceId: authState.instanceId,
                                      }
                                    : null
                            }
                            onBookmarked={(link) =>
                                setUi((prev) => ({
                                    ...prev,
                                    bookmarkedLinks: new Set([
                                        ...prev.bookmarkedLinks,
                                        link,
                                    ]),
                                }))
                            }
                            t={t}
                        />
                    </div>
                </aside>

                <div className="kmq-main">
                    <div className="kmq-app">
                        <header>
                            <div className="header-left">
                                <h1>
                                    {t("appTitle")}{" "}
                                    <span className="logo-heart">♥</span>
                                </h1>
                                {ui.session &&
                                    (() => {
                                        const completed =
                                            ui.session.roundsPlayed;
                                        const inProgress =
                                            ui.currentRound !== null;
                                        const displayed = inProgress
                                            ? completed + 1
                                            : completed;
                                        const showRatio = completed > 0;
                                        if (
                                            displayed === 0 &&
                                            ui.bookmarkedLinks.size === 0
                                        ) {
                                            return null;
                                        }
                                        return (
                                            <span className="meta">
                                                {displayed > 0 && (
                                                    <>
                                                        {t("headerRound", {
                                                            num: displayed,
                                                        })}
                                                        {showRatio && (
                                                            <>
                                                                {" · "}
                                                                {t(
                                                                    "headerCorrectRatio",
                                                                    {
                                                                        correct:
                                                                            ui
                                                                                .session
                                                                                .correctGuesses,
                                                                        total: completed,
                                                                    },
                                                                )}
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                                {ui.bookmarkedLinks.size >
                                                    0 && (
                                                    <span className="bookmark-chip">
                                                        🔖{" "}
                                                        {
                                                            ui.bookmarkedLinks
                                                                .size
                                                        }
                                                    </span>
                                                )}
                                            </span>
                                        );
                                    })()}
                            </div>

                            {authState && (
                                <ControlButtons
                                    accessToken={authState.accessToken}
                                    instanceId={authState.instanceId}
                                    hasSession={
                                        ui.session !== null && !ui.sessionEnded
                                    }
                                    t={t}
                                />
                            )}
                        </header>

                        {ui.sessionEnded && (
                            <div className="banner">
                                {t("sessionEndedBanner", {
                                    playSlash: "/play",
                                })}
                            </div>
                        )}

                        <CurrentRound
                            round={ui.currentRound}
                            reveal={ui.lastReveal}
                            history={ui.roundHistory}
                            guesses={ui.recentGuesses}
                            t={t}
                            winnerText={
                                ui.sessionEnded &&
                                ui.hadSession &&
                                !ui.lastReveal
                                    ? resolveWinnerText(
                                          t,
                                          ui.scoreboard,
                                          authState?.userID ?? null,
                                      )
                                    : null
                            }
                            bookmarkSlot={
                                authState &&
                                (ui.currentRound || ui.lastReveal) ? (
                                    <BookmarkStar
                                        // Force a fresh component (and its optimistic
                                        // state) on every round transition so the icon
                                        // resets cleanly.
                                        key={
                                            ui.currentRound
                                                ? `round-${ui.currentRound.roundIndex}`
                                                : `reveal-${ui.lastReveal?.song.youtubeLink}`
                                        }
                                        accessToken={authState.accessToken}
                                        instanceId={authState.instanceId}
                                        youtubeLink={
                                            ui.lastReveal?.song.youtubeLink ??
                                            null
                                        }
                                        isBookmarked={
                                            ui.lastReveal
                                                ? ui.bookmarkedLinks.has(
                                                      ui.lastReveal.song
                                                          .youtubeLink,
                                                  )
                                                : ui.currentRoundBookmarked
                                        }
                                        t={t}
                                        onBookmarked={(link) =>
                                            setUi((prev) => ({
                                                ...prev,
                                                bookmarkedLinks: new Set([
                                                    ...prev.bookmarkedLinks,
                                                    link,
                                                ]),
                                                currentRoundBookmarked: true,
                                            }))
                                        }
                                    />
                                ) : null
                            }
                        />

                        {authState && (
                            <GuessInput
                                accessToken={authState.accessToken}
                                instanceId={authState.instanceId}
                                enabled={
                                    ui.currentRound !== null && !ui.sessionEnded
                                }
                                t={t}
                            />
                        )}

                        {authState && (
                            <div className="vote-row">
                                <HintControl
                                    accessToken={authState.accessToken}
                                    instanceId={authState.instanceId}
                                    hint={ui.hint}
                                    enabled={
                                        ui.currentRound !== null &&
                                        !ui.sessionEnded
                                    }
                                    t={t}
                                />
                                <SkipControl
                                    accessToken={authState.accessToken}
                                    instanceId={authState.instanceId}
                                    skip={ui.skip}
                                    enabled={
                                        ui.currentRound !== null &&
                                        !ui.sessionEnded
                                    }
                                    roundKey={
                                        ui.currentRound?.roundIndex ?? null
                                    }
                                    t={t}
                                    onVoteStart={() =>
                                        setUi((prev) => ({
                                            ...prev,
                                            // Optimistically count the user's own
                                            // vote so the tally/progress bar moves
                                            // immediately, the same way the hint
                                            // button shows progress on click. The
                                            // server's skipProgress (absolute count)
                                            // overwrites this on the round-trip, and
                                            // roundStart resets it if the vote ends
                                            // the round — so there's no double count.
                                            skip: {
                                                ...prev.skip,
                                                userVoted: true,
                                                requesters:
                                                    prev.skip.requesters + 1,
                                            },
                                        }))
                                    }
                                    onVoteFailed={(clickedRoundKey) =>
                                        setUi((prev) => {
                                            // Only roll back if we're still on the round
                                            // the user clicked — a roundStart between
                                            // click and reply has already reset userVoted
                                            // cleanly for the new round.
                                            const currentKey =
                                                prev.currentRound?.roundIndex ??
                                                null;
                                            if (
                                                currentKey !== clickedRoundKey
                                            ) {
                                                return prev;
                                            }
                                            // Undo the optimistic vote: a failed vote
                                            // never reached the server's skip count, so
                                            // back out both the flag and the +1 tally.
                                            return {
                                                ...prev,
                                                skip: {
                                                    ...prev.skip,
                                                    userVoted: false,
                                                    requesters: Math.max(
                                                        0,
                                                        prev.skip.requesters -
                                                            1,
                                                    ),
                                                },
                                            };
                                        })
                                    }
                                />
                            </div>
                        )}

                        {authState && ui.options && (
                            <div className="options-section">
                                <button
                                    type="button"
                                    className={`options-toggle ${
                                        optionsOpen ? "open" : ""
                                    }`}
                                    onClick={() => setOptionsOpen((o) => !o)}
                                    aria-expanded={optionsOpen}
                                >
                                    <span>⚙ {t("options.heading")}</span>
                                    <span className="options-chevron">▾</span>
                                </button>
                                {optionsOpen && (
                                    <OptionsPanel
                                        accessToken={authState.accessToken}
                                        instanceId={authState.instanceId}
                                        options={ui.options}
                                        t={t}
                                        onOptimistic={(next) =>
                                            setUi((prev) => ({
                                                ...prev,
                                                options: next,
                                            }))
                                        }
                                        onRollback={(prevOpts) =>
                                            setUi((prev) => ({
                                                ...prev,
                                                options: prevOpts,
                                            }))
                                        }
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar — scoreboard */}
                <aside
                    className={`kmq-sidebar ${sidebarOpen ? "open" : ""}`}
                    aria-label={t("scoreboardHeading")}
                >
                    <div className="sidebar-header">
                        <span className="sidebar-title">
                            {t("scoreboardHeading")}
                        </span>
                        <button
                            type="button"
                            className="sidebar-close"
                            onClick={() => setSidebarOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                    <div className="sidebar-body">
                        {ui.scoreboard ? (
                            <Scoreboard scoreboard={ui.scoreboard} t={t} />
                        ) : (
                            <p className="empty">{t("scoreboardEmpty")}</p>
                        )}
                    </div>
                </aside>
            </div>
        </>
    );
}

function reduce(
    prev: UiState,
    msg: { type: "snapshot"; snapshot: ActivitySnapshot } | ActivityEvent,
): UiState {
    switch (msg.type) {
        case "snapshot":
            return applySnapshot(prev, msg.snapshot);
        case "sessionStart":
            // Reset every per-session bit of state so an old session's
            // bookmarks/reveals don't carry over.
            return {
                ...prev,
                session: msg.session,
                scoreboard: {
                    players: [],
                    winnerIDs: [],
                    highestScore: 0,
                },
                currentRound: null,
                lastReveal: null,
                recentGuesses: [],
                sessionEnded: false,
                hint: initialHint,
                skip: initialSkip,
                bookmarkedLinks: new Set(),
                currentRoundBookmarked: false,
                hadSession: true,
                roundHistory: [],
            };
        case "roundStart":
            return {
                ...prev,
                currentRound: msg.round,
                lastReveal: null,
                recentGuesses: [],
                hint: initialHint,
                skip: initialSkip,
                currentRoundBookmarked: false,
            };
        case "roundEnd":
            return {
                ...prev,
                currentRound: null,
                lastReveal: {
                    song: msg.song,
                    correctGuessers: msg.correctGuessers,
                    allGuesses: msg.allGuesses,
                    songCounter: msg.songCounter,
                },
                scoreboard: msg.scoreboard,
                roundHistory: [...prev.roundHistory, msg.song],
                // Bump the local session counters so the header advances. The
                // server doesn't re-broadcast session metadata after each
                // round, so we mirror Session.getRoundsPlayed here.
                session: prev.session
                    ? {
                          ...prev.session,
                          roundsPlayed: prev.session.roundsPlayed + 1,
                          correctGuesses:
                              prev.session.correctGuesses +
                              (msg.isCorrectGuess ? 1 : 0),
                      }
                    : prev.session,
            };
        case "hintProgress":
            return {
                ...prev,
                hint: {
                    ...prev.hint,
                    requesters: msg.requesters,
                    threshold: msg.threshold,
                },
            };
        case "hintRevealed":
            return {
                ...prev,
                hint: { ...prev.hint, revealed: msg.text },
            };
        case "skipProgress":
            return {
                ...prev,
                skip: {
                    ...prev.skip,
                    requesters: msg.requesters,
                    threshold: msg.threshold,
                },
            };
        case "skipped":
            return {
                ...prev,
                skip: { ...prev.skip, achieved: true },
            };
        case "scoreboardUpdate":
            return { ...prev, scoreboard: msg.scoreboard };
        case "guessReceived":
            return {
                ...prev,
                recentGuesses: [
                    ...prev.recentGuesses.slice(-RECENT_GUESS_BUFFER_LIMIT),
                    {
                        userID: msg.userID,
                        // Guard against an older server build that doesn't
                        // yet emit username on guessReceived — render the
                        // raw ID rather than an empty string.
                        username: msg.username || msg.userID,
                        isCorrect: msg.isCorrect,
                        ts: msg.ts,
                    },
                ],
            };
        case "sessionEnd":
            // Clear stale per-session metadata so the header / vote bars don't
            // show ghost state until the next /play. Also clear lastReveal:
            // if the game ends while a round reveal is on screen, a lingering
            // reveal would keep the reveal branch rendering and hide the
            // game-over winner screen.
            return {
                ...prev,
                sessionEnded: true,
                session: null,
                currentRound: null,
                lastReveal: null,
                hint: initialHint,
                skip: initialSkip,
            };
        case "optionsChanged":
            return { ...prev, options: msg.options };
        case "roundTimerChanged":
            // Mid-round timer change: update only the live round's countdown
            // reference so the main timer reflects the new value immediately.
            return prev.currentRound
                ? {
                      ...prev,
                      currentRound: {
                          ...prev.currentRound,
                          guessTimeoutSec: msg.guessTimeoutSec,
                          timerStartedAt: msg.timerStartedAt,
                      },
                  }
                : prev;
        default:
            return prev;
    }
}
