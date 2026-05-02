import { ACTIVITY_PROXY_BASE, ACTIVITY_WS_PATH } from "./constants";
import type {
    ActivityGender,
    ActivityGuessMode,
    ActivityMultiguess,
} from "./types/activity_options_snapshot";
import type ActivityEvent from "./types/activity_event";
import type ActivitySessionResponse from "./types/activity_session_response";
import type ActivitySnapshot from "./types/activity_snapshot";
import type ActivityStreamHandle from "./types/activity_stream_handle";
import type BookmarkResult from "./types/bookmark_result";
import type GuessRejectReason from "./types/guess_reject_reason";
import type GuessResult from "./types/guess_result";

/**
 * Discriminated payload the client posts to /api/activity/option. Matches
 * the server-side schema (see src/kmq_web_server.ts::parseSetOptionBody)
 * so the server accepts exactly these shapes.
 */
export type SetOptionRequest =
    | { kind: "gender"; genders: ActivityGender[] }
    | { kind: "guessMode"; guessMode: ActivityGuessMode }
    | { kind: "multiguess"; multiguess: ActivityMultiguess }
    | { kind: "limit"; limitStart: number; limitEnd: number }
    | { kind: "cutoff"; beginningYear: number; endYear: number }
    | { kind: "goal"; goal: number | null }
    | { kind: "timer"; timer: number | null }
    | { kind: "duration"; duration: number | null }
    | { kind: "groups"; artistIDs: number[] }
    | { kind: "includes"; artistIDs: number[] }
    | { kind: "excludes"; artistIDs: number[] };

export interface AutocompleteArtist {
    id: number;
    name: string;
    hangulName: string | null;
}

/**
 * Typeahead lookup for groups / includes / excludes. Empty q returns the
 * top artists; typed prefix returns a small prefix-match result set.
 */
export async function fetchArtistAutocomplete(
    accessToken: string,
    q: string,
): Promise<AutocompleteArtist[]> {
    const url = `${ACTIVITY_PROXY_BASE}/artist-autocomplete?q=${encodeURIComponent(q)}`;
    const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return [];
    const body = (await resp.json()) as { results: AutocompleteArtist[] };
    return body.results;
}

export interface ActivityI18nBundle {
    locale: string;
    strings: Record<string, string>;
}

/**
 * Fetches the server-resolved translation bundle for the given locale. Public
 * endpoint — no auth required. Server normalizes the locale tag (BCP-47 →
 * KMQ LocaleType) and merges the English fallback in for missing keys.
 */
export async function fetchI18nBundle(
    locale: string,
): Promise<ActivityI18nBundle> {
    const url = `${ACTIVITY_PROXY_BASE}/i18n?locale=${encodeURIComponent(locale)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`i18n bundle failed: ${resp.status}`);
    }

    return resp.json();
}

export async function fetchSnapshot(
    accessToken: string,
    instanceId: string,
): Promise<ActivitySessionResponse> {
    const url = `${ACTIVITY_PROXY_BASE}/session?instance_id=${encodeURIComponent(
        instanceId,
    )}`;

    const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
        throw new Error(`Snapshot failed: ${resp.status}`);
    }

    return resp.json();
}

async function postAction(
    accessToken: string,
    instanceId: string,
    path: "start" | "skip" | "end" | "hint",
): Promise<GuessResult> {
    const resp = await fetch(`${ACTIVITY_PROXY_BASE}/${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ instance_id: instanceId }),
    });

    if (resp.ok) return { ok: true };
    if (resp.status === 401) return { ok: false, reason: "unauthorized" };
    if (resp.status === 403) return { ok: false, reason: "forbidden" };
    if (resp.status === 400) return { ok: false, reason: "bad_request" };

    let parsed: { error?: GuessRejectReason } = {};
    try {
        parsed = (await resp.json()) as { error?: GuessRejectReason };
    } catch {
        // ignore
    }

    return { ok: false, reason: parsed.error ?? "internal" };
}

export const startGame = (accessToken: string, instanceId: string) =>
    postAction(accessToken, instanceId, "start");

export const skipVote = (accessToken: string, instanceId: string) =>
    postAction(accessToken, instanceId, "skip");

export const endGame = (accessToken: string, instanceId: string) =>
    postAction(accessToken, instanceId, "end");

export const hintVote = (accessToken: string, instanceId: string) =>
    postAction(accessToken, instanceId, "hint");

/**
 * Submit a GuildPreference change. Server validates the shape and accepts
 * only the typed value matching the kind; other fields are ignored.
 */
export async function setOption(
    accessToken: string,
    instanceId: string,
    option: SetOptionRequest,
): Promise<GuessResult> {
    const resp = await fetch(`${ACTIVITY_PROXY_BASE}/option`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ instance_id: instanceId, ...option }),
    });

    if (resp.ok) return { ok: true };
    if (resp.status === 401) return { ok: false, reason: "unauthorized" };
    if (resp.status === 403) return { ok: false, reason: "forbidden" };
    if (resp.status === 400) return { ok: false, reason: "bad_request" };

    let parsed: { error?: GuessRejectReason } = {};
    try {
        parsed = (await resp.json()) as { error?: GuessRejectReason };
    } catch {
        // ignore
    }

    return { ok: false, reason: parsed.error ?? "internal" };
}

/**
 * Bookmark a song. If `youtubeLink` is omitted, the server bookmarks whatever
 * song is currently playing — used by the in-round bookmark button so the
 * iframe never sees the link before the reveal.
 */
export async function bookmarkSong(
    accessToken: string,
    instanceId: string,
    youtubeLink?: string,
): Promise<BookmarkResult> {
    const resp = await fetch(`${ACTIVITY_PROXY_BASE}/bookmark`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            instance_id: instanceId,
            youtube_link: youtubeLink,
        }),
    });

    if (resp.ok) {
        const body = (await resp.json()) as {
            songName?: string;
            artistName?: string;
            youtubeLink?: string;
        };
        return { ok: true, ...body };
    }

    if (resp.status === 401) return { ok: false, reason: "unauthorized" };
    if (resp.status === 403) return { ok: false, reason: "forbidden" };
    if (resp.status === 400) return { ok: false, reason: "bad_request" };

    let parsed: { error?: GuessRejectReason } = {};
    try {
        parsed = (await resp.json()) as { error?: GuessRejectReason };
    } catch {
        // ignore
    }

    return { ok: false, reason: parsed.error ?? "internal" };
}

export async function submitGuess(
    accessToken: string,
    instanceId: string,
    guess: string,
): Promise<GuessResult> {
    const resp = await fetch(`${ACTIVITY_PROXY_BASE}/guess`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ instance_id: instanceId, guess }),
    });

    if (resp.ok) {
        return { ok: true };
    }

    if (resp.status === 401) return { ok: false, reason: "unauthorized" };
    if (resp.status === 403) return { ok: false, reason: "forbidden" };
    if (resp.status === 400) return { ok: false, reason: "bad_request" };

    let parsed: { error?: GuessRejectReason } = {};
    try {
        parsed = (await resp.json()) as { error?: GuessRejectReason };
    } catch {
        // ignore
    }

    return { ok: false, reason: parsed.error ?? "internal" };
}

/**
 * Exchanges the OAuth bearer token for a short-lived single-use ticket so the
 * token never appears in the WebSocket URL (logs, dev tools, history).
 */
async function requestWsTicket(
    accessToken: string,
    instanceId: string,
): Promise<string> {
    const resp = await fetch(`${ACTIVITY_PROXY_BASE}/ws-ticket`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ instance_id: instanceId }),
    });

    if (!resp.ok) {
        throw new Error(`ws-ticket failed: ${resp.status}`);
    }

    const body = (await resp.json()) as { ticket: string };
    return body.ticket;
}

export async function openActivityStream(
    accessToken: string,
    instanceId: string,
    onEvent: (
        event: ActivityEvent | { type: "snapshot"; snapshot: ActivitySnapshot },
    ) => void,
    onClose: () => void,
): Promise<ActivityStreamHandle> {
    const ticket = await requestWsTicket(accessToken, instanceId);
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}${ACTIVITY_WS_PATH}?ticket=${encodeURIComponent(ticket)}`;

    const ws = new WebSocket(url);
    ws.addEventListener("message", (e) => {
        try {
            const msg = JSON.parse(e.data as string);
            onEvent(msg);
        } catch (err) {
            console.warn("Failed to parse activity WS message", err);
        }
    });

    ws.addEventListener("close", onClose);
    ws.addEventListener("error", () => onClose());

    return {
        close: () => ws.close(),
    };
}
