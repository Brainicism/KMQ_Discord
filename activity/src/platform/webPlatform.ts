import type { PlatformUser } from "./index";

/**
 * Standalone-website auth: a thin client for the /api/web/* routes. The
 * server runs a standard Discord OAuth2 redirect flow and hands the SPA an
 * opaque `web_`-prefixed bearer token via a one-time login code in the
 * redirect URL; the token is then used exactly like the Activity's Discord
 * access token on every /api/activity/* call.
 */

const WEB_SESSION_STORAGE_KEY = "kmq:webSession";

export interface WebSession {
    token: string;
    user: PlatformUser;
}

/** Navigates to the server's OAuth entrypoint (full page redirect). */
export function beginLogin(): void {
    window.location.href = "/api/web/login";
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

/** Web equivalent of the SDK's live-locale lookup. */
export function readLocale(): string | null {
    return navigator.language || null;
}

/** Web equivalent of sdk.commands.openExternalLink. */
export function openExternalUrl(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
}
