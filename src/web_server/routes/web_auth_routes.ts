import * as uuid from "uuid";
import {
    ACTIVITY_HTTP_TIMEOUT_MS,
    ACTIVITY_RATE_LIMIT_READ,
    ACTIVITY_RATE_LIMIT_TOKEN,
    DISCORD_OAUTH_AUTHORIZE_URL,
    DISCORD_OAUTH_TOKEN_URL,
    DISCORD_USERS_ME_URL,
    WEB_GUEST_LOGIN_IP_WINDOW_MS,
    WEB_GUEST_LOGIN_PER_IP_MAX,
    WEB_LOGIN_CODE_TTL_MS,
    WEB_OAUTH_STATE_COOKIE,
    WEB_OAUTH_STATE_TTL_MS,
    discordAvatarUrl,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    createWebSession,
    deleteWebSession,
    isGuestUserID,
    isWebSessionToken,
    mintGuestUserID,
    sanitizeGuestUsername,
} from "../../helpers/web_session_manager";
import { siteOrigin } from "../web_server_utils";
import KmqConfiguration from "../../kmq_configuration";
import axios from "axios";
import type { CachedDiscordUser, RouteRateLimit } from "../types";
import type { FastifyInstance } from "fastify";
import type KmqWebServer from "../../kmq_web_server";

const logger = new IPCLogger("web_server");

/**
 * Registers the standalone-website auth routes (/api/web/*): a standard
 * Discord OAuth2 redirect flow that ends in an opaque `web_`-prefixed
 * bearer token the SPA uses exactly like the Activity's access token.
 * All routes 503 while the webModeEnabled feature switch is off.
 * @param server - the web server (shared caches/state)
 * @param httpServer - the fastify instance
 * @param limit - per-route rate-limit config builder
 */
export default function registerWebAuthRoutes(
    server: KmqWebServer,
    httpServer: FastifyInstance,
    limit: RouteRateLimit,
): void {
    // OAuth `state` nonces awaiting the web-login callback. `next` is the
    // validated in-site path to land on after login (e.g. an invite link).
    const webOauthStates: Map<string, { expiresAt: number; next: string }> =
        new Map();

    // One-time codes bridging the OAuth callback redirect to the SPA. Values
    // hold the freshly minted session token until the SPA collects it.
    const webLoginCodes: Map<
        string,
        {
            token: string;
            user: CachedDiscordUser;
            expiresAt: number;
        }
    > = new Map();

    // Per-IP guest-login timestamps (rolling window), for the abuse cap on
    // top of the fastify token-bucket limit. Pruned lazily on each attempt.
    const guestLoginsByIP: Map<string, number[]> = new Map();

    /**
     * Records a guest-login attempt from an IP and reports whether it's within
     * the rolling-window cap. Prunes expired timestamps as it goes.
     * @param ip - the requesting IP
     * @returns true if allowed (and recorded); false if the IP is over the cap
     */
    const recordGuestLogin = (ip: string): boolean => {
        const now = Date.now();
        const cutoff = now - WEB_GUEST_LOGIN_IP_WINDOW_MS;
        const recent = (guestLoginsByIP.get(ip) ?? []).filter(
            (t) => t > cutoff,
        );

        if (recent.length >= WEB_GUEST_LOGIN_PER_IP_MAX) {
            guestLoginsByIP.set(ip, recent);
            return false;
        }

        recent.push(now);
        guestLoginsByIP.set(ip, recent);
        return true;
    };

    // WEB_PUBLIC_BASE_URL is the site origin used to build the OAuth
    // redirect_uri; it falls back to the Activity tunnel URL so a dev
    // setup configured for the Activity works for the website too.
    const webPublicBaseUrl = siteOrigin;

    const requireWebMode = async (reply: any): Promise<boolean> => {
        if (KmqConfiguration.Instance.webModeEnabled()) {
            return true;
        }

        await reply.code(503).send({ error: "Web mode disabled" });
        return false;
    };

    const parseCookie = (
        header: string | undefined,
        name: string,
    ): string | null => {
        if (!header) return null;
        for (const part of header.split(";")) {
            const eq = part.indexOf("=");
            if (eq === -1) continue;
            if (part.slice(0, eq).trim() === name) {
                return part.slice(eq + 1).trim();
            }
        }

        return null;
    };

    const stateCookie = (value: string, maxAgeSec: number): string => {
        const secure = webPublicBaseUrl()?.startsWith("https")
            ? "; Secure"
            : "";

        // SameSite=Lax still sends the cookie on the top-level GET
        // navigation back from Discord's consent screen.
        return `${WEB_OAUTH_STATE_COOKIE}=${value}; Max-Age=${maxAgeSec}; Path=/api/web; HttpOnly; SameSite=Lax${secure}`;
    };

    const pruneExpired = (map: Map<string, { expiresAt: number }>): void => {
        const now = Date.now();
        for (const [key, value] of map) {
            if (value.expiresAt <= now) {
                map.delete(key);
            }
        }
    };

    httpServer.get(
        "/api/web/login",
        limit(ACTIVITY_RATE_LIMIT_TOKEN),
        async (request, reply) => {
            if (!(await requireWebMode(reply))) return;

            const baseUrl = webPublicBaseUrl();
            if (
                !baseUrl ||
                !process.env.BOT_CLIENT_ID ||
                !process.env.DISCORD_CLIENT_SECRET
            ) {
                logger.error(
                    "Web login misconfigured: WEB_PUBLIC_BASE_URL, BOT_CLIENT_ID, or DISCORD_CLIENT_SECRET missing",
                );

                await reply.code(500).send({ error: "OAuth not configured" });
                return;
            }

            const state = uuid.v4();
            pruneExpired(webOauthStates);

            // Where to land after login. Restricted to in-site /play
            // paths so the callback can't be used as an open redirect —
            // this is how invite links survive the OAuth round-trip.
            const rawNext = (request.query as { next?: string }).next;
            const next =
                rawNext &&
                rawNext.startsWith("/play") &&
                !rawNext.startsWith("//")
                    ? rawNext
                    : "/play";

            webOauthStates.set(state, {
                expiresAt: Date.now() + WEB_OAUTH_STATE_TTL_MS,
                next,
            });

            const params = new URLSearchParams({
                client_id: process.env.BOT_CLIENT_ID,
                response_type: "code",
                redirect_uri: `${baseUrl}/api/web/callback`,
                scope: "identify",
                state,
            });

            await reply
                .header(
                    "set-cookie",
                    stateCookie(state, WEB_OAUTH_STATE_TTL_MS / 1000),
                )
                .redirect(
                    `${DISCORD_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
                );
        },
    );

    httpServer.get(
        "/api/web/callback",
        limit(ACTIVITY_RATE_LIMIT_TOKEN),
        async (request, reply) => {
            if (!(await requireWebMode(reply))) return;

            const query = request.query as {
                code?: string;
                state?: string;
            };

            const cookieState = parseCookie(
                request.headers.cookie,
                WEB_OAUTH_STATE_COOKIE,
            );

            const state = query.state;
            const stateEntry = state ? webOauthStates.get(state) : undefined;

            const stateValid =
                !!state &&
                cookieState === state &&
                (stateEntry?.expiresAt ?? 0) > Date.now();

            if (state) webOauthStates.delete(state);

            // Expire the state cookie regardless of outcome.
            const expireStateCookie = (): typeof reply =>
                reply.header("set-cookie", stateCookie("", 0));

            if (!stateValid || !query.code) {
                await expireStateCookie()
                    .code(400)
                    .send({ error: "Invalid OAuth state or code" });
                return;
            }

            const baseUrl = webPublicBaseUrl();
            if (
                !baseUrl ||
                !process.env.BOT_CLIENT_ID ||
                !process.env.DISCORD_CLIENT_SECRET
            ) {
                await expireStateCookie()
                    .code(500)
                    .send({ error: "OAuth not configured" });
                return;
            }

            try {
                const params = new URLSearchParams();
                params.set("client_id", process.env.BOT_CLIENT_ID);
                params.set("client_secret", process.env.DISCORD_CLIENT_SECRET);
                params.set("grant_type", "authorization_code");
                params.set("code", query.code);
                params.set("redirect_uri", `${baseUrl}/api/web/callback`);

                const tokenResponse = await axios.post(
                    DISCORD_OAUTH_TOKEN_URL,
                    params.toString(),
                    {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        timeout: ACTIVITY_HTTP_TIMEOUT_MS,
                    },
                );

                const meResponse = await axios.get(DISCORD_USERS_ME_URL, {
                    headers: {
                        Authorization: `Bearer ${tokenResponse.data.access_token}`,
                    },
                    timeout: ACTIVITY_HTTP_TIMEOUT_MS,
                });

                const user: CachedDiscordUser = {
                    id: meResponse.data.id,
                    username: meResponse.data.username,
                    locale:
                        typeof meResponse.data.locale === "string"
                            ? meResponse.data.locale
                            : "",
                    avatarUrl: discordAvatarUrl(
                        meResponse.data.id,
                        meResponse.data.avatar,
                    ),
                    cachedAt: Date.now(),
                };

                const token = await createWebSession({
                    id: user.id,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                    locale: user.locale,
                });

                pruneExpired(webLoginCodes);
                const loginCode = uuid.v4();
                webLoginCodes.set(loginCode, {
                    token,
                    user,
                    expiresAt: Date.now() + WEB_LOGIN_CODE_TTL_MS,
                });

                const next = stateEntry?.next ?? "/play";
                const joiner = next.includes("?") ? "&" : "?";
                await expireStateCookie().redirect(
                    `${next}${joiner}login_code=${encodeURIComponent(loginCode)}`,
                );
            } catch (e) {
                const err = e as {
                    message: string;
                    response?: { status?: number };
                };

                logger.warn(
                    `Web OAuth callback failed. err=${err.message} status=${err.response?.status}`,
                );

                await expireStateCookie()
                    .code(401)
                    .send({ error: "Login failed" });
            }
        },
    );

    httpServer.post(
        "/api/web/complete-login",
        limit(ACTIVITY_RATE_LIMIT_TOKEN),
        async (request, reply) => {
            if (!(await requireWebMode(reply))) return;

            const loginCode = (request.body as any)?.login_code as
                | string
                | undefined;

            if (!loginCode) {
                await reply.code(400).send({ error: "Missing login_code" });
                return;
            }

            const entry = webLoginCodes.get(loginCode);
            // Single-use: consumed on first attempt, valid or not.
            webLoginCodes.delete(loginCode);

            if (!entry || entry.expiresAt <= Date.now()) {
                await reply
                    .code(401)
                    .send({ error: "Invalid or expired login code" });
                return;
            }

            await reply.code(200).send({
                token: entry.token,
                user: {
                    id: entry.user.id,
                    username: entry.user.username,
                    avatarUrl: entry.user.avatarUrl,
                    guest: false,
                },
            });
        },
    );

    httpServer.post(
        "/api/web/guest-login",
        limit(ACTIVITY_RATE_LIMIT_TOKEN),
        async (request, reply) => {
            if (!(await requireWebMode(reply))) return;

            if (!KmqConfiguration.Instance.webGuestsEnabled()) {
                await reply.code(503).send({ error: "Guest mode disabled" });
                return;
            }

            // Per-IP rolling-window cap on top of the token-bucket limit:
            // stops a script farming ephemeral guest identities.
            if (!recordGuestLogin(request.ip)) {
                logger.warn(`Guest-login rate limit hit for IP ${request.ip}`);

                await reply.code(429).send({ error: "Too many guest logins" });
                return;
            }

            const body = request.body as {
                username?: string;
                locale?: string;
            } | null;

            const username = sanitizeGuestUsername(body?.username);
            const locale =
                typeof body?.locale === "string"
                    ? body.locale.slice(0, 16)
                    : "";

            const id = mintGuestUserID();
            const token = await createWebSession({
                id,
                username,
                avatarUrl: null,
                locale,
            });

            logger.info(
                `Guest web session created. id=${id}, username=${username}`,
            );

            await reply.code(200).send({
                token,
                user: {
                    id,
                    username,
                    avatarUrl: null,
                    guest: true,
                },
            });
        },
    );

    httpServer.get(
        "/api/web/session",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            if (!(await requireWebMode(reply))) return;

            const header = request.headers["authorization"];
            const token = header?.startsWith("Bearer ")
                ? header.slice(7)
                : undefined;

            const user = await server.resolveAccessToken(token);
            if (!user) {
                await reply.code(401).send({ error: "Unauthorized" });
                return;
            }

            await reply.code(200).send({
                user: {
                    id: user.id,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                    guest: isGuestUserID(user.id),
                },
            });
        },
    );

    httpServer.post(
        "/api/web/logout",
        limit(ACTIVITY_RATE_LIMIT_TOKEN),
        async (request, reply) => {
            if (!(await requireWebMode(reply))) return;

            const header = request.headers["authorization"];
            const token = header?.startsWith("Bearer ")
                ? header.slice(7)
                : undefined;

            if (token && isWebSessionToken(token)) {
                try {
                    await deleteWebSession(token);
                } catch (e) {
                    logger.warn(
                        `Web logout failed to delete session. err=${
                            (e as Error).message
                        }`,
                    );
                }

                // A logged-out user can't hold a room seat.
                const cached = server.accessTokenCache.get(token);
                if (cached) {
                    server.webRoomManager?.leaveRoom(cached.user.id);
                }

                server.accessTokenCache.delete(token);
            }

            await reply.code(204).send();
        },
    );
}
