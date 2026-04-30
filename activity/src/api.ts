import type { ActivityEvent, ActivitySnapshot } from "./types";

const PROXY_BASE = "/.proxy/api/activity";

export async function fetchSnapshot(
    accessToken: string,
    instanceId: string,
): Promise<ActivitySnapshot> {
    const url = `${PROXY_BASE}/session?instance_id=${encodeURIComponent(
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

export type GuessRejectReason =
    | "no_session"
    | "maintenance"
    | "banned"
    | "rate_limit"
    | "not_in_vc"
    | "internal"
    | "unauthorized"
    | "forbidden"
    | "bad_request"
    | "session_already_running"
    | "no_round"
    | "hint_unavailable"
    | "song_not_found";

export interface GuessResult {
    ok: boolean;
    reason?: GuessRejectReason;
}

async function postAction(
    accessToken: string,
    instanceId: string,
    path: "start" | "skip" | "end" | "hint",
): Promise<GuessResult> {
    const resp = await fetch(`${PROXY_BASE}/${path}`, {
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

export interface BookmarkResult {
    ok: boolean;
    reason?: GuessRejectReason;
    songName?: string;
    artistName?: string;
    youtubeLink?: string;
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
    const resp = await fetch(`${PROXY_BASE}/bookmark`, {
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
    const resp = await fetch(`${PROXY_BASE}/guess`, {
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

export interface ActivityStreamHandle {
    close: () => void;
}

/**
 * Exchanges the OAuth bearer token for a short-lived single-use ticket so the
 * token never appears in the WebSocket URL (logs, dev tools, history).
 */
async function requestWsTicket(
    accessToken: string,
    instanceId: string,
): Promise<string> {
    const resp = await fetch(`${PROXY_BASE}/ws-ticket`, {
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
    const url = `${proto}//${window.location.host}/.proxy/ws/activity?ticket=${encodeURIComponent(ticket)}`;

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
