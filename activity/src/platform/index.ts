/**
 * Platform detection for the dual-target build: the same bundle runs inside
 * Discord's embedded-app iframe (the Activity) and as a standalone website.
 *
 * Discord opens the Activity iframe with a `frame_id` query param and hosts
 * it under *.discordsays.com; either signal means embedded. Detection must
 * not touch the Embedded App SDK — the web target never loads it.
 */
export function isEmbedded(): boolean {
    const { hostname } = window.location;
    if (
        hostname === "discordsays.com" ||
        hostname.endsWith(".discordsays.com")
    ) {
        return true;
    }

    return new URLSearchParams(window.location.search).has("frame_id");
}

/** Identity of the logged-in user as the platform layer knows it. */
export interface PlatformUser {
    id: string;
    username: string;
    avatarUrl?: string | null;
    /** Website guest (no Discord account) — can join rooms but not host. */
    guest?: boolean;
}
