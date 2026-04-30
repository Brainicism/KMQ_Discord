import { useEffect, useRef, useState } from "react";
import { authenticate, openExternalUrl } from "./discordSdk";
import {
    bookmarkSong,
    endGame as apiEndGame,
    fetchSnapshot,
    hintVote as apiHintVote,
    openActivityStream,
    skipVote as apiSkipVote,
    startGame as apiStartGame,
    submitGuess,
    type GuessRejectReason,
} from "./api";
import type {
    ActivityCorrectGuesser,
    ActivityRoundGuess,
    ActivityRoundMeta,
    ActivityRoundReveal,
    ActivityScoreboardSnapshot,
    ActivitySessionMeta,
    ActivitySnapshot,
} from "./types";

interface RecentGuess {
    userID: string;
    isCorrect: boolean;
    ts: number;
}

interface HintState {
    requesters: number;
    threshold: number;
    revealed: string | null;
}

interface SkipState {
    requesters: number;
    threshold: number;
    achieved: boolean;
}

interface RoundBookmarkState {
    pending: boolean;
    bookmarked: boolean;
}

interface UiState {
    session: ActivitySessionMeta | null;
    scoreboard: ActivityScoreboardSnapshot | null;
    currentRound: ActivityRoundMeta | null;
    lastReveal: {
        song: ActivityRoundReveal;
        correctGuessers: ActivityCorrectGuesser[];
        allGuesses: ActivityRoundGuess[];
    } | null;
    recentGuesses: RecentGuess[];
    sessionEnded: boolean;
    hint: HintState;
    skip: SkipState;
    bookmarkedLinks: Set<string>;
    roundBookmark: RoundBookmarkState;
}

const initialHint: HintState = {
    requesters: 0,
    threshold: 0,
    revealed: null,
};

const initialSkip: SkipState = {
    requesters: 0,
    threshold: 0,
    achieved: false,
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
    roundBookmark: { pending: false, bookmarked: false },
};

function applySnapshot(prev: UiState, snapshot: ActivitySnapshot): UiState {
    return {
        ...prev,
        session: snapshot.session ?? null,
        scoreboard: snapshot.scoreboard ?? null,
        currentRound: snapshot.currentRound ?? null,
        sessionEnded: !snapshot.hasSession,
    };
}

// Discord Activities sandbox the iframe — only hosts registered as URL
// Mappings in the developer portal can be reached. Rewrite YouTube image
// hosts to a /external/yt/ prefix that the dev portal maps to i.ytimg.com.
function proxyImageUrl(url: string): string {
    return url
        .replace(/^https?:\/\/img\.youtube\.com\//, "/external/yt/")
        .replace(/^https?:\/\/i\.ytimg\.com\//, "/external/yt/");
}

function RoundTimer({ startedAt }: { startedAt: number }) {
    const [elapsedMs, setElapsedMs] = useState(Date.now() - startedAt);
    useEffect(() => {
        const t = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
        return () => clearInterval(t);
    }, [startedAt]);

    const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
    return <span className="round-timer">{seconds}s</span>;
}

function Scoreboard({ scoreboard }: { scoreboard: ActivityScoreboardSnapshot }) {
    const sorted = [...scoreboard.players]
        .filter((p) => p.score > 0 || p.inVC)
        .sort((a, b) => b.score - a.score);

    if (sorted.length === 0) {
        return <p className="empty">No players yet — join the voice channel.</p>;
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
                        {!p.inVC && <span className="afk"> (left)</span>}
                    </span>
                    <span className="score">{p.score}</span>
                    {p.expGain > 0 && (
                        <span className="exp">+{p.expGain} EXP</span>
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
}: {
    round: ActivityRoundMeta | null;
    reveal: UiState["lastReveal"];
    bookmarkSlot: React.ReactNode;
}) {
    return (
        <section className="round-area">
            {round ? (
                <div className="round-area-body in-round">
                    <div className="round-area-text">
                        <h3>Round {round.roundIndex + 1}</h3>
                        <RoundTimer startedAt={round.songStartedAt} />
                        {round.guessTimeoutSec && (
                            <span className="timeout">
                                timeout {round.guessTimeoutSec}s
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
                            {reveal.song.artistName} ({reveal.song.publishYear}
                            )
                        </p>
                        <ul className="winners">
                            {reveal.correctGuessers.map((g) => (
                                <li key={g.id}>
                                    {g.username}: +{g.pointsEarned} pts, +
                                    {g.expGain} EXP
                                </li>
                            ))}
                        </ul>
                        {reveal.allGuesses.length > 0 && (
                            <details className="all-guesses" open>
                                <summary>
                                    All guesses ({reveal.allGuesses.length})
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
                                    `https://youtu.be/${reveal.song.youtubeLink}`,
                                )
                            }
                            title="Open on YouTube"
                        >
                            <img
                                src={proxyImageUrl(reveal.song.thumbnailUrl)}
                                alt=""
                            />
                            <span className="thumbnail-overlay">
                                ▶ YouTube
                            </span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="round-area-body idle">
                    <div className="round-area-text">
                        <p className="empty">Waiting for the next round...</p>
                    </div>
                    <div className="thumbnail-slot placeholder" aria-hidden>
                        <span>🎵</span>
                    </div>
                </div>
            )}
        </section>
    );
}

function rejectReasonText(reason: GuessRejectReason | undefined): string {
    switch (reason) {
        case "no_session":
            return "No active game.";
        case "maintenance":
            return "Maintenance mode is on.";
        case "banned":
            return "You are banned from KMQ.";
        case "rate_limit":
            return "Slow down — too many requests.";
        case "not_in_vc":
            return "Join the voice channel first.";
        case "unauthorized":
            return "Session expired — refresh.";
        case "forbidden":
            return "You're not a participant of this Activity.";
        case "bad_request":
            return "Bad request.";
        case "session_already_running":
            return "A game is already running.";
        case "no_round":
            return "No round in progress.";
        default:
            return "Action failed.";
    }
}

function ControlButtons({
    accessToken,
    instanceId,
    hasSession,
}: {
    accessToken: string;
    instanceId: string;
    hasSession: boolean;
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
            if (!result.ok) setFeedback(rejectReasonText(result.reason));
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : "Network error");
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
                    {busy === "start" ? "Starting..." : "Start game"}
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
                    {busy === "end" ? "Ending..." : "End game"}
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
}: {
    accessToken: string;
    instanceId: string;
    enabled: boolean;
}) {
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Refocus when the input transitions back to enabled (new round) so the
    // user can keep typing without clicking back into the box.
    useEffect(() => {
        if (enabled) {
            inputRef.current?.focus();
        }
    }, [enabled]);

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
                setFeedback(rejectReasonText(result.reason));
            }
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : "Network error");
        } finally {
            setBusy(false);
            // Refocus after every submit (the disabled-while-busy flicker can
            // drop focus on some browsers).
            inputRef.current?.focus();
        }
    };

    return (
        <form className="guess-input" onSubmit={onSubmit}>
            <input
                ref={inputRef}
                type="text"
                placeholder={enabled ? "Type your guess..." : "Waiting for round..."}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!enabled || busy}
                autoFocus
                maxLength={500}
            />
            <button type="submit" disabled={!enabled || busy || !text.trim()}>
                Guess
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
}: {
    accessToken: string;
    instanceId: string;
    skip: SkipState;
    enabled: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    const onClick = async () => {
        if (busy || !enabled) return;
        setBusy(true);
        setFeedback(null);
        try {
            const result = await apiSkipVote(accessToken, instanceId);
            if (!result.ok) setFeedback(rejectReasonText(result.reason));
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : "Network error");
        } finally {
            setBusy(false);
        }
    };

    const tally =
        skip.threshold > 0 ? `${skip.requesters}/${skip.threshold}` : "vote";

    const pct =
        skip.threshold > 0
            ? Math.min(100, (skip.requesters / skip.threshold) * 100)
            : 0;

    return (
        <div className="hint-control">
            <button
                type="button"
                onClick={onClick}
                disabled={busy || !enabled || skip.achieved}
                className={`skip-button ${skip.achieved ? "revealed" : ""}`}
                title="Vote to skip this song"
            >
                <span className="hint-icon">⏭️</span>
                <span className="hint-label">
                    {skip.achieved ? "Skipped" : `Skip (${tally})`}
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
}: {
    accessToken: string;
    instanceId: string;
    hint: HintState;
    enabled: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    const onClick = async () => {
        if (busy || !enabled) return;
        setBusy(true);
        setFeedback(null);
        try {
            const result = await apiHintVote(accessToken, instanceId);
            if (!result.ok) setFeedback(rejectReasonText(result.reason));
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : "Network error");
        } finally {
            setBusy(false);
        }
    };

    const tally =
        hint.threshold > 0 ? `${hint.requesters}/${hint.threshold}` : "vote";

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
                title="Vote for a hint"
            >
                <span className="hint-icon">💡</span>
                <span className="hint-label">
                    {hint.revealed
                        ? "Hint revealed"
                        : `Hint (${tally})`}
                </span>
                <span
                    className="hint-progress"
                    style={{ width: `${pct}%` }}
                />
            </button>
            {hint.revealed && (
                <div className="hint-text">{hint.revealed}</div>
            )}
            {feedback && <span className="hint-feedback">{feedback}</span>}
        </div>
    );
}

function RoundBookmarkButton({
    accessToken,
    instanceId,
    state,
    enabled,
    onResult,
}: {
    accessToken: string;
    instanceId: string;
    state: RoundBookmarkState;
    enabled: boolean;
    onResult: (link: string | undefined, ok: boolean) => void;
}) {
    const [feedback, setFeedback] = useState<string | null>(null);

    const onClick = async () => {
        if (state.pending || state.bookmarked || !enabled) return;
        setFeedback(null);
        onResult(undefined, true); // optimistic: mark pending
        try {
            const result = await bookmarkSong(accessToken, instanceId);
            if (!result.ok) {
                setFeedback(rejectReasonText(result.reason));
                onResult(undefined, false);
            } else {
                onResult(result.youtubeLink, true);
            }
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : "Network error");
            onResult(undefined, false);
        }
    };

    return (
        <div className="hint-control">
            <button
                type="button"
                onClick={onClick}
                disabled={!enabled || state.pending || state.bookmarked}
                className={state.bookmarked ? "revealed bookmark-button" : "bookmark-button"}
                title={
                    state.bookmarked
                        ? "Bookmarked — DM'd at end of session"
                        : "Bookmark this song"
                }
            >
                <span className="hint-icon">
                    {state.bookmarked ? "🔖" : "🏷️"}
                </span>
                <span className="hint-label">
                    {state.bookmarked ? "Bookmarked" : "Bookmark"}
                </span>
            </button>
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
}: {
    accessToken: string;
    instanceId: string;
    youtubeLink: string;
    isBookmarked: boolean;
    onBookmarked: (link: string) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    const onClick = async () => {
        if (busy || isBookmarked) return;
        setBusy(true);
        setFeedback(null);
        // Optimistic
        onBookmarked(youtubeLink);
        try {
            const result = await bookmarkSong(
                accessToken,
                instanceId,
                youtubeLink,
            );

            if (!result.ok) setFeedback(rejectReasonText(result.reason));
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : "Network error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            className={`bookmark-star ${isBookmarked ? "filled" : ""}`}
            onClick={onClick}
            disabled={busy || isBookmarked}
            title={
                isBookmarked
                    ? "Bookmarked — DM'd at end of session"
                    : "Bookmark this song"
            }
        >
            {isBookmarked ? "🔖" : "🏷️"}
            {feedback && <span className="bookmark-feedback">{feedback}</span>}
        </button>
    );
}

function GuessTicker({
    guesses,
    scoreboard,
}: {
    guesses: RecentGuess[];
    scoreboard: ActivityScoreboardSnapshot | null;
}) {
    if (guesses.length === 0) return null;
    const nameByID = new Map(
        (scoreboard?.players ?? []).map((p) => [p.id, p.username]),
    );

    return (
        <ul className="guess-ticker">
            {guesses.slice(-8).map((g) => {
                const name = nameByID.get(g.userID) ?? g.userID;
                return (
                    <li
                        key={`${g.userID}-${g.ts}`}
                        className={g.isCorrect ? "correct" : "incorrect"}
                    >
                        {g.isCorrect ? "✓" : "·"} {name}
                    </li>
                );
            })}
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
    } | null>(null);

    const streamRef = useRef<{ close: () => void } | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const auth = await authenticate();
                if (cancelled) return;
                const instanceId = auth.sdk.instanceId;
                const snapshot = await fetchSnapshot(
                    auth.accessToken,
                    instanceId,
                );

                if (cancelled) return;
                setUi((prev) => applySnapshot(prev, snapshot));
                setAuthState({ accessToken: auth.accessToken, instanceId });
                setReady(true);

                streamRef.current = openActivityStream(
                    auth.accessToken,
                    instanceId,
                    (event) => {
                        setUi((prev) => reduce(prev, event));
                    },
                    () => {
                        // socket closed — show banner; phase 2 can add reconnect
                        setError("Disconnected from KMQ. Refresh to retry.");
                    },
                );
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setError(
                        e instanceof Error ? e.message : "Unknown error",
                    );
                }
            }
        })();

        return () => {
            cancelled = true;
            streamRef.current?.close();
        };
    }, []);

    if (error) {
        return (
            <div className="kmq-app error">
                <h2>KMQ</h2>
                <p>{error}</p>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="kmq-app loading">
                <h2>KMQ</h2>
                <p>Connecting...</p>
            </div>
        );
    }

    return (
        <div className="kmq-app">
            <header>
                <h1>KMQ</h1>
                {ui.session &&
                    (() => {
                        const completed = ui.session.roundsPlayed;
                        const inProgress = ui.currentRound !== null;
                        const displayed = inProgress ? completed + 1 : completed;
                        const showRatio = completed > 0;
                        if (displayed === 0 && ui.bookmarkedLinks.size === 0) {
                            return null;
                        }
                        return (
                            <span className="meta">
                                {displayed > 0 && (
                                    <>
                                        Round {displayed}
                                        {showRatio && (
                                            <>
                                                {" · Correct "}
                                                {ui.session.correctGuesses}/
                                                {completed}
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
                />
            )}

            {ui.sessionEnded && (
                <div className="banner">
                    No active game — start one with the button above (or{" "}
                    <code>/play</code> in this channel).
                </div>
            )}

            <CurrentRound
                round={ui.currentRound}
                reveal={ui.lastReveal}
                bookmarkSlot={
                    authState && ui.lastReveal ? (
                        <BookmarkStar
                            accessToken={authState.accessToken}
                            instanceId={authState.instanceId}
                            youtubeLink={ui.lastReveal.song.youtubeLink}
                            isBookmarked={ui.bookmarkedLinks.has(
                                ui.lastReveal.song.youtubeLink,
                            )}
                            onBookmarked={(link) =>
                                setUi((prev) => ({
                                    ...prev,
                                    bookmarkedLinks: new Set([
                                        ...prev.bookmarkedLinks,
                                        link,
                                    ]),
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
                />
            )}

            {authState && (
                <div className="vote-row">
                    <HintControl
                        accessToken={authState.accessToken}
                        instanceId={authState.instanceId}
                        hint={ui.hint}
                        enabled={ui.currentRound !== null && !ui.sessionEnded}
                    />
                    <SkipControl
                        accessToken={authState.accessToken}
                        instanceId={authState.instanceId}
                        skip={ui.skip}
                        enabled={ui.currentRound !== null && !ui.sessionEnded}
                    />
                    <RoundBookmarkButton
                        accessToken={authState.accessToken}
                        instanceId={authState.instanceId}
                        state={ui.roundBookmark}
                        enabled={
                            ui.currentRound !== null && !ui.sessionEnded
                        }
                        onResult={(link, ok) => {
                            setUi((prev) => {
                                if (!ok) {
                                    return {
                                        ...prev,
                                        roundBookmark: {
                                            pending: false,
                                            bookmarked: false,
                                        },
                                    };
                                }
                                const next: UiState = {
                                    ...prev,
                                    roundBookmark: {
                                        pending: link === undefined,
                                        bookmarked: link !== undefined,
                                    },
                                };

                                if (link) {
                                    next.bookmarkedLinks = new Set([
                                        ...prev.bookmarkedLinks,
                                        link,
                                    ]);
                                }

                                return next;
                            });
                        }}
                    />
                </div>
            )}

            <section className="scoreboard-section">
                <h3>Scoreboard</h3>
                {ui.scoreboard ? (
                    <Scoreboard scoreboard={ui.scoreboard} />
                ) : (
                    <p className="empty">No scoreboard yet.</p>
                )}
            </section>

            <GuessTicker
                guesses={ui.recentGuesses}
                scoreboard={ui.scoreboard}
            />
        </div>
    );
}

function reduce(
    prev: UiState,
    msg:
        | { type: "snapshot"; snapshot: ActivitySnapshot }
        | import("./types").ActivityEvent,
): UiState {
    switch (msg.type) {
        case "snapshot":
            return applySnapshot(prev, msg.snapshot);
        case "sessionStart":
            return {
                ...prev,
                session: msg.session,
                scoreboard: prev.scoreboard ?? {
                    players: [],
                    winnerIDs: [],
                    highestScore: 0,
                },
                sessionEnded: false,
                lastReveal: null,
                recentGuesses: [],
            };
        case "roundStart":
            return {
                ...prev,
                currentRound: msg.round,
                lastReveal: null,
                recentGuesses: [],
                hint: initialHint,
                skip: initialSkip,
                roundBookmark: { pending: false, bookmarked: false },
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
                    ...prev.recentGuesses.slice(-15),
                    {
                        userID: msg.userID,
                        isCorrect: msg.isCorrect,
                        ts: msg.ts,
                    },
                ],
            };
        case "sessionEnd":
            return {
                ...prev,
                sessionEnded: true,
                currentRound: null,
            };
        default:
            return prev;
    }
}
