import { ACTIVITY_PROXY_BASE } from "./constants";
import { DiscordSDK } from "@discord/embedded-app-sdk";

let sdkPromise: Promise<DiscordSDK> | null = null;

const CLIENT_ID = import.meta.env.BOT_CLIENT_ID as string | undefined;

export function getDiscordSdk(): Promise<DiscordSDK> {
    if (sdkPromise !== null) return sdkPromise;
    if (!CLIENT_ID) {
        return Promise.reject(new Error("BOT_CLIENT_ID is not configured"));
    }

    const sdk = new DiscordSDK(CLIENT_ID);
    const next = sdk.ready().then(() => sdk);
    sdkPromise = next;
    return next;
}

export interface AuthedSession {
    sdk: DiscordSDK;
    accessToken: string;
    user: { id: string; username: string };
}

export async function openExternalUrl(url: string): Promise<void> {
    try {
        const sdk = await getDiscordSdk();
        await sdk.commands.openExternalLink({ url });
    } catch (e) {
        console.warn("openExternalLink failed; falling back to window.open", e);
        window.open(url, "_blank", "noopener,noreferrer");
    }
}

/**
 * Reads the user's current Discord client locale (e.g. "en-US"). This is the
 * live preference and supersedes the OAuth `users.@me.locale` echoed via the
 * server snapshot. Returns null if the SDK can't supply it.
 */
export async function readSdkLocale(): Promise<string | null> {
    try {
        const sdk = await getDiscordSdk();
        const result = await sdk.commands.userSettingsGetLocale();
        return result?.locale ?? null;
    } catch (e) {
        console.warn("userSettingsGetLocale failed", e);
        return null;
    }
}

/**
 * Returns the IDs of the (non-bot) users currently connected to this Activity
 * instance — i.e. who's actually in the voice channel the Activity is running
 * in. Returns null if the SDK can't supply it, in which case callers should
 * fall back to the server's own voice-channel enforcement rather than guess.
 */
export async function getConnectedParticipantIds(): Promise<string[] | null> {
    try {
        const sdk = await getDiscordSdk();
        const result = await sdk.commands.getInstanceConnectedParticipants();
        return result.participants.filter((p) => !p.bot).map((p) => p.id);
    } catch (e) {
        console.warn("getInstanceConnectedParticipants failed", e);
        return null;
    }
}

/**
 * Subscribes to live participant changes for this Activity instance, invoking
 * `cb` with the current (non-bot) participant IDs on each update. Resolves to
 * an unsubscribe function (a no-op if the subscription couldn't be set up).
 */
export async function subscribeParticipants(
    cb: (ids: string[]) => void,
): Promise<() => void> {
    try {
        const sdk = await getDiscordSdk();
        const handler = (data: {
            participants: { id: string; bot: boolean }[];
        }): void => {
            cb(data.participants.filter((p) => !p.bot).map((p) => p.id));
        };

        await sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", handler);
        return () => {
            void sdk.unsubscribe(
                "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
                handler,
            );
        };
    } catch (e) {
        console.warn("subscribeParticipants failed", e);
        return () => {
            /* no-op */
        };
    }
}

export async function authenticate(): Promise<AuthedSession> {
    const sdk = await getDiscordSdk();

    const { code } = await sdk.commands.authorize({
        client_id: CLIENT_ID!,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds.members.read"],
    });

    const tokenResp = await fetch(`${ACTIVITY_PROXY_BASE}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });

    if (!tokenResp.ok) {
        let details = "";
        try {
            const payload = (await tokenResp.json()) as {
                error?: string;
                message?: string;
                missing?: { clientId?: boolean; clientSecret?: boolean };
            };

            const parts: string[] = [];
            if (payload.error) parts.push(payload.error);
            if (payload.message) parts.push(payload.message);
            if (payload.missing?.clientId) {
                parts.push("missing client ID configuration");
            }
            if (payload.missing?.clientSecret) {
                parts.push("missing client secret configuration");
            }

            if (parts.length > 0) {
                details = ` (${parts.join("; ")})`;
            }
        } catch {
            // Response may not be JSON; keep status-only message.
        }

        throw new Error(`Token exchange failed: ${tokenResp.status}${details}`);
    }

    const { access_token } = (await tokenResp.json()) as {
        access_token: string;
    };

    const auth = await sdk.commands.authenticate({ access_token });
    if (!auth) {
        throw new Error("Discord authenticate returned no result");
    }

    return {
        sdk,
        accessToken: access_token,
        user: { id: auth.user.id, username: auth.user.username },
    };
}
