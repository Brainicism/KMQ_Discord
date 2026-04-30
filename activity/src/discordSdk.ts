import { DiscordSDK } from "@discord/embedded-app-sdk";

let sdkPromise: Promise<DiscordSDK> | null = null;

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;

export function getDiscordSdk(): Promise<DiscordSDK> {
    if (sdkPromise !== null) return sdkPromise;
    if (!CLIENT_ID) {
        return Promise.reject(
            new Error("VITE_DISCORD_CLIENT_ID is not configured"),
        );
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

export async function authenticate(): Promise<AuthedSession> {
    const sdk = await getDiscordSdk();

    const { code } = await sdk.commands.authorize({
        client_id: CLIENT_ID!,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds.members.read"],
    });

    const tokenResp = await fetch("/.proxy/api/activity/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });

    if (!tokenResp.ok) {
        throw new Error(`Token exchange failed: ${tokenResp.status}`);
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
