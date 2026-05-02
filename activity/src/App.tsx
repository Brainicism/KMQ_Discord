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
    fetchI18nBundle,
    fetchSnapshot,
    hintVote as apiHintVote,
    openActivityStream,
    setOption as apiSetOption,
    skipVote as apiSkipVote,
    startGame as apiStartGame,
    submitGuess,
} from "./api";
import type {
    ActivityGender,
    ActivityGuessMode,
    ActivityMultiguess,
} from "./types/activity_options_snapshot";
import type ActivityOptionsSnapshot from "./types/activity_options_snapshot";
import type { SetOptionRequest } from "./api";
import { authenticate, openExternalUrl, readSdkLocale } from "./discordSdk";
import { makeTranslator } from "./i18n/translator";
import kmqLogoUrl from "./assets/kmq_logo.png";
import thumbsUpUrl from "./assets/thumbs_up.png";
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
};

function applySnapshot(prev: UiState, snapshot: ActivitySnapshot): UiState {
    return {
        ...prev,
        session: snapshot.session ?? null,
        scoreboard: snapshot.scoreboard ?? null,
        currentRound: snapshot.currentRound ?? null,
        sessionEnded: !snapshot.hasSession,
        hadSession: prev.hadSession || snapshot.hasSession,
        options: snapshot.options,
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

function RoundTimer({ startedAt }: { startedAt: number }) {
    const [elapsedMs, setElapsedMs] = useState(Date.now() - startedAt);
    useEffect(() => {
        const id = setInterval(
            () => setElapsedMs(Date.now() - startedAt),
            ROUND_TIMER_TICK_MS,
        );
        return () => clearInterval(id);
    }, [startedAt]);

    const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
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

function CurrentRound({
    round,
    reveal,
    bookmarkSlot,
    winnerText,
    t,
}: {
    round: ActivityRoundMeta | null;
    reveal: UiState["lastReveal"];
    bookmarkSlot: React.ReactNode;
    /** If non-null, the round-area idle state renders the session-end winner
     *  line in place of "Waiting for next round". */
    winnerText: string | null;
    t: Translator;
}) {
    return (
        <section className="round-area">
            {round ? (
                <div className="round-area-body in-round">
                    <div className="round-area-text">
                        <div className="reveal-header">
                            <h3>
                                {t("roundLabel", { num: round.roundIndex + 1 })}
                            </h3>
                            {bookmarkSlot}
                        </div>
                        <RoundTimer startedAt={round.songStartedAt} />
                        {round.guessTimeoutSec && (
                            <span className="timeout">
                                {t("roundTimeoutLabel", {
                                    sec: round.guessTimeoutSec,
                                })}
                            </span>
                        )}
                    </div>
                    <div className="thumbnail-slot placeholder" aria-hidden>
                        <span>🎵</span>
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
                            {reveal.correctGuessers.map((g) => (
                                <li key={g.id}>
                                    {t("revealWinners", {
                                        username: g.username,
                                        points: g.pointsEarned,
                                        exp: g.expGain,
                                    })}
                                </li>
                            ))}
                        </ul>
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
                            <img
                                src={proxyImageUrl(reveal.song.thumbnailUrl)}
                                alt=""
                                onError={(e) => {
                                    // maxresdefault.jpg isn't generated for
                                    // pre-720p uploads — fall back to the
                                    // always-present hqdefault.jpg. Guard
                                    // against a re-trigger loop by swapping
                                    // only once.
                                    const img = e.currentTarget;
                                    if (
                                        img.src.includes("/maxresdefault.jpg")
                                    ) {
                                        img.src = img.src.replace(
                                            "/maxresdefault.jpg",
                                            "/hqdefault.jpg",
                                        );
                                    }
                                }}
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
                        <div className="thumbnail-slot session-winner-art">
                            <img src={thumbsUpUrl} alt="" />
                        </div>
                    ) : (
                        <div className="thumbnail-slot placeholder" aria-hidden>
                            <span>🎵</span>
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

    // Refocus whenever the input becomes typable: on round start (enabled
    // flips true) and after a submit resolves (busy flips false). Running
    // from an effect is important — focusing inside the submit's finally
    // block happens before React re-renders the input with disabled=false,
    // and the browser rejects focus() on a disabled element. preventScroll
    // because the input lives below the fold on short viewports.
    useEffect(() => {
        if (enabled && !busy) {
            inputRef.current?.focus({ preventScroll: true });
        }
    }, [enabled, busy]);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || busy) return;
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
            <input
                ref={inputRef}
                type="text"
                placeholder={
                    enabled
                        ? t("guessPlaceholderActive")
                        : t("guessPlaceholderWaiting")
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!enabled || busy}
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
        // Alternating is mutually exclusive with the flat genders.
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
        if (start >= end) return;
        void submit(
            { kind: "limit", limitStart: start, limitEnd: end },
            { ...options, limitStart: start, limitEnd: end },
        );
    };

    const submitCutoff = (beginning: number, end: number): void => {
        if (beginning > end) return;
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

    return (
        <details className="options-panel">
            <summary>{t("options.heading")}</summary>

            <div className="options-group">
                <span className="options-label">{t("options.gender")}</span>
                <div className="options-row">
                    {GENDER_OPTIONS.map((g) => {
                        const active =
                            !isAlternating && options.gender.includes(g);

                        return (
                            <button
                                key={g}
                                type="button"
                                className={`option-chip ${active ? "active" : ""}`}
                                onClick={() => toggleGender(g)}
                            >
                                {t(`options.${g}`)}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        className={`option-chip ${isAlternating ? "active" : ""}`}
                        onClick={toggleAlternating}
                    >
                        {t("options.alternating")}
                    </button>
                </div>
            </div>

            <div className="options-group">
                <span className="options-label">{t("options.guessMode")}</span>
                <div className="options-row">
                    {GUESS_MODE_OPTIONS.map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            className={`option-chip ${
                                options.guessMode === mode ? "active" : ""
                            }`}
                            onClick={() => pickGuessMode(mode)}
                        >
                            {t(`options.${mode}`)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="options-group">
                <span className="options-label">{t("options.multiguess")}</span>
                <div className="options-row">
                    <button
                        type="button"
                        className={`option-chip ${
                            options.multiguess === "on" ? "active" : ""
                        }`}
                        onClick={toggleMultiguess}
                    >
                        {options.multiguess === "on"
                            ? t("options.on")
                            : t("options.off")}
                    </button>
                </div>
            </div>

            <NumberRangeGroup
                label={t("options.limit")}
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
                value={options.goal}
                min={1}
                max={100000}
                onCommit={submitGoal}
                offLabel={t("options.off")}
            />

            <NullableNumberGroup
                label={t("options.timer")}
                value={options.timer}
                min={2}
                max={180}
                onCommit={submitTimer}
                offLabel={t("options.off")}
            />

            {feedback && <span className="options-feedback">{feedback}</span>}
        </details>
    );
}

function NumberRangeGroup({
    label,
    startValue,
    endValue,
    startMin,
    startMax,
    endMin,
    endMax,
    onCommit,
}: {
    label: string;
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

    // Re-sync when the wire-side value changes (optimistic write, or a
    // slash-command-driven optionsChanged event).
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
            <span className="options-label">{label}</span>
            <div className="options-row">
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
    value,
    min,
    max,
    onCommit,
    offLabel,
}: {
    label: string;
    value: number | null;
    min: number;
    max: number;
    onCommit: (next: number | null) => void;
    offLabel: string;
}) {
    // Keep a local text state so typing doesn't immediately fire a write.
    // Commit on blur, or on clicking the Off chip.
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
            <span className="options-label">{label}</span>
            <div className="options-row">
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
                    className={`option-chip ${value === null ? "active" : ""}`}
                    onClick={() => onCommit(null)}
                >
                    {offLabel}
                </button>
            </div>
        </div>
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

export default function App() {
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [ui, setUi] = useState<UiState>(initialUi);
    const [authState, setAuthState] = useState<{
        accessToken: string;
        instanceId: string;
        userID: string;
    } | null>(null);
    const [bundle, setBundle] = useState<Record<string, string> | null>(null);

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
        (async () => {
            try {
                const auth = await authenticate();
                if (cancelled) return;
                const instanceId = auth.sdk.instanceId;

                // Fetch the snapshot and initial i18n bundle in parallel —
                // they don't depend on each other. The i18n endpoint is
                // public; seeding from the snapshot's viewerLocale (OAuth
                // user.locale) avoids an extra SDK round-trip on first
                // render.
                const snapshot = await fetchSnapshot(
                    auth.accessToken,
                    instanceId,
                );

                if (cancelled) return;
                const initialBundle = await fetchI18nBundle(
                    snapshot.viewerLocale || "en",
                );

                if (cancelled) return;
                setBundle(initialBundle.strings);
                setUi((prev) => applySnapshot(prev, snapshot));
                setAuthState({
                    accessToken: auth.accessToken,
                    instanceId,
                    userID: auth.user.id,
                });
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
                    auth.accessToken,
                    instanceId,
                    (event) => {
                        setUi((prev) => reduce(prev, event));
                    },
                    () => {
                        // socket closed — show banner; phase 2 can add reconnect
                        setError(t("statusDisconnected"));
                    },
                );

                if (cancelled) {
                    stream.close();
                    return;
                }

                streamRef.current = stream;
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Unknown error");
                }
            }
        })();

        return () => {
            cancelled = true;
            streamRef.current?.close();
        };
        // t's identity changes with the bundle but the WS setup only runs
        // once, so don't restart it on locale flips.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (error) {
        return (
            <div className="kmq-app error">
                <h2>{t("appTitle")}</h2>
                <p>{error}</p>
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
        <div className="kmq-app">
            <header>
                <h1>{t("appTitle")}</h1>
                {ui.session &&
                    (() => {
                        const completed = ui.session.roundsPlayed;
                        const inProgress = ui.currentRound !== null;
                        const displayed = inProgress
                            ? completed + 1
                            : completed;
                        const showRatio = completed > 0;
                        if (displayed === 0 && ui.bookmarkedLinks.size === 0) {
                            return null;
                        }
                        return (
                            <span className="meta">
                                {displayed > 0 && (
                                    <>
                                        {t("headerRound", { num: displayed })}
                                        {showRatio && (
                                            <>
                                                {" · "}
                                                {t("headerCorrectRatio", {
                                                    correct:
                                                        ui.session
                                                            .correctGuesses,
                                                    total: completed,
                                                })}
                                            </>
                                        )}
                                    </>
                                )}
                                {ui.bookmarkedLinks.size > 0 && (
                                    <span className="bookmark-chip">
                                        🔖 {ui.bookmarkedLinks.size}
                                    </span>
                                )}
                            </span>
                        );
                    })()}
            </header>

            {authState && (
                <ControlButtons
                    accessToken={authState.accessToken}
                    instanceId={authState.instanceId}
                    hasSession={ui.session !== null && !ui.sessionEnded}
                    t={t}
                />
            )}

            {ui.sessionEnded && (
                <div className="banner">
                    {t("sessionEndedBanner", { playSlash: "/play" })}
                </div>
            )}

            <CurrentRound
                round={ui.currentRound}
                reveal={ui.lastReveal}
                t={t}
                winnerText={
                    ui.sessionEnded && ui.hadSession && !ui.lastReveal
                        ? resolveWinnerText(
                              t,
                              ui.scoreboard,
                              authState?.userID ?? null,
                          )
                        : null
                }
                bookmarkSlot={
                    authState && (ui.currentRound || ui.lastReveal) ? (
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
                                ui.lastReveal?.song.youtubeLink ?? null
                            }
                            isBookmarked={
                                ui.lastReveal
                                    ? ui.bookmarkedLinks.has(
                                          ui.lastReveal.song.youtubeLink,
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
                    enabled={ui.currentRound !== null && !ui.sessionEnded}
                    t={t}
                />
            )}

            {authState && (
                <div className="vote-row">
                    <HintControl
                        accessToken={authState.accessToken}
                        instanceId={authState.instanceId}
                        hint={ui.hint}
                        enabled={ui.currentRound !== null && !ui.sessionEnded}
                        t={t}
                    />
                    <SkipControl
                        accessToken={authState.accessToken}
                        instanceId={authState.instanceId}
                        skip={ui.skip}
                        enabled={ui.currentRound !== null && !ui.sessionEnded}
                        roundKey={ui.currentRound?.roundIndex ?? null}
                        t={t}
                        onVoteStart={() =>
                            setUi((prev) => ({
                                ...prev,
                                skip: { ...prev.skip, userVoted: true },
                            }))
                        }
                        onVoteFailed={(clickedRoundKey) =>
                            setUi((prev) => {
                                // Only roll back if we're still on the round
                                // the user clicked — a roundStart between
                                // click and reply has already reset userVoted
                                // cleanly for the new round.
                                const currentKey =
                                    prev.currentRound?.roundIndex ?? null;
                                if (currentKey !== clickedRoundKey) {
                                    return prev;
                                }
                                return {
                                    ...prev,
                                    skip: { ...prev.skip, userVoted: false },
                                };
                            })
                        }
                    />
                </div>
            )}

            {authState && ui.options && (
                <OptionsPanel
                    accessToken={authState.accessToken}
                    instanceId={authState.instanceId}
                    options={ui.options}
                    t={t}
                    onOptimistic={(next) =>
                        setUi((prev) => ({ ...prev, options: next }))
                    }
                    onRollback={(prevOptions) =>
                        setUi((prev) => ({ ...prev, options: prevOptions }))
                    }
                />
            )}

            <section className="scoreboard-section">
                <h3>{t("scoreboardHeading")}</h3>
                {ui.scoreboard ? (
                    <Scoreboard scoreboard={ui.scoreboard} t={t} />
                ) : (
                    <p className="empty">{t("scoreboardEmpty")}</p>
                )}
            </section>

            <GuessTicker guesses={ui.recentGuesses} />
        </div>
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
                },
                scoreboard: msg.scoreboard,
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
        case "optionsChanged":
            return { ...prev, options: msg.options };
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
            // show ghost state until the next /play.
            return {
                ...prev,
                sessionEnded: true,
                session: null,
                currentRound: null,
                hint: initialHint,
                skip: initialSkip,
            };
        default:
            return prev;
    }
}
