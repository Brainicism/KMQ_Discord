import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
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
    fetchProfile,
    fetchSnapshot,
    fetchSongInfo,
    hintVote as apiHintVote,
    openActivityStream,
    preset as apiPreset,
    searchSongs,
    setOption as apiSetOption,
    skipVote as apiSkipVote,
    startGame as apiStartGame,
    submitGuess,
    submitMcGuess,
} from "./api";
import { authenticate, openExternalUrl, readSdkLocale } from "./discordSdk";
import { makeTranslator } from "./i18n/translator";
import kmqLogoUrl from "./assets/kmq_logo.png";
import thumbsUpUrl from "./assets/thumbs_up.png";
import type { ActivityArtist } from "./types/activity_options_snapshot";
import type {
    ActivityAnswerType,
    ActivityArtistType,
    ActivityGender,
    ActivityGuessMode,
    ActivityLanguage,
    ActivityMultiguess,
    ActivityOst,
    ActivityRelease,
    ActivitySeek,
    ActivityShuffle,
    ActivitySpecial,
    ActivitySubunits,
} from "./types/activity_options_snapshot";
import type ActivityOptionsSnapshot from "./types/activity_options_snapshot";
import type {
    ActivityGameType,
    SetOptionRequest,
    StartGameOptions,
} from "./api";
import type { Translator } from "./i18n/translator";
import type {
    ActivityProfileResponse,
    ActivityProfileStats,
} from "./types/activity_profile";
import type {
    ActivitySongInfo,
    ActivitySongInfoResponse,
    ActivitySongSearchResult,
} from "./types/activity_song_info";
import type ActivityEvent from "./types/activity_event";
import type ActivityRoundMeta from "./types/activity_round_meta";
import type { ActivityMultipleChoiceOption } from "./types/activity_round_meta";
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
    className,
}: {
    thumbnailUrl: string;
    alt: string;
    className?: string;
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
    return <img className={className} src={resolvedUrl} alt={alt} />;
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
        case "playlist_invalid_url":
            return t("options.playlist.errors.invalidUrl");
        case "playlist_unsupported_url":
            return t("options.playlist.errors.unsupported");
        case "playlist_no_matches":
            return t("options.playlist.errors.noMatches");
        case "playlist_resolve_failed":
            return t("options.playlist.errors.failed");
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

// Cached profile responses keyed by user id. The `nonce` records the
// profileRefreshNonce the entry was fetched at, so a round/session end (which
// bumps the nonce) forces open cards to refetch while idle re-opens stay cheap.
type ProfileCacheEntry = { resp: ActivityProfileResponse; nonce: number };
type ProfileCache = Map<string, ProfileCacheEntry>;

// Cached song-info responses keyed by YouTube link. Like the profile cache,
// `nonce` records the refresh nonce at fetch time so a round/options change
// (which bumps the nonce) re-fetches the fields that drift — guess rate and
// "in current options" — while everything else stays cheap on re-open.
type SongInfoCacheEntry = { resp: ActivitySongInfoResponse; nonce: number };
type SongInfoCache = Map<string, SongInfoCacheEntry>;

/** True when the device supports a real hover pointer (desktop). */
function useCanHover(): boolean {
    const [can, setCan] = useState(
        () =>
            typeof window !== "undefined" &&
            !!window.matchMedia &&
            window.matchMedia("(hover: hover)").matches,
    );
    useEffect(() => {
        if (!window.matchMedia) return;
        const mq = window.matchMedia("(hover: hover)");
        const onChange = (): void => setCan(mq.matches);
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, []);
    return can;
}

// Keeps a conditionally-rendered element mounted through its close transition.
// While `open`, it mounts and — after a frame, so the enter transition runs
// from the closed state — flips `visible` true. When `open` goes false it flips
// `visible` false (playing the exit transition) and unmounts after `ms`. Drive
// opacity/transform/height off `visible` in CSS so both directions animate.
function usePresence(
    open: boolean,
    ms: number,
): { mounted: boolean; visible: boolean } {
    const [mounted, setMounted] = useState(open);
    const [visible, setVisible] = useState(open);
    useEffect(() => {
        if (open) {
            setMounted(true);
            // Double rAF: let the browser paint the closed state once before
            // flipping `visible`, so the enter transition reliably runs.
            let inner = 0;
            const outer = requestAnimationFrame(() => {
                inner = requestAnimationFrame(() => setVisible(true));
            });
            return () => {
                cancelAnimationFrame(outer);
                cancelAnimationFrame(inner);
            };
        }

        setVisible(false);
        const id = window.setTimeout(() => setMounted(false), ms);
        return () => window.clearTimeout(id);
    }, [open, ms]);
    return { mounted, visible };
}

// Crossfades between successive children identified by `viewKey`, AND animates
// the container's height from the old view's to the new view's so the content
// below moves smoothly instead of snapping (the round-area's in-round stage is
// much taller than the reveal/idle states). On a key change the previous
// children linger briefly as an absolutely-stacked layer fading out while the
// new children fade in; the wrapper's height is locked to the old height then
// transitioned to the new one. Re-renders that keep the same key pass through.
// Outlasts the CSS height transition (0.26s) plus the 2-frame rAF lead-in, so
// the cleanup (unlock height, drop the leaving layer) doesn't cut it short.
const CROSSFADE_MS = 320;

function CrossFade({
    viewKey,
    children,
}: {
    viewKey: string;
    children: React.ReactNode;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const prevKey = useRef(viewKey);
    const prevNode = useRef<React.ReactNode>(children);
    // Last natural (auto) height, recorded after every settled commit so a swap
    // knows the height to animate FROM (the new height isn't measurable until
    // after React commits the new children).
    const naturalHeight = useRef<number | null>(null);
    const [outgoing, setOutgoing] = useState<{
        key: string;
        node: React.ReactNode;
    } | null>(null);
    const [lockedHeight, setLockedHeight] = useState<number | null>(null);

    // Detects a view swap. Declared FIRST so it reads the pre-swap node/height
    // (captured by the bookkeeping effect below on the previous commit) before
    // that effect overwrites them for this commit.
    useLayoutEffect(() => {
        if (prevKey.current === viewKey) return undefined;

        const fromH = naturalHeight.current;
        const toH = containerRef.current?.offsetHeight ?? null;
        setOutgoing({ key: prevKey.current, node: prevNode.current });
        prevKey.current = viewKey;

        if (fromH !== null && toH !== null && fromH !== toH) {
            setLockedHeight(fromH);
            requestAnimationFrame(() =>
                requestAnimationFrame(() => setLockedHeight(toH)),
            );
        }

        const id = window.setTimeout(() => {
            setOutgoing(null);
            setLockedHeight(null);
        }, CROSSFADE_MS);
        return () => window.clearTimeout(id);
    }, [viewKey]);

    // Runs after every commit (after the swap effect above). Keeps the
    // previous-node snapshot fresh and, while not mid-transition, records the
    // natural height for the next swap to animate from.
    useLayoutEffect(() => {
        if (lockedHeight === null && containerRef.current) {
            naturalHeight.current = containerRef.current.offsetHeight;
        }

        prevNode.current = children;
    });

    return (
        <div
            ref={containerRef}
            className="crossfade"
            style={lockedHeight !== null ? { height: lockedHeight } : undefined}
        >
            {outgoing && (
                <div className="crossfade-layer leaving" aria-hidden>
                    {outgoing.node}
                </div>
            )}
            <div key={viewKey} className="crossfade-layer entering">
                {children}
            </div>
        </div>
    );
}

function formatProfileNumber(n: number): string {
    try {
        return n.toLocaleString();
    } catch {
        return String(n);
    }
}

function formatProfileDate(ms: number): string {
    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
        }).format(new Date(ms));
    } catch {
        return new Date(ms).toLocaleDateString();
    }
}

function formatProfileRelative(ms: number): string {
    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    try {
        const rtf = new Intl.RelativeTimeFormat(undefined, {
            numeric: "auto",
        });
        const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
            ["year", 31_536_000_000],
            ["month", 2_592_000_000],
            ["day", 86_400_000],
            ["hour", 3_600_000],
            ["minute", 60_000],
        ];
        for (const [unit, msPer] of units) {
            if (abs >= msPer) return rtf.format(Math.round(diff / msPer), unit);
        }

        return rtf.format(Math.round(diff / 1000), "second");
    } catch {
        return formatProfileDate(ms);
    }
}

/** Compact "Xh Ym" / "Ym" for a remaining duration in ms. */
function formatProfileDuration(ms: number): string {
    const totalMin = Math.max(0, Math.round(ms / 60_000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ProfileBuffs({
    stats,
    t,
    onVote,
}: {
    stats: ActivityProfileStats;
    t: Translator;
    onVote: () => void;
}) {
    const { buffs } = stats;
    const active: string[] = [];
    if (buffs.powerHour) active.push(t("profile.buffPowerHour"));
    if (buffs.firstGameOfDay) active.push(t("profile.buffFirstGame"));
    if (buffs.voteBonusActive) active.push(t("profile.buffVote"));

    return (
        <div className="profile-buffs">
            {buffs.multiplier > 1 && (
                <div className="profile-buff-active">
                    <span className="profile-buff-mult">
                        🔥{" "}
                        {t("profile.multiplier", {
                            mult: Number(buffs.multiplier.toFixed(2)),
                        })}
                    </span>
                    <span className="profile-buff-list">
                        {active.join(" · ")}
                    </span>
                    {buffs.voteBonusActive &&
                        buffs.voteBonusExpiresAtMs !== null && (
                            <span className="profile-buff-expiry">
                                {t("profile.voteExpires", {
                                    time: formatProfileDuration(
                                        buffs.voteBonusExpiresAtMs - Date.now(),
                                    ),
                                })}
                            </span>
                        )}
                </div>
            )}
            {!buffs.voteBonusActive && (
                <button
                    type="button"
                    className="profile-vote-cta"
                    onClick={onVote}
                >
                    🗳️ {t("profile.voteCta")}
                </button>
            )}
        </div>
    );
}

function ProfileCardBody({
    stats,
    isSelf,
    showLevelUp,
    t,
    onVote,
}: {
    stats: ActivityProfileStats;
    isSelf: boolean;
    showLevelUp: boolean;
    t: Translator;
    onVote: () => void;
}) {
    const span = stats.expForNextLevel - stats.expForCurrentLevel;
    const progress =
        span > 0 ? (stats.exp - stats.expForCurrentLevel) / span : 0;
    const progressPct = Math.max(0, Math.min(100, progress * 100));

    return (
        <div className="profile-body">
            {showLevelUp && (
                <div className="profile-levelup" role="status">
                    🎉 {t("profile.levelUp", { level: stats.level })}
                </div>
            )}
            <div className="profile-level-row">
                <span className="profile-level">
                    {t("profile.level")} {formatProfileNumber(stats.level)}
                </span>
                <span className="profile-rank">{stats.rankName}</span>
            </div>

            <div className="profile-xp">
                <div className="profile-xp-bar">
                    <div
                        className="profile-xp-fill"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <div className="profile-xp-label">
                    {formatProfileNumber(stats.exp)} /{" "}
                    {formatProfileNumber(stats.expForNextLevel)}
                </div>
                {stats.nextRankName && stats.levelsToNextRank !== null && (
                    <div className="profile-next-rank">
                        {t("profile.nextRank", {
                            levels: stats.levelsToNextRank,
                            rank: stats.nextRankName,
                        })}
                    </div>
                )}
            </div>

            <ProfileBuffs stats={stats} t={t} onVote={onVote} />

            <dl className="profile-stats">
                <div>
                    <dt>{t("profile.overallRank")}</dt>
                    <dd>
                        {stats.isRankIneligible
                            ? t("profile.ineligible")
                            : t("profile.rankOf", {
                                  rank: formatProfileNumber(stats.overallRank),
                                  total: formatProfileNumber(
                                      stats.totalPlayers,
                                  ),
                              })}
                    </dd>
                </div>
                <div>
                    <dt>{t("profile.songsGuessed")}</dt>
                    <dd>{formatProfileNumber(stats.songsGuessed)}</dd>
                </div>
                <div>
                    <dt>{t("profile.gamesPlayed")}</dt>
                    <dd>{formatProfileNumber(stats.gamesPlayed)}</dd>
                </div>
                <div>
                    <dt>{t("profile.timesVoted")}</dt>
                    <dd>{formatProfileNumber(stats.timesVoted)}</dd>
                </div>
                <div>
                    <dt>{t("profile.firstPlayed")}</dt>
                    <dd>{formatProfileDate(stats.firstPlayMs)}</dd>
                </div>
                <div>
                    <dt>{t("profile.lastActive")}</dt>
                    <dd>{formatProfileRelative(stats.lastActiveMs)}</dd>
                </div>
            </dl>

            {stats.badges.length > 0 && (
                <div className="profile-badges">
                    <span className="profile-badges-title">
                        {t("profile.badges")}
                    </span>
                    <ul>
                        {stats.badges.map((b) => (
                            <li key={b}>{b}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* isSelf reserved for future self-only affordances. */}
            {void isSelf}
        </div>
    );
}

/**
 * Fetches + renders a player's profile. Used both as the header "my profile"
 * modal and the scoreboard hover/tap popover. Reads from `cache` (shared
 * across the session) and refetches when `refreshNonce` changes — round/session
 * ends bump it so an open card reflects newly-earned EXP and can celebrate a
 * level-up (self only).
 */
function ProfileCard({
    accessToken,
    instanceId,
    targetUserID,
    username,
    avatarUrl,
    isSelf,
    cache,
    refreshNonce,
    t,
}: {
    accessToken: string;
    instanceId: string;
    targetUserID: string;
    username: string;
    avatarUrl: string | null;
    isSelf: boolean;
    cache: ProfileCache;
    refreshNonce: number;
    t: Translator;
}) {
    const cached = cache.get(targetUserID);
    const [resp, setResp] = useState<ActivityProfileResponse | null>(
        cached?.resp ?? null,
    );
    const [loading, setLoading] = useState(!cached);
    const [errored, setErrored] = useState(false);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const prevLevelRef = useRef<number | null>(
        cached?.resp.stats?.level ?? null,
    );

    useEffect(() => {
        let cancelled = false;
        const entry = cache.get(targetUserID);
        const fresh = entry && entry.nonce === refreshNonce;

        if (entry) {
            setResp(entry.resp);
            setLoading(false);
        }

        if (fresh) return;

        setLoading(!entry);
        setErrored(false);
        void (async () => {
            const result = await fetchProfile(
                accessToken,
                instanceId,
                targetUserID,
            );
            if (cancelled) return;
            if (!result) {
                setErrored(true);
                setLoading(false);
                return;
            }

            cache.set(targetUserID, { resp: result, nonce: refreshNonce });

            if (isSelf && result.found && result.stats) {
                const prev = prevLevelRef.current;
                if (prev !== null && result.stats.level > prev) {
                    setShowLevelUp(true);
                    window.setTimeout(() => {
                        if (!cancelled) setShowLevelUp(false);
                    }, 4000);
                }

                prevLevelRef.current = result.stats.level;
            }

            setResp(result);
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, [accessToken, instanceId, targetUserID, refreshNonce, isSelf, cache]);

    const onVote = (): void => {
        if (resp?.stats) void openExternalUrl(resp.stats.voteURL);
    };

    return (
        <div className="profile-card">
            <div className="profile-header">
                {avatarUrl && (
                    <img
                        className="profile-avatar"
                        src={avatarUrl}
                        alt=""
                        width={48}
                        height={48}
                    />
                )}
                <span className="profile-name">{username}</span>
            </div>
            {loading ? (
                <p className="profile-status">{t("profile.loading")}</p>
            ) : errored ? (
                <p className="profile-status">{t("profile.loadError")}</p>
            ) : resp && resp.found && resp.stats ? (
                <ProfileCardBody
                    stats={resp.stats}
                    isSelf={isSelf}
                    showLevelUp={showLevelUp}
                    t={t}
                    onVote={onVote}
                />
            ) : (
                <p className="profile-status">{t("profile.noStats")}</p>
            )}
        </div>
    );
}

// Positions the desktop profile popover as a viewport-`fixed` element anchored
// to its scoreboard row, so it escapes the rail's `overflow` clipping. Opens
// leftward (toward the centre) since the rail hugs the right edge; flips to
// grow upward when the row sits in the lower half so it stays on-screen.
function popoverFixedStyle(rect: DOMRect): CSSProperties {
    const GAP = 8;
    const inLowerHalf = rect.top > window.innerHeight / 2;
    return {
        position: "fixed",
        right: window.innerWidth - rect.left + GAP,
        left: "auto",
        margin: 0,
        ...(inLowerHalf
            ? { bottom: window.innerHeight - rect.bottom }
            : { top: rect.top }),
    };
}

// Mirror of popoverFixedStyle for the left-hand history drawer: opens rightward
// (toward the centre) from the anchored row, flipping to grow upward when the
// row sits in the lower half so it stays on-screen.
function songPopoverFixedStyle(rect: DOMRect): CSSProperties {
    const GAP = 8;
    const inLowerHalf = rect.top > window.innerHeight / 2;
    return {
        position: "fixed",
        left: rect.right + GAP,
        right: "auto",
        margin: 0,
        ...(inLowerHalf
            ? { bottom: window.innerHeight - rect.bottom }
            : { top: rect.top }),
    };
}

function Scoreboard({
    scoreboard,
    gameType,
    selfID,
    accessToken,
    instanceId,
    profileCache,
    profileRefreshNonce,
    t,
}: {
    scoreboard: ActivityScoreboardSnapshot;
    gameType: string | null;
    selfID: string | null;
    accessToken: string | null;
    instanceId: string | null;
    profileCache: ProfileCache;
    profileRefreshNonce: number;
    t: Translator;
}) {
    // In elimination, a player's "score" is their remaining lives; keep
    // out-of-lives players visible (so they read as eliminated) as long as
    // they're still in the channel.
    const isElimination = gameType === "elimination";
    const sorted = [...scoreboard.players]
        .filter((p) => p.score > 0 || p.inVC)
        .sort((a, b) => b.score - a.score);

    const canHover = useCanHover();
    // The row whose profile popover is currently open (hover on desktop,
    // tap on mobile). Auth is required to fetch; without it rows aren't
    // interactive.
    const [activeID, setActiveID] = useState<string | null>(null);
    // Viewport rect of the anchoring row, captured on open. On desktop the
    // popover is positioned `fixed` from this so it escapes the scoreboard
    // rail's `overflow` clipping (mobile centres the card via CSS instead).
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const closeTimer = useRef<number | null>(null);
    const canViewProfiles = accessToken !== null && instanceId !== null;

    // Keep the popover mounted through its close animation. `popoverID` latches
    // the last-open row's id so that row still renders the (now exiting)
    // popover while it fades out, after `activeID` has already cleared.
    const popover = usePresence(activeID !== null, 200);
    const lastActiveID = useRef<string | null>(activeID);
    if (activeID !== null) lastActiveID.current = activeID;
    const popoverID = popover.mounted ? lastActiveID.current : null;

    const clearCloseTimer = (): void => {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    };

    // Brief delay before closing on mouse-leave so the cursor can travel into
    // the popover without it vanishing.
    const scheduleClose = (): void => {
        clearCloseTimer();
        closeTimer.current = window.setTimeout(() => setActiveID(null), 120);
    };

    useEffect(() => () => clearCloseTimer(), []);

    if (sorted.length === 0) {
        return <p className="empty">{t("scoreboardEmptyJoinVC")}</p>;
    }

    return (
        <ol className="scoreboard">
            {sorted.map((p, i) => {
                const eliminated = isElimination && p.score === 0;
                const open = canViewProfiles && activeID === p.id;
                return (
                    <li
                        key={p.id}
                        className={[
                            scoreboard.winnerIDs.includes(p.id) ? "winner" : "",
                            p.id === selfID ? "self" : "",
                            eliminated ? "eliminated" : "",
                            canViewProfiles ? "clickable" : "",
                            open ? "profile-open" : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        onMouseEnter={
                            canViewProfiles && canHover
                                ? (e) => {
                                      clearCloseTimer();
                                      setAnchorRect(
                                          e.currentTarget.getBoundingClientRect(),
                                      );
                                      setActiveID(p.id);
                                  }
                                : undefined
                        }
                        onMouseLeave={
                            canViewProfiles && canHover
                                ? scheduleClose
                                : undefined
                        }
                    >
                        <button
                            type="button"
                            className="scoreboard-row-main"
                            disabled={!canViewProfiles}
                            aria-expanded={open}
                            onClick={
                                canViewProfiles
                                    ? (e) => {
                                          const row =
                                              e.currentTarget.closest("li");
                                          if (row) {
                                              setAnchorRect(
                                                  row.getBoundingClientRect(),
                                              );
                                          }

                                          setActiveID((cur) =>
                                              cur === p.id ? null : p.id,
                                          );
                                      }
                                    : undefined
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
                                    <span className="afk">
                                        {" "}
                                        {t("scoreboardLeft")}
                                    </span>
                                )}
                            </span>
                            {isElimination ? (
                                <span
                                    className="score lives"
                                    title={t("gameType.lives")}
                                >
                                    {eliminated ? "☠️" : `♥ ${p.score}`}
                                </span>
                            ) : (
                                <span className="score">{p.score}</span>
                            )}
                            {p.expGain > 0 && (
                                <span className="exp">
                                    {t("scoreboardExpGain", {
                                        exp: p.expGain,
                                    })}
                                </span>
                            )}
                        </button>
                        {canViewProfiles && popoverID === p.id && (
                            <div
                                className={`profile-popover${
                                    popover.visible ? " visible" : ""
                                }`}
                                style={
                                    canHover && anchorRect
                                        ? popoverFixedStyle(anchorRect)
                                        : undefined
                                }
                                onMouseEnter={
                                    canHover ? clearCloseTimer : undefined
                                }
                                onMouseLeave={
                                    canHover ? scheduleClose : undefined
                                }
                            >
                                <button
                                    type="button"
                                    className="profile-popover-close"
                                    aria-label={t("profile.close")}
                                    onClick={() => setActiveID(null)}
                                >
                                    ✕
                                </button>
                                <ProfileCard
                                    accessToken={accessToken!}
                                    instanceId={instanceId!}
                                    targetUserID={p.id}
                                    username={p.username}
                                    avatarUrl={p.avatarUrl}
                                    isSelf={p.id === selfID}
                                    cache={profileCache}
                                    refreshNonce={profileRefreshNonce}
                                    t={t}
                                />
                            </div>
                        )}
                    </li>
                );
            })}
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
    viewerWon,
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
    /** Whether the viewer won the just-ended game — triggers the confetti +
     *  celebratory styling on the winner line. */
    viewerWon: boolean;
    /** Songs played this session, used to build the end-of-game montage. */
    history: UiState["roundHistory"];
    /** Live guesses, shown in the in-round stage as they come in. */
    guesses: UiState["recentGuesses"];
    t: Translator;
}) {
    return (
        <section className="round-area">
            <CrossFade viewKey={round ? "round" : reveal ? "reveal" : "idle"}>
                {round ? (
                    <div className="round-area-body in-round">
                        {/* Full-width "stage": big countdown is the focal point,
                        with the live guess feed below — replaces the old
                        decorative listening animation that left this space
                        doing nothing while the round was most active. */}
                        <div className="stage">
                            {bookmarkSlot && (
                                <div className="stage-bookmark">
                                    {bookmarkSlot}
                                </div>
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
                                {reveal.song.artistName} (
                                {reveal.song.publishYear})
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
                                    played: reveal.songCounter
                                        .uniqueSongsPlayed,
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
                                                        g.isCorrect
                                                            ? "correct"
                                                            : ""
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
                    <div
                        className={`round-area-body idle${
                            winnerText && viewerWon ? " viewer-won" : ""
                        }`}
                    >
                        {winnerText && viewerWon && <Confetti />}
                        <div className="round-area-text">
                            {winnerText ? (
                                <p
                                    className={`session-winner${
                                        viewerWon ? " won" : ""
                                    }`}
                                >
                                    {winnerText}
                                </p>
                            ) : (
                                <p className="empty">
                                    {t("waitingForNextRound")}
                                </p>
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
                            <div
                                className="thumbnail-slot placeholder"
                                aria-hidden
                            >
                                <span className="note-float">♪</span>
                                <span className="note-float">♫</span>
                                <span className="note-float">♩</span>
                                <span className="note-main">🎵</span>
                                <span className="listening-text">
                                    waiting...
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </CrossFade>
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
    const [gameType, setGameType] = useState<ActivityGameType>("classic");
    const [lives, setLives] = useState(String(ELIMINATION_DEFAULT_LIVES));
    const [clipDuration, setClipDuration] = useState(
        String(CLIP_DEFAULT_DURATION_SEC),
    );

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

    const buildStartOptions = (): StartGameOptions => {
        const options: StartGameOptions = { gameType };
        if (gameType === "elimination") {
            const n = Math.round(Number(lives));
            options.eliminationLives =
                Number.isFinite(n) && n >= 1 && n <= ELIMINATION_MAX_LIVES
                    ? n
                    : ELIMINATION_DEFAULT_LIVES;
        } else if (gameType === "clip") {
            const n = Number(clipDuration);
            options.clipDuration =
                Number.isFinite(n) &&
                n >= CLIP_MIN_DURATION_SEC &&
                n <= CLIP_MAX_DURATION_SEC
                    ? n
                    : CLIP_DEFAULT_DURATION_SEC;
        }

        return options;
    };

    return (
        <div className="control-buttons">
            {!hasSession && (
                <div className="start-config">
                    <div className="pills start-game-types">
                        {GAME_TYPE_OPTIONS.map((gt) => (
                            <button
                                key={gt}
                                type="button"
                                className={`pill ${
                                    gameType === gt ? "on" : ""
                                }`}
                                disabled={busy !== null}
                                onClick={() => setGameType(gt)}
                            >
                                {t(`gameType.${gt}`)}
                            </button>
                        ))}
                    </div>
                    {gameType === "elimination" && (
                        <label className="start-param">
                            <span>{t("gameType.lives")}</span>
                            <input
                                type="number"
                                className="option-number"
                                min={1}
                                max={ELIMINATION_MAX_LIVES}
                                value={lives}
                                onChange={(e) => setLives(e.target.value)}
                            />
                        </label>
                    )}
                    {gameType === "clip" && (
                        <label className="start-param">
                            <span>{t("gameType.clipDuration")}</span>
                            <input
                                type="number"
                                className="option-number"
                                min={CLIP_MIN_DURATION_SEC}
                                max={CLIP_MAX_DURATION_SEC}
                                step={0.25}
                                value={clipDuration}
                                onChange={(e) =>
                                    setClipDuration(e.target.value)
                                }
                            />
                        </label>
                    )}
                    <button
                        type="button"
                        className="primary"
                        disabled={busy !== null}
                        onClick={() =>
                            run("start", () =>
                                apiStartGame(
                                    accessToken,
                                    instanceId,
                                    buildStartOptions(),
                                ),
                            )
                        }
                    >
                        {busy === "start"
                            ? t("startGameBusy")
                            : t("startGameButton")}
                    </button>
                </div>
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

// answerType values that put the Activity into multiple-choice mode (vs.
// typing / typingtypos / hidden, which use the text input).
const MC_ANSWER_TYPES: ReadonlySet<ActivityAnswerType> =
    new Set<ActivityAnswerType>(["easy", "medium", "hard"]);

function MultipleChoiceInput({
    accessToken,
    instanceId,
    choices,
    roundKey,
    enabled,
    t,
}: {
    accessToken: string;
    instanceId: string;
    choices: ActivityMultipleChoiceOption[];
    /** Identity of the round at render time; resets the lock when it changes. */
    roundKey: number | null;
    enabled: boolean;
    t: Translator;
}) {
    // Which choice the user committed to this round (locks the grid). null
    // until they pick; reset on a new round.
    const [picked, setPicked] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    const prevRoundRef = useRef(roundKey);
    useEffect(() => {
        if (prevRoundRef.current !== roundKey) {
            setPicked(null);
            setBusy(false);
            setFeedback(null);
            prevRoundRef.current = roundKey;
        }
    }, [roundKey]);

    const onPick = async (choiceID: string) => {
        if (!enabled || busy || picked !== null) return;
        setBusy(true);
        setPicked(choiceID);
        setFeedback(null);
        try {
            const result = await submitMcGuess(
                accessToken,
                instanceId,
                choiceID,
            );

            // Keep the grid locked on an accepted pick (ok) — correct or wrong,
            // you get one pick per round. On rejection (rate limit, not in VC,
            // etc.) the pick never landed, so unlock to allow a retry.
            if (!result.ok) {
                setFeedback(rejectReasonText(t, result.reason));
                setPicked(null);
            }
        } catch (err) {
            setFeedback(err instanceof Error ? err.message : t("networkError"));
            setPicked(null);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mc-input">
            {choices.length === 0 ? (
                <span className="mc-waiting">
                    {t("guessPlaceholderWaiting")}
                </span>
            ) : (
                <div className="mc-choices">
                    {choices.map((choice) => (
                        <button
                            key={choice.id}
                            type="button"
                            className={
                                picked === choice.id
                                    ? "mc-choice picked"
                                    : "mc-choice"
                            }
                            disabled={!enabled || picked !== null}
                            onClick={() => onPick(choice.id)}
                        >
                            {choice.label}
                        </button>
                    ))}
                </div>
            )}
            {feedback && <span className="guess-feedback">{feedback}</span>}
        </div>
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

/** Whether the viewer is among the (possibly tied) winners — drives the
 *  end-of-game celebration. */
function didViewerWin(
    scoreboard: ActivityScoreboardSnapshot | null,
    viewerUserID: string | null,
): boolean {
    if (!scoreboard || viewerUserID === null || scoreboard.highestScore === 0) {
        return false;
    }

    return scoreboard.winnerIDs.includes(viewerUserID);
}

// A short, purely-decorative confetti shower for the win celebration. Pieces
// are a fixed set (deterministic so renders are stable) with staggered delays
// and varied colors/positions; the fall + fade is CSS-driven (see `.confetti`).
const CONFETTI_PIECES = Array.from({ length: 16 }, (_, i) => ({
    left: (i * 100) / 16 + (i % 3) * 2,
    delay: (i % 6) * 0.18,
    duration: 2.4 + (i % 4) * 0.35,
    color: ["#e23b4e", "#f7b500", "#2dba75", "#4a8cff", "#b14aff"][i % 5]!,
    drift: (i % 2 === 0 ? 1 : -1) * (12 + (i % 4) * 8),
}));

function Confetti() {
    return (
        <div className="confetti" aria-hidden>
            {CONFETTI_PIECES.map((p, i) => (
                <span
                    key={i}
                    className="confetti-piece"
                    style={
                        {
                            left: `${p.left}%`,
                            background: p.color,
                            animationDelay: `${p.delay}s`,
                            animationDuration: `${p.duration}s`,
                            "--drift": `${p.drift}px`,
                        } as React.CSSProperties
                    }
                />
            ))}
        </div>
    );
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
// "hidden" is intentionally omitted: it's a text-channel privacy mechanism
// (don't show your typed guess to the shared channel), which the Activity
// already provides inherently — you type in your own iframe and only
// correct/incorrect is broadcast. It would be a redundant, confusing pick
// here. If a guild sets hidden via the /answer slash command, the Activity
// falls back to the normal text input (it isn't a multiple-choice type).
const ANSWER_OPTIONS: ActivityAnswerType[] = [
    "typing",
    "typingtypos",
    "easy",
    "medium",
    "hard",
];
const OST_OPTIONS: ActivityOst[] = ["include", "exclude", "exclusive"];
// `null` (rendered as the "off" pill) clears any active audio modifier.
const SPECIAL_OPTIONS: (ActivitySpecial | null)[] = [
    null,
    "reverse",
    "slow",
    "fast",
    "faster",
    "lowpitch",
    "highpitch",
    "nightcore",
];

// Game types selectable from the Activity start screen. Mirrors the server's
// ACTIVITY_GAME_TYPES (teams/competition excluded). Bounds mirror src/constants.
const GAME_TYPE_OPTIONS: ActivityGameType[] = [
    "classic",
    "suddendeath",
    "elimination",
    "clip",
];
const ELIMINATION_DEFAULT_LIVES = 10;
const ELIMINATION_MAX_LIVES = 10000;
const CLIP_DEFAULT_DURATION_SEC = 1;
const CLIP_MIN_DURATION_SEC = 0.25;
const CLIP_MAX_DURATION_SEC = 5;

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
    // Tap/click toggles an inline help line. The native `title` tooltip only
    // appears on desktop hover (touch devices never fire it), so the visible
    // bubble is what makes the help reachable on mobile. Expanding inline
    // (rather than an absolutely-positioned popover) keeps it on-screen in the
    // narrow options grid without risking overflow / a horizontal scrollbar.
    const [open, setOpen] = useState(false);

    return (
        <>
            <div className="option-label">
                <span>{label}</span>
                {help && (
                    <button
                        type="button"
                        className="option-info"
                        aria-label={help}
                        aria-expanded={open}
                        title={help}
                        onClick={(e) => {
                            e.preventDefault();
                            setOpen((o) => !o);
                        }}
                    >
                        ?
                    </button>
                )}
            </div>
            {help && open && <p className="option-help-text">{help}</p>}
        </>
    );
}

/** One option in the grid: a label (+ help) over its pill controls. The
 *  .options-group wrapper makes it a single grid cell in the options panel. */
function PillField({
    label,
    help,
    note,
    children,
}: {
    label: string;
    help: string;
    /** Shown under the pills when the option is overridden by another (e.g.
     *  "managed by groups"); the pills themselves are disabled by the caller. */
    note?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="options-group">
            <OptionLabel label={label} help={help} />
            <div className="pills">{children}</div>
            {note && <p className="option-managed-note">{note}</p>}
        </div>
    );
}

/** A collapsible group of related options inside the panel. Headers reuse the
 *  panel toggle's look; the body is itself an .options-panel grid so the
 *  existing field layout (grid cells, wide spans) carries over unchanged. */
function OptionsCategory({
    id,
    label,
    open,
    onToggle,
    children,
}: {
    id: string;
    label: string;
    open: boolean;
    onToggle: (id: string) => void;
    children: React.ReactNode;
}) {
    return (
        <div className="options-category">
            <button
                type="button"
                className={`options-subtoggle ${open ? "open" : ""}`}
                onClick={() => onToggle(id)}
                aria-expanded={open}
            >
                <span>{label}</span>
                <span className="options-chevron">▾</span>
            </button>
            <div className={`collapse${open ? " open" : ""}`}>
                <div className="collapse-inner">
                    <div className="options-panel">{children}</div>
                </div>
            </div>
        </div>
    );
}

// Mirrors PRESET_NAME_MAX_LENGTH in src/commands/game_commands/preset.ts; the
// server rejects longer names, so cap the input to match.
const PRESET_NAME_MAX_LENGTH = 25;

const PRESET_REJECT_KEYS: Record<string, string> = {
    no_name: "options.preset.errors.noName",
    name_too_long: "options.preset.errors.nameTooLong",
    illegal_prefix: "options.preset.errors.illegalPrefix",
    too_many: "options.preset.errors.tooMany",
    exists: "options.preset.errors.exists",
    not_found: "options.preset.errors.notFound",
};

function presetRejectText(t: Translator, reason: string): string {
    const key = PRESET_REJECT_KEYS[reason];
    return key ? t(key) : t("options.preset.errors.generic");
}

/** Save / load / delete game-option presets from within the panel. Keeps its
 *  own preset list (seeded from the server on mount, refreshed on every
 *  action). Loading a preset refreshes the rest of the panel via the normal
 *  optionsChanged broadcast, so this component doesn't touch `options`. */
function PresetManager({
    accessToken,
    instanceId,
    t,
}: {
    accessToken: string;
    instanceId: string;
    t: Translator;
}) {
    const [presets, setPresets] = useState<string[]>([]);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    // Two-click confirm for delete; holds the name being confirmed.
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const r = await apiPreset(accessToken, instanceId, "list");
            if (!cancelled && r.ok) setPresets(r.presets);
        })();
        return () => {
            cancelled = true;
        };
    }, [accessToken, instanceId]);

    const run = async (
        action: "save" | "load" | "delete",
        presetName: string,
    ): Promise<void> => {
        setBusy(true);
        setFeedback(null);
        try {
            const r = await apiPreset(
                accessToken,
                instanceId,
                action,
                presetName,
            );
            if (r.ok) {
                setPresets(r.presets);
                if (action === "save") setName("");
            } else {
                setFeedback(presetRejectText(t, r.reason));
            }
        } catch (e) {
            setFeedback(e instanceof Error ? e.message : t("networkError"));
        } finally {
            setBusy(false);
            setConfirmDelete(null);
        }
    };

    return (
        <div className="options-group options-group-wide preset-manager">
            <OptionLabel
                label={t("options.preset.label")}
                help={t("options.help.preset")}
            />
            {presets.length === 0 ? (
                <p className="preset-empty">{t("options.preset.empty")}</p>
            ) : (
                <ul className="preset-list">
                    {presets.map((p) => (
                        <li key={p} className="preset-item">
                            <span className="preset-name">{p}</span>
                            <div className="preset-actions">
                                <button
                                    type="button"
                                    className="pill"
                                    disabled={busy}
                                    onClick={() => void run("load", p)}
                                >
                                    {t("options.preset.load")}
                                </button>
                                <button
                                    type="button"
                                    className={`pill${
                                        confirmDelete === p ? " on" : ""
                                    }`}
                                    disabled={busy}
                                    onClick={() => {
                                        if (confirmDelete === p) {
                                            void run("delete", p);
                                        } else {
                                            setConfirmDelete(p);
                                        }
                                    }}
                                    onBlur={() => setConfirmDelete(null)}
                                >
                                    {confirmDelete === p
                                        ? t("options.preset.confirmDelete")
                                        : t("options.preset.delete")}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <div className="preset-save">
                <input
                    type="text"
                    className="option-number"
                    value={name}
                    maxLength={PRESET_NAME_MAX_LENGTH}
                    placeholder={t("options.preset.namePlaceholder")}
                    onChange={(e) => setName(e.target.value)}
                />
                <button
                    type="button"
                    className="pill"
                    disabled={busy || !name.trim()}
                    onClick={() => void run("save", name.trim())}
                >
                    {t("options.preset.save")}
                </button>
            </div>
            {feedback && <p className="preset-feedback">{feedback}</p>}
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
    // Two-click confirm for the destructive "reset all" action; the first
    // click arms it, the second performs it. Reset clears it.
    const [resetArmed, setResetArmed] = useState(false);
    const [resetBusy, setResetBusy] = useState(false);
    // Which option categories are expanded. All collapsed by default so the
    // panel opens compact; users expand the group they want.
    const [openCategories, setOpenCategories] = useState<Set<string>>(
        () => new Set(),
    );
    const toggleCategory = (id: string): void => {
        setOpenCategories((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    };

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

    // Playlist is async (resolve + match server-side) and the server decides
    // the matched-song count, so it isn't optimistic: we await the POST, then
    // let the optionsChanged broadcast refresh `options.playlist`/`limitEnd`.
    const [playlistInput, setPlaylistInput] = useState("");
    const [playlistBusy, setPlaylistBusy] = useState(false);
    const playlistActive = options.playlist !== null;

    const submitPlaylist = async (): Promise<void> => {
        const url = playlistInput.trim();
        if (!url || playlistBusy) return;
        setPlaylistBusy(true);
        setFeedback(null);
        try {
            const result = await apiSetOption(accessToken, instanceId, {
                kind: "playlist",
                playlistURL: url,
            });
            if (result.ok) {
                setPlaylistInput("");
            } else {
                setFeedback(rejectReasonText(t, result.reason));
            }
        } catch (e) {
            setFeedback(e instanceof Error ? e.message : t("networkError"));
        } finally {
            setPlaylistBusy(false);
        }
    };

    const clearPlaylist = async (): Promise<void> => {
        if (playlistBusy) return;
        setPlaylistBusy(true);
        setFeedback(null);
        try {
            const result = await apiSetOption(accessToken, instanceId, {
                kind: "playlist",
                playlistURL: null,
            });
            if (!result.ok) setFeedback(rejectReasonText(t, result.reason));
        } catch (e) {
            setFeedback(e instanceof Error ? e.message : t("networkError"));
        } finally {
            setPlaylistBusy(false);
        }
    };

    // Reset isn't optimistic: it changes every option at once, so rather than
    // synthesize the default snapshot client-side we await the request and let
    // the optionsChanged broadcast refresh the panel.
    const resetAll = async (): Promise<void> => {
        if (!resetArmed) {
            setResetArmed(true);
            return;
        }

        setResetArmed(false);
        setResetBusy(true);
        setFeedback(null);
        try {
            const result = await apiSetOption(accessToken, instanceId, {
                kind: "reset",
            });
            if (!result.ok) {
                setFeedback(rejectReasonText(t, result.reason));
            }
        } catch (e) {
            setFeedback(e instanceof Error ? e.message : t("networkError"));
        } finally {
            setResetBusy(false);
        }
    };

    const isAlternating = options.gender[0] === "alternating";

    // When groups are set the bot filters strictly by those groups and ignores
    // gender / artist type / includes / excludes — the slash commands reject
    // changing them in this state. Mirror that by disabling the conflicting
    // controls and noting they're managed by groups. Subunits still applies
    // (it controls whether the chosen groups' subunits are included), and
    // "alternating" gender is still valid with 2+ groups, so leave those.
    const groupCount = options.groups?.length ?? 0;
    const groupsActive = groupCount > 0;
    const managedNote = groupsActive ? t("options.managedByGroups") : undefined;

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

    const pickAnswer = (answer: ActivityAnswerType): void => {
        if (answer === options.answerType) return;
        void submit(
            { kind: "answer", answer },
            { ...options, answerType: answer },
        );
    };

    const pickOst = (ost: ActivityOst): void => {
        if (ost === options.ost) return;
        void submit({ kind: "ost", ost }, { ...options, ost });
    };

    const pickSpecial = (special: ActivitySpecial | null): void => {
        if (special === options.special) return;
        void submit({ kind: "special", special }, { ...options, special });
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
        <div className="options-accordion">
            <OptionsCategory
                id="artists"
                label={t("options.category.artists")}
                open={openCategories.has("artists")}
                onToggle={toggleCategory}
            >
                <fieldset
                    className="options-override"
                    disabled={playlistActive}
                >
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
                        disabled={groupsActive}
                        note={managedNote}
                    />

                    <ArtistListGroup
                        label={t("options.excludes")}
                        help={t("options.help.excludes")}
                        accessToken={accessToken}
                        artists={options.excludes ?? []}
                        onCommit={(next) => submitArtistList("excludes", next)}
                        disabled={groupsActive}
                        note={managedNote}
                    />

                    <PillField
                        label={t("options.gender")}
                        help={t("options.help.gender")}
                        note={managedNote}
                    >
                        {GENDER_OPTIONS.map((g) => {
                            const active =
                                !isAlternating && options.gender.includes(g);

                            return (
                                <button
                                    key={g}
                                    type="button"
                                    className={`pill ${active ? "on" : ""}`}
                                    disabled={groupsActive}
                                    onClick={() => toggleGender(g)}
                                >
                                    {t(`options.${g}`)}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            className={`pill ${isAlternating ? "on" : ""}`}
                            disabled={groupsActive && groupCount === 1}
                            onClick={toggleAlternating}
                        >
                            {t("options.alternating")}
                        </button>
                    </PillField>

                    <PillField
                        label={t("options.artisttype")}
                        help={t("options.help.artisttype")}
                        note={managedNote}
                    >
                        {ARTIST_TYPE_OPTIONS.map((a) => (
                            <button
                                key={a}
                                type="button"
                                className={`pill ${
                                    options.artisttype === a ? "on" : ""
                                }`}
                                disabled={groupsActive}
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
                </fieldset>
            </OptionsCategory>

            <OptionsCategory
                id="songs"
                label={t("options.category.songs")}
                open={openCategories.has("songs")}
                onToggle={toggleCategory}
            >
                <div className="options-group options-group-wide options-playlist">
                    <OptionLabel
                        label={t("options.playlist.label")}
                        help={t("options.help.playlist")}
                    />
                    {playlistActive ? (
                        <div className="playlist-active">
                            <span className="playlist-active-count">
                                {t("options.playlist.active", {
                                    count: String(options.limitEnd),
                                })}
                            </span>
                            <button
                                type="button"
                                className="pill"
                                disabled={playlistBusy}
                                onClick={() => void clearPlaylist()}
                            >
                                {t("options.playlist.clear")}
                            </button>
                        </div>
                    ) : (
                        <div className="playlist-input-row">
                            <input
                                type="url"
                                inputMode="url"
                                className="playlist-url-input"
                                placeholder={t(
                                    "options.playlist.urlPlaceholder",
                                )}
                                value={playlistInput}
                                disabled={playlistBusy}
                                onChange={(e) =>
                                    setPlaylistInput(e.target.value)
                                }
                                onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                        void submitPlaylist();
                                }}
                            />
                            <button
                                type="button"
                                className="pill"
                                disabled={
                                    playlistBusy || playlistInput.trim() === ""
                                }
                                onClick={() => void submitPlaylist()}
                            >
                                {playlistBusy
                                    ? t("options.playlist.matching")
                                    : t("options.playlist.set")}
                            </button>
                        </div>
                    )}
                </div>

                {playlistActive && (
                    <p className="options-group-wide options-playlist-note">
                        {t("options.playlist.managed")}
                    </p>
                )}

                <fieldset
                    className="options-override"
                    disabled={playlistActive}
                >
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
                        label={t("options.ost")}
                        help={t("options.help.ost")}
                    >
                        {OST_OPTIONS.map((o) => (
                            <button
                                key={o}
                                type="button"
                                className={`pill ${options.ost === o ? "on" : ""}`}
                                onClick={() => pickOst(o)}
                            >
                                {t(`options.${o}`)}
                            </button>
                        ))}
                    </PillField>
                </fieldset>
            </OptionsCategory>

            <OptionsCategory
                id="gameplay"
                label={t("options.category.gameplay")}
                open={openCategories.has("gameplay")}
                onToggle={toggleCategory}
            >
                <PillField
                    label={t("options.answer")}
                    help={t("options.help.answer")}
                >
                    {ANSWER_OPTIONS.map((a) => (
                        <button
                            key={a}
                            type="button"
                            className={`pill ${
                                options.answerType === a ? "on" : ""
                            }`}
                            onClick={() => pickAnswer(a)}
                        >
                            {t(`options.${a}`)}
                        </button>
                    ))}
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
            </OptionsCategory>

            <OptionsCategory
                id="playback"
                label={t("options.category.playback")}
                open={openCategories.has("playback")}
                onToggle={toggleCategory}
            >
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

                <PillField
                    label={t("options.seek")}
                    help={t("options.help.seek")}
                >
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

                <fieldset
                    className="options-override"
                    disabled={playlistActive}
                >
                    <PillField
                        label={t("options.special")}
                        help={t("options.help.special")}
                    >
                        {SPECIAL_OPTIONS.map((s) => (
                            <button
                                key={s ?? "off"}
                                type="button"
                                className={`pill ${options.special === s ? "on" : ""}`}
                                onClick={() => pickSpecial(s)}
                            >
                                {s === null
                                    ? t("options.off")
                                    : t(`options.special_${s}`)}
                            </button>
                        ))}
                    </PillField>
                </fieldset>
            </OptionsCategory>

            <OptionsCategory
                id="presets"
                label={t("options.category.presets")}
                open={openCategories.has("presets")}
                onToggle={toggleCategory}
            >
                <PresetManager
                    accessToken={accessToken}
                    instanceId={instanceId}
                    t={t}
                />
            </OptionsCategory>

            {/* Kept outside the accordion so the reset stays visible even when
                every category is collapsed. */}
            <div className="options-reset">
                <button
                    type="button"
                    className={`options-reset-button${
                        resetArmed ? " armed" : ""
                    }`}
                    disabled={resetBusy}
                    onClick={() => void resetAll()}
                    onBlur={() => setResetArmed(false)}
                >
                    {resetArmed
                        ? t("options.resetConfirm")
                        : t("options.resetAll")}
                </button>
            </div>

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
    disabled,
    note,
}: {
    label: string;
    help?: string;
    accessToken: string;
    artists: ActivityArtist[];
    onCommit: (next: ActivityArtist[]) => void;
    /** Overridden by another option (e.g. groups); disables editing. */
    disabled?: boolean;
    note?: string;
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
                            disabled={disabled}
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
                    disabled={disabled}
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
            {note && <p className="option-managed-note">{note}</p>}
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

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// The body of the song-info card: the lookup metadata laid out once `info` has
// resolved. Shared by the history-row popover and the search modal's detail
// view. Mirrors what the `/lookup` slash command shows in chat.
function SongInfoCardBody({
    info,
    t,
}: {
    info: ActivitySongInfo;
    t: Translator;
}): React.JSX.Element {
    const releaseDate = (() => {
        const d = new Date(info.publishDate);
        return Number.isNaN(d.getTime())
            ? null
            : d.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
              });
    })();

    const guessRate = info.guessStats
        ? (
              (100 * info.guessStats.correctGuesses) /
              info.guessStats.roundsPlayed
          ).toFixed(1)
        : null;

    return (
        <div className="song-info-body">
            <div className="song-info-head">
                <RevealThumbnail
                    className="song-info-thumb"
                    thumbnailUrl={info.thumbnailUrl}
                    alt=""
                />
                <div className="song-info-title">
                    <span className="song-info-song">
                        {info.songName}
                        {info.tags}
                    </span>
                    <span className="song-info-artist">{info.artistName}</span>
                    <span
                        className={`song-info-badge ${
                            info.inKMQ ? "in-kmq" : "not-in-kmq"
                        }`}
                    >
                        {info.inKMQ
                            ? t("songInfo.inKMQ")
                            : t("songInfo.notInKMQ")}
                    </span>
                </div>
            </div>

            <dl className="song-info-stats">
                <div>
                    <dt>{t("songInfo.views")}</dt>
                    <dd>{formatProfileNumber(info.views)}</dd>
                </div>
                {releaseDate && (
                    <div>
                        <dt>{t("songInfo.releaseDate")}</dt>
                        <dd>{releaseDate}</dd>
                    </div>
                )}
                {info.durationSeconds != null && (
                    <div>
                        <dt>{t("songInfo.duration")}</dt>
                        <dd>{formatDuration(info.durationSeconds)}</dd>
                    </div>
                )}
                {guessRate != null && info.guessStats && (
                    <div>
                        <dt>{t("songInfo.guessRate")}</dt>
                        <dd>
                            {t("songInfo.guessRateValue", {
                                rate: guessRate,
                                correct: info.guessStats.correctGuesses,
                                total: info.guessStats.roundsPlayed,
                            })}
                        </dd>
                    </div>
                )}
                {info.includedInOptions != null && (
                    <div>
                        <dt>{t("songInfo.inOptions")}</dt>
                        <dd>
                            {info.includedInOptions
                                ? t("songInfo.yes")
                                : t("songInfo.no")}
                        </dd>
                    </div>
                )}
            </dl>

            {info.songAliases.length > 0 && (
                <p className="song-info-aliases">
                    <span className="song-info-aliases-label">
                        {t("songInfo.songAliases")}
                    </span>{" "}
                    {info.songAliases.join(", ")}
                </p>
            )}
            {info.artistAliases.length > 0 && (
                <p className="song-info-aliases">
                    <span className="song-info-aliases-label">
                        {t("songInfo.artistAliases")}
                    </span>{" "}
                    {info.artistAliases.join(", ")}
                </p>
            )}

            <div className="song-info-links">
                <button
                    type="button"
                    className="song-info-link"
                    onClick={() =>
                        openExternalUrl(
                            `${YOUTUBE_WATCH_URL_PREFIX}${info.youtubeLink}`,
                        )
                    }
                >
                    {t("openOnYouTube")}
                </button>
                <button
                    type="button"
                    className="song-info-link"
                    onClick={() => openExternalUrl(info.soridataLink)}
                >
                    {t("songInfo.viewOnSoridata")}
                </button>
            </div>
        </div>
    );
}

// Fetches (or reads from the shared session cache) and renders the song-info
// card for one YouTube link. Mirrors ProfileCard's cache-then-refetch flow:
// shows cached data instantly and only refetches when the refresh nonce moves.
function SongInfoCard({
    accessToken,
    instanceId,
    youtubeLink,
    cache,
    refreshNonce,
    t,
}: {
    accessToken: string;
    instanceId: string;
    youtubeLink: string;
    cache: SongInfoCache;
    refreshNonce: number;
    t: Translator;
}): React.JSX.Element {
    const cached = cache.get(youtubeLink);
    const [resp, setResp] = useState<ActivitySongInfoResponse | null>(
        cached?.resp ?? null,
    );
    const [loading, setLoading] = useState(!cached);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const entry = cache.get(youtubeLink);
        const fresh = entry && entry.nonce === refreshNonce;

        if (entry) {
            setResp(entry.resp);
            setLoading(false);
        }

        if (fresh) return;

        setLoading(!entry);
        setErrored(false);
        void (async () => {
            const result = await fetchSongInfo(
                accessToken,
                instanceId,
                youtubeLink,
            );
            if (cancelled) return;
            if (!result) {
                setErrored(true);
                setLoading(false);
                return;
            }

            cache.set(youtubeLink, { resp: result, nonce: refreshNonce });
            setResp(result);
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, [accessToken, instanceId, youtubeLink, refreshNonce, cache]);

    return (
        <div className="song-info-card">
            {loading ? (
                <p className="song-info-status">{t("songInfo.loading")}</p>
            ) : errored ? (
                <p className="song-info-status">{t("songInfo.loadError")}</p>
            ) : resp && resp.found && resp.info ? (
                <SongInfoCardBody info={resp.info} t={t} />
            ) : (
                <p className="song-info-status">{t("songInfo.notFound")}</p>
            )}
        </div>
    );
}

// Wraps a trigger element (a history row's text) with the same hover/tap
// popover machinery as the scoreboard profile cards: desktop opens on hover
// and the popover is positioned `fixed` to escape the drawer's overflow
// clipping; mobile toggles on tap and CSS centres the card.
function SongInfoTrigger({
    youtubeLink,
    accessToken,
    instanceId,
    cache,
    refreshNonce,
    t,
    children,
}: {
    youtubeLink: string;
    accessToken: string;
    instanceId: string;
    cache: SongInfoCache;
    refreshNonce: number;
    t: Translator;
    children: React.ReactNode;
}): React.JSX.Element {
    const canHover = useCanHover();
    const [open, setOpen] = useState(false);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const closeTimer = useRef<number | null>(null);
    const popover = usePresence(open, 200);

    const clearCloseTimer = (): void => {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    };

    const scheduleClose = (): void => {
        clearCloseTimer();
        closeTimer.current = window.setTimeout(() => setOpen(false), 120);
    };

    useEffect(() => () => clearCloseTimer(), []);

    return (
        <div
            className="song-info-anchor"
            onMouseEnter={
                canHover
                    ? (e) => {
                          clearCloseTimer();
                          setAnchorRect(
                              e.currentTarget.getBoundingClientRect(),
                          );
                          setOpen(true);
                      }
                    : undefined
            }
            onMouseLeave={canHover ? scheduleClose : undefined}
        >
            <button
                type="button"
                className="song-info-trigger"
                aria-expanded={open}
                onClick={(e) => {
                    const anchor = e.currentTarget.closest(".song-info-anchor");
                    if (anchor) {
                        setAnchorRect(anchor.getBoundingClientRect());
                    }

                    setOpen((cur) => !cur);
                }}
            >
                {children}
            </button>
            {popover.mounted &&
                // Portal to <body>: the history drawer sets `transform` (for its
                // slide-in) which makes it the containing block for our
                // `position: fixed` popover, so it'd otherwise be clipped by the
                // drawer's `overflow`. Portaling escapes the transformed ancestor.
                createPortal(
                    <div
                        className={`song-info-popover${
                            popover.visible ? " visible" : ""
                        }`}
                        style={
                            canHover && anchorRect
                                ? songPopoverFixedStyle(anchorRect)
                                : undefined
                        }
                        onMouseEnter={canHover ? clearCloseTimer : undefined}
                        onMouseLeave={canHover ? scheduleClose : undefined}
                    >
                        <button
                            type="button"
                            className="song-info-popover-close"
                            aria-label={t("songInfo.close")}
                            onClick={() => setOpen(false)}
                        >
                            ✕
                        </button>
                        <SongInfoCard
                            accessToken={accessToken}
                            instanceId={instanceId}
                            youtubeLink={youtubeLink}
                            cache={cache}
                            refreshNonce={refreshNonce}
                            t={t}
                        />
                    </div>,
                    document.body,
                )}
        </div>
    );
}

// Header "look up a song" modal: a debounced name search over the whole
// catalog (not just played songs). Picking a result swaps to the shared
// SongInfoCard detail view, with a back link to the results.
function SongSearchModal({
    accessToken,
    instanceId,
    locale,
    cache,
    refreshNonce,
    visible,
    onClose,
    t,
}: {
    accessToken: string;
    instanceId: string;
    locale: string;
    cache: SongInfoCache;
    refreshNonce: number;
    visible: boolean;
    onClose: () => void;
    t: Translator;
}): React.JSX.Element {
    const [q, setQ] = useState("");
    const [results, setResults] = useState<ActivitySongSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);

    // Debounce: wait for a pause in typing before hitting the search endpoint.
    // Queries under 2 chars are treated as empty (too broad to be useful).
    useEffect(() => {
        const query = q.trim();
        if (query.length < 2) {
            setResults([]);
            setSearching(false);
            return undefined;
        }

        setSearching(true);
        let cancelled = false;
        const id = window.setTimeout(() => {
            void (async () => {
                const res = await searchSongs(accessToken, query, locale);
                if (!cancelled) {
                    setResults(res);
                    setSearching(false);
                }
            })();
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(id);
        };
    }, [q, accessToken, locale]);

    return (
        <div
            className={`song-search-overlay${visible ? " visible" : ""}`}
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className={`song-search-modal${visible ? " visible" : ""}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="song-search-head">
                    <span className="song-search-title">
                        {t("search.title")}
                    </span>
                    <button
                        type="button"
                        className="song-search-close"
                        aria-label={t("songInfo.close")}
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>

                {selected ? (
                    <div className="song-search-detail">
                        <button
                            type="button"
                            className="song-search-back"
                            onClick={() => setSelected(null)}
                        >
                            ← {t("search.back")}
                        </button>
                        <SongInfoCard
                            accessToken={accessToken}
                            instanceId={instanceId}
                            youtubeLink={selected}
                            cache={cache}
                            refreshNonce={refreshNonce}
                            t={t}
                        />
                    </div>
                ) : (
                    <>
                        <input
                            type="text"
                            className="song-search-input"
                            value={q}
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            placeholder={t("search.placeholder")}
                            onChange={(e) => setQ(e.target.value)}
                        />
                        {searching ? (
                            <p className="song-search-status">
                                {t("search.searching")}
                            </p>
                        ) : q.trim().length < 2 ? (
                            <p className="song-search-status">
                                {t("search.hint")}
                            </p>
                        ) : results.length === 0 ? (
                            <p className="song-search-status">
                                {t("search.empty")}
                            </p>
                        ) : (
                            <ul className="song-search-results">
                                {results.map((r) => (
                                    <li key={r.youtubeLink}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelected(r.youtubeLink)
                                            }
                                        >
                                            <span className="song-search-song">
                                                {r.songName}
                                            </span>
                                            <span className="song-search-artist">
                                                {r.artistName} ({r.publishYear})
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function SongHistory({
    history,
    bookmarkedLinks,
    auth,
    active,
    onBookmarked,
    songInfoCache,
    songInfoRefreshNonce,
    t,
}: {
    history: UiState["roundHistory"];
    bookmarkedLinks: Set<string>;
    /** Auth context for bookmarking + song lookup from the list; null before
     *  auth resolves (rows are plain text, no popover, then). */
    auth: { accessToken: string; instanceId: string } | null;
    /** Whether a game is currently in progress. Bookmarking is only meaningful
     *  during an active game, so the per-row stars are hidden otherwise. */
    active: boolean;
    onBookmarked: (link: string) => void;
    songInfoCache: SongInfoCache;
    songInfoRefreshNonce: number;
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
                const rowText = (
                    <>
                        <div className="history-song">{song.songName}</div>
                        <div className="history-artist">
                            {song.artistName} ({song.publishYear})
                        </div>
                    </>
                );
                return (
                    <li key={`${roundNum}-${song.youtubeLink}`}>
                        <span className="history-round">#{roundNum}</span>
                        {auth ? (
                            <SongInfoTrigger
                                youtubeLink={song.youtubeLink}
                                accessToken={auth.accessToken}
                                instanceId={auth.instanceId}
                                cache={songInfoCache}
                                refreshNonce={songInfoRefreshNonce}
                                t={t}
                            >
                                {rowText}
                            </SongInfoTrigger>
                        ) : (
                            <div className="history-text">{rowText}</div>
                        )}
                        {auth && active && (
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
            {/* Newest first so the just-submitted guess is always on the top
                row — the feed slot is a fixed two-row height and older guesses
                past it clip out of view. */}
            {guesses
                .slice(-RECENT_GUESS_DISPLAY_LIMIT)
                .reverse()
                .map((g) => (
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
    // Profile cards. The cache is shared across every card for the session so
    // re-opening a player is free; the nonce is bumped on round/session end to
    // invalidate open cards (newly-earned EXP, level-ups).
    const profileCacheRef = useRef<ProfileCache>(new Map());
    const [profileRefreshNonce, setProfileRefreshNonce] = useState(0);
    // Song-info cards (history popover + search modal). Shared cache for the
    // session; nonce invalidates open cards when the fields that drift —
    // guess rate and "in current options" — could have changed.
    const songInfoCacheRef = useRef<SongInfoCache>(new Map());
    const [songInfoRefreshNonce, setSongInfoRefreshNonce] = useState(0);
    const [myProfileOpen, setMyProfileOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    // Resolved bundle locale (KMQ LocaleType tag) — passed to song search so
    // returned names match the UI language.
    const [localeTag, setLocaleTag] = useState("en");
    // Mount-through-close presence for the overlays so they animate out, not
    // just in. (The `&& authState/ui.options` guards live at the render site.)
    const myProfile = usePresence(myProfileOpen, 200);
    const optionsPanel = usePresence(optionsOpen, 220);
    const searchModal = usePresence(searchOpen, 200);

    // A finished round (roundHistory grows) or a session end can change EXP /
    // level, so invalidate open profile cards by bumping the nonce.
    useEffect(() => {
        setProfileRefreshNonce((n) => n + 1);
    }, [ui.roundHistory.length, ui.sessionEnded]);

    // A finished round changes guess stats; an options change flips which songs
    // are "in current options" — both invalidate cached song-info cards.
    useEffect(() => {
        setSongInfoRefreshNonce((n) => n + 1);
    }, [ui.roundHistory.length, ui.sessionEnded, ui.options]);

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

    // Pin the layout height to the tallest viewport we've seen and never let
    // it shrink. Discord's Android WebView can resize its window when the soft
    // keyboard opens (adjustResize, outside our control and below the CSS
    // interactive-widget hint); a plain 100vh would follow that shrink and
    // reflow the page mid keyboard-open, knocking focus off the guess input and
    // closing the keyboard (the "opens then closes, takes a few taps" bug).
    // Holding the height constant means the keyboard just overlays our content
    // and the browser scrolls the focused input into view — no reflow. Grows
    // for genuine viewport changes (orientation), ignores keyboard shrink.
    useEffect(() => {
        const apply = (): void => {
            const h = window.innerHeight;
            const current = parseFloat(
                document.documentElement.style.getPropertyValue("--app-vh"),
            );
            if (!Number.isFinite(current) || h > current) {
                document.documentElement.style.setProperty(
                    "--app-vh",
                    `${h}px`,
                );
            }
        };

        apply();
        window.addEventListener("resize", apply);
        return () => window.removeEventListener("resize", apply);
    }, []);

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
                setLocaleTag(initialBundle.locale);
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
                        if (!cancelled) {
                            setBundle(next.strings);
                            setLocaleTag(next.locale);
                        }
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

            {/* Profile toggle — left cluster, below history + theme. */}
            {authState && (
                <button
                    type="button"
                    className="sidebar-toggle left profile"
                    onClick={() => setMyProfileOpen(true)}
                    aria-label={t("profile.myProfile")}
                    title={t("profile.myProfile")}
                >
                    <span>👤</span>
                </button>
            )}

            {/* Song lookup toggle — left cluster, below profile. */}
            {authState && (
                <button
                    type="button"
                    className={`sidebar-toggle left search ${
                        searchOpen ? "active" : ""
                    }`}
                    onClick={() => setSearchOpen(true)}
                    aria-label={t("search.open")}
                    title={t("search.open")}
                >
                    <span>🔍</span>
                </button>
            )}

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
                            active={ui.session !== null && !ui.sessionEnded}
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
                            songInfoCache={songInfoCacheRef.current}
                            songInfoRefreshNonce={songInfoRefreshNonce}
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
                                {ui.session?.gameType === "elimination" &&
                                    authState &&
                                    (() => {
                                        // Surface the current player's own
                                        // remaining lives prominently in the
                                        // header for the duration of the game.
                                        const me = ui.scoreboard?.players.find(
                                            (p) => p.id === authState.userID,
                                        );
                                        if (!me) return null;
                                        const out = me.score === 0;
                                        return (
                                            <span
                                                className={`lives-badge ${
                                                    out ? "out" : ""
                                                }`}
                                                title={t("gameType.lives")}
                                            >
                                                {out ? "☠️" : `♥ ${me.score}`}
                                            </span>
                                        );
                                    })()}
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

                        {authState && searchModal.mounted && (
                            <SongSearchModal
                                accessToken={authState.accessToken}
                                instanceId={authState.instanceId}
                                locale={localeTag}
                                cache={songInfoCacheRef.current}
                                refreshNonce={songInfoRefreshNonce}
                                visible={searchModal.visible}
                                onClose={() => setSearchOpen(false)}
                                t={t}
                            />
                        )}

                        {authState && myProfile.mounted && (
                            <div
                                className={`profile-modal-overlay${
                                    myProfile.visible ? " visible" : ""
                                }`}
                                role="dialog"
                                aria-modal="true"
                                onClick={() => setMyProfileOpen(false)}
                            >
                                <div
                                    className={`profile-modal${
                                        myProfile.visible ? " visible" : ""
                                    }`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        type="button"
                                        className="profile-modal-close"
                                        aria-label={t("profile.close")}
                                        onClick={() => setMyProfileOpen(false)}
                                    >
                                        ✕
                                    </button>
                                    <ProfileCard
                                        accessToken={authState.accessToken}
                                        instanceId={authState.instanceId}
                                        targetUserID={authState.userID}
                                        username={
                                            ui.scoreboard?.players.find(
                                                (p) =>
                                                    p.id === authState.userID,
                                            )?.username ??
                                            t("profile.myProfile")
                                        }
                                        avatarUrl={
                                            ui.scoreboard?.players.find(
                                                (p) =>
                                                    p.id === authState.userID,
                                            )?.avatarUrl ?? null
                                        }
                                        isSelf
                                        cache={profileCacheRef.current}
                                        refreshNonce={profileRefreshNonce}
                                        t={t}
                                    />
                                </div>
                            </div>
                        )}

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
                            viewerWon={
                                ui.sessionEnded &&
                                ui.hadSession &&
                                !ui.lastReveal &&
                                didViewerWin(
                                    ui.scoreboard,
                                    authState?.userID ?? null,
                                )
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

                        {authState &&
                            (ui.options &&
                            MC_ANSWER_TYPES.has(ui.options.answerType) ? (
                                <MultipleChoiceInput
                                    accessToken={authState.accessToken}
                                    instanceId={authState.instanceId}
                                    choices={ui.currentRound?.choices ?? []}
                                    roundKey={
                                        ui.currentRound?.roundIndex ?? null
                                    }
                                    enabled={
                                        ui.currentRound !== null &&
                                        !ui.sessionEnded
                                    }
                                    t={t}
                                />
                            ) : (
                                <GuessInput
                                    accessToken={authState.accessToken}
                                    instanceId={authState.instanceId}
                                    enabled={
                                        ui.currentRound !== null &&
                                        !ui.sessionEnded
                                    }
                                    t={t}
                                />
                            ))}

                        {authState && (
                            <div className="vote-row">
                                {/* Hints are disabled server-side in multiple
                                    choice mode, so hide the control rather than
                                    show a button that only errors out. */}
                                {!(
                                    ui.options &&
                                    MC_ANSWER_TYPES.has(ui.options.answerType)
                                ) && (
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
                                )}
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
                                {optionsPanel.mounted && (
                                    <div
                                        className={`collapse${
                                            optionsPanel.visible ? " open" : ""
                                        }`}
                                    >
                                        <div className="collapse-inner">
                                            <OptionsPanel
                                                accessToken={
                                                    authState.accessToken
                                                }
                                                instanceId={
                                                    authState.instanceId
                                                }
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
                                        </div>
                                    </div>
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
                            <Scoreboard
                                scoreboard={ui.scoreboard}
                                gameType={ui.session?.gameType ?? null}
                                selfID={authState?.userID ?? null}
                                accessToken={authState?.accessToken ?? null}
                                instanceId={authState?.instanceId ?? null}
                                profileCache={profileCacheRef.current}
                                profileRefreshNonce={profileRefreshNonce}
                                t={t}
                            />
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
        case "roundChoices":
            // Merge the round's MC choices into the live round. Scoped by
            // roundIndex so a late event can't apply stale choices to a newer
            // round. Fires at round start (after roundStart) and on a mid-round
            // switch to multiple choice.
            return prev.currentRound &&
                prev.currentRound.roundIndex === msg.roundIndex
                ? {
                      ...prev,
                      currentRound: {
                          ...prev.currentRound,
                          choices: msg.choices,
                      },
                  }
                : prev;
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
