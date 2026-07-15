import type { PlatformUser } from "./index";

/**
 * Standalone-website auth: a thin client for the /api/web/* routes. The
 * server runs a standard Discord OAuth2 redirect flow and hands the SPA an
 * opaque `web_`-prefixed bearer token via a one-time login code in the
 * redirect URL; the token is then used exactly like the Activity's Discord
 * access token on every /api/activity/* call.
 */

const WEB_SESSION_STORAGE_KEY = "kmq:webSession";
// A visitor's explicit language choice, persisted so it sticks across visits
// and survives a page reload (it also outlives localStorage-clears on logout,
// which is intentional — language is a device preference, not account state).
const LOCALE_COOKIE = "kmq_locale";
const LOCALE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 year

/**
 * The languages a visitor can pick from, in display order. Tags mirror the
 * server's LocaleType; labels are endonyms (a language name is conventionally
 * shown in its own language, so these are intentionally not translated).
 */
export const WEB_LOCALES: ReadonlyArray<{ tag: string; label: string }> = [
    { tag: "en", label: "English" },
    { tag: "es-ES", label: "Español" },
    { tag: "fr", label: "Français" },
    { tag: "de", label: "Deutsch" },
    { tag: "nl", label: "Nederlands" },
    { tag: "pt-BR", label: "Português" },
    { tag: "ru", label: "Русский" },
    { tag: "id", label: "Bahasa Indonesia" },
    { tag: "hi", label: "हिन्दी" },
    { tag: "ko", label: "한국어" },
    { tag: "ja", label: "日本語" },
    { tag: "zh-CN", label: "中文" },
];

export interface WebSession {
    token: string;
    user: PlatformUser;
}

/**
 * Navigates to the server's OAuth entrypoint (full page redirect).
 * @param next - in-site /play path to land on after login (e.g. an invite
 * link); the server validates it against open redirects
 */
export function beginLogin(next?: string): void {
    window.location.href = next
        ? `/api/web/login?next=${encodeURIComponent(next)}`
        : "/api/web/login";
}

export function getStoredSession(): WebSession | null {
    try {
        const raw = window.localStorage.getItem(WEB_SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as WebSession;
        if (!parsed?.token || !parsed?.user?.id) return null;
        return parsed;
    } catch {
        return null;
    }
}

function storeSession(session: WebSession): void {
    try {
        window.localStorage.setItem(
            WEB_SESSION_STORAGE_KEY,
            JSON.stringify(session),
        );
    } catch {
        // Storage may be unavailable (private mode); the session still works
        // for this page's lifetime.
    }
}

function clearStoredSession(): void {
    try {
        window.localStorage.removeItem(WEB_SESSION_STORAGE_KEY);
    } catch {
        // ignore
    }
}

/**
 * Exchanges the one-time `login_code` query param (present right after the
 * OAuth callback redirect) for a session token, and strips it from the URL
 * so refreshes/bookmarks don't retry a consumed code.
 * @returns the new session, or null if no code is present / it was invalid
 */
export async function completeLoginFromUrl(): Promise<WebSession | null> {
    const url = new URL(window.location.href);
    const loginCode = url.searchParams.get("login_code");
    if (!loginCode) return null;

    url.searchParams.delete("login_code");
    window.history.replaceState(null, "", url.toString());

    const resp = await fetch("/api/web/complete-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_code: loginCode }),
    });

    if (!resp.ok) return null;

    const body = (await resp.json()) as WebSession;
    if (!body?.token || !body?.user?.id) return null;

    const session: WebSession = { token: body.token, user: body.user };
    storeSession(session);
    return session;
}

/**
 * Creates a guest session (no Discord account) under a self-chosen display
 * name. Guests can join rooms via invite code/link but cannot host.
 * @param username - the display name the guest picked
 * @returns the new session, or null when guest mode is unavailable
 */
export async function guestLogin(username: string): Promise<WebSession | null> {
    let resp: Response;
    try {
        resp = await fetch("/api/web/guest-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username,
                locale: readLocale() || "",
            }),
        });
    } catch {
        return null;
    }

    if (!resp.ok) return null;

    const body = (await resp.json()) as WebSession;
    if (!body?.token || !body?.user?.id) return null;

    const session: WebSession = { token: body.token, user: body.user };
    storeSession(session);
    return session;
}

/**
 * Validates a stored token against the server (it may have expired or been
 * revoked since the last visit). Clears storage when the server rejects it.
 * @param session - the stored session to validate
 * @returns the refreshed session, or null if it is no longer valid
 */
export async function validateSession(
    session: WebSession,
): Promise<WebSession | null> {
    let resp: Response;
    try {
        resp = await fetch("/api/web/session", {
            headers: { Authorization: `Bearer ${session.token}` },
        });
    } catch {
        // Network error: keep the stored session rather than logging the
        // user out over a blip; the next API call will surface real 401s.
        return session;
    }

    if (resp.status === 401 || resp.status === 403) {
        clearStoredSession();
        return null;
    }

    if (!resp.ok) return session;

    const body = (await resp.json()) as { user: PlatformUser };
    const refreshed: WebSession = { token: session.token, user: body.user };
    storeSession(refreshed);
    return refreshed;
}

/** Invalidates the session server-side and locally. */
export async function logout(session: WebSession | null): Promise<void> {
    clearStoredSession();
    if (!session) return;
    try {
        await fetch("/api/web/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.token}` },
        });
    } catch {
        // Local logout already happened; server row expires via TTL.
    }
}

/** Reads the visitor's saved language override (the `kmq_locale` cookie). */
export function getStoredLocaleOverride(): string | null {
    const match = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));

    if (!match) return null;
    const value = decodeURIComponent(match.slice(LOCALE_COOKIE.length + 1));
    return value || null;
}

/** Persists an explicit language choice so it survives reloads and revisits. */
export function setStoredLocaleOverride(locale: string): void {
    document.cookie =
        `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; ` +
        `path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; SameSite=Lax`;
}

/**
 * Web equivalent of the SDK's live-locale lookup: an explicit language override
 * (set via the language picker) wins over the browser's own preference.
 */
export function readLocale(): string | null {
    return getStoredLocaleOverride() ?? navigator.language ?? null;
}

// ---------------------------------------------------------------------------
// Multiplayer rooms. A room's invite code doubles as the `instance_id` for
// every /api/activity/* call, so the game client works unchanged inside one.

export interface WebRoomMemberView {
    id: string;
    username: string;
    avatarUrl: string | null;
    connected: boolean;
}

export type WebRoomVisibility = "public" | "private";

export interface WebRoomView {
    code: string;
    ownerID: string;
    visibility: WebRoomVisibility;
    hasPassword: boolean;
    members: WebRoomMemberView[];
}

/** A public-lobby list entry (never includes the roster or password). */
export interface PublicRoomSummaryView {
    code: string;
    ownerUsername: string;
    memberCount: number;
    maxMembers: number;
    hasPassword: boolean;
}

export type WebRoomResult =
    | { room: WebRoomView }
    | {
          error:
              | "not_found"
              | "full"
              | "guest_limit"
              | "wrong_password"
              | "unauthorized"
              | "unavailable";
      };

async function roomRequest(
    session: WebSession,
    path: string,
    init?: RequestInit,
): Promise<WebRoomResult> {
    let resp: Response;
    try {
        resp = await fetch(path, {
            ...init,
            headers: {
                Authorization: `Bearer ${session.token}`,
                ...(init?.body ? { "Content-Type": "application/json" } : {}),
            },
        });
    } catch {
        return { error: "unavailable" };
    }

    // A locked room answers 403 with error:"wrong_password"; a real auth
    // failure is a bare 403/401.
    if (resp.status === 403) {
        const reason = await readErrorReason(resp);
        return {
            error:
                reason === "wrong_password" ? "wrong_password" : "unauthorized",
        };
    }

    if (resp.status === 401) return { error: "unauthorized" };
    if (resp.status === 404) return { error: "not_found" };
    // 409 is "full" or a guest-cap rejection; disambiguate via the body.
    if (resp.status === 409) {
        const reason = await readErrorReason(resp);
        return { error: reason === "guest_limit" ? "guest_limit" : "full" };
    }

    if (!resp.ok) return { error: "unavailable" };

    const body = (await resp.json()) as { room?: WebRoomView };
    if (!body?.room?.code) return { error: "unavailable" };
    return { room: body.room };
}

async function readErrorReason(resp: Response): Promise<string | null> {
    try {
        const body = (await resp.json()) as { error?: string };
        return body?.error ?? null;
    } catch {
        return null;
    }
}

export async function createRoom(
    session: WebSession,
    options: { visibility: WebRoomVisibility; password?: string } = {
        visibility: "private",
    },
): Promise<WebRoomResult> {
    return roomRequest(session, "/api/web/room", {
        method: "POST",
        body: JSON.stringify({
            visibility: options.visibility,
            password: options.password || null,
        }),
    });
}

export async function joinRoom(
    session: WebSession,
    code: string,
    password?: string,
): Promise<WebRoomResult> {
    return roomRequest(session, "/api/web/room/join", {
        method: "POST",
        body: JSON.stringify({ code, password: password || null }),
    });
}

/**
 * @param session - the web session
 * @returns the public lobby list, or null on any error (caller shows empty)
 */
export async function listPublicRooms(
    session: WebSession,
): Promise<PublicRoomSummaryView[] | null> {
    try {
        const resp = await fetch("/api/web/rooms", {
            headers: { Authorization: `Bearer ${session.token}` },
        });

        if (!resp.ok) return null;
        const body = (await resp.json()) as { rooms?: PublicRoomSummaryView[] };
        return body?.rooms ?? [];
    } catch {
        return null;
    }
}

/**
 * @param session - the web session
 * @param code - the room to read; null reads whatever room the server still
 * counts the user a member of (refresh/reconnect)
 * @returns the room, or why it couldn't be read
 */
export async function fetchRoom(
    session: WebSession,
    code: string | null,
): Promise<WebRoomResult> {
    return roomRequest(
        session,
        code
            ? `/api/web/room?code=${encodeURIComponent(code)}`
            : "/api/web/room",
    );
}

export async function leaveRoom(session: WebSession): Promise<void> {
    try {
        await fetch("/api/web/room/leave", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.token}` },
        });
    } catch {
        // The server sweeps abandoned seats after the disconnect grace
        // period regardless.
    }
}

/** @returns the invite path for a room code (append to the site origin) */
export function roomPath(code: string): string {
    return `/play/r/${encodeURIComponent(code)}`;
}

/**
 * @returns the room code embedded in an invite URL path (/play/r/<code>),
 * if the current location is one
 */
export function roomCodeFromLocation(): string | null {
    const match = /^\/play\/r\/([^/]+)$/.exec(window.location.pathname);
    return match ? decodeURIComponent(match[1]!) : null;
}

/** Web equivalent of sdk.commands.openExternalLink. */
export function openExternalUrl(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
}
