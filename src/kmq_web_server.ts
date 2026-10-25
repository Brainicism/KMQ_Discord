import {
    ACTIVITY_ACCESS_TOKEN_CACHE_TTL_MS,
    ACTIVITY_HTTP_TIMEOUT_MS,
    ACTIVITY_INSTANCE_CACHE_TTL_MS,
    DISCORD_ACTIVITY_INSTANCE_URL,
    DISCORD_USERS_ME_URL,
    WEB_ROOM_SWEEP_INTERVAL_MS,
    discordAvatarUrl,
} from "./constants";
import { IPCLogger } from "./logger";
import {
    isWebSessionToken,
    resolveWebSession,
} from "./helpers/web_session_manager";
import WebRoomManager from "./web_room_manager";
import axios from "axios";
import ejs from "ejs";
import fastify from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyView from "@fastify/view";
import fastifyWebsocket from "@fastify/websocket";
import registerActivityRoutes from "./web_server/routes/activity_routes";
import registerInternalRoutes from "./web_server/routes/internal_routes";
import registerSiteRoutes from "./web_server/routes/site_routes";
import registerWebAudioRoutes from "./web_server/routes/web_audio_routes";
import registerWebAuthRoutes from "./web_server/routes/web_auth_routes";
import registerWebRoomRoutes from "./web_server/routes/web_room_routes";
import type { CachedDiscordUser, RouteRateLimit } from "./web_server/types";
import type { DatabaseContext } from "./database_context";
import type { Fleet } from "eris-fleet";
import type ActivityHub from "./activity_hub";

const logger = new IPCLogger("web_server");

export default class KmqWebServer {
    dbContext: DatabaseContext;

    activityHub: ActivityHub | null;

    accessTokenCache: Map<
        string,
        { user: CachedDiscordUser; expiresAt: number }
    > = new Map();

    webRoomManager: WebRoomManager | null = null;

    private instanceCache: Map<
        string,
        {
            guildID: string;
            channelID: string | null;
            participantIDs: Set<string>;
            expiresAt: number;
        }
    > = new Map();

    constructor(
        databaseContext: DatabaseContext,
        activityHub: ActivityHub | null = null,
    ) {
        this.dbContext = databaseContext;
        this.activityHub = activityHub;

        if (activityHub) {
            // Mirror membership to the worker owning the room's guild ID —
            // it feeds WebGameSession participants; an empty push means the
            // room closed and tears any running game down. Fire-and-forget:
            // a lost push self-heals on the next membership change.
            const pushMembership = (
                roomID: string,
                members: Array<{
                    id: string;
                    username: string;
                    avatarUrl: string | null;
                }>,
            ): void => {
                activityHub
                    .webRoomMembership({ guildID: roomID, members })
                    .catch((e) => {
                        logger.warn(
                            `Web room membership push failed for ${roomID}. err=${(e as Error).message}`,
                        );
                    });
            };

            this.webRoomManager = new WebRoomManager({
                onRoomClosed: (roomID) => {
                    pushMembership(roomID, []);
                },
                onRoomChanged: (room) => {
                    pushMembership(
                        room.roomID,
                        [...room.members.values()].map((m) => ({
                            id: m.id,
                            username: m.username,
                            avatarUrl: m.avatarUrl,
                        })),
                    );
                },
            });

            setInterval(() => {
                this.webRoomManager?.sweep();
            }, WEB_ROOM_SWEEP_INTERVAL_MS).unref();
        }
    }

    /**
     * @param fleet - The fleet instance
     * Starts web server
     * */
    async startWebServer(fleet: Fleet): Promise<void> {
        // Trust only the loopback proxy (nginx on 127.0.0.1) so `request.ip`
        // and @fastify/rate-limit resolve the real client IP from the
        // X-Forwarded-For nginx appends, rather than seeing every external
        // request as 127.0.0.1. This makes the per-IP rate limits (including
        // the guest-login cap) effective and keeps the `request.ip ===
        // "127.0.0.1"` internal-route gates from being bypassed via the proxy.
        // Loopback-only trust prevents clients spoofing X-Forwarded-For.
        const httpServer = fastify({ trustProxy: "loopback" });
        await httpServer.register(fastifyView, {
            engine: {
                ejs,
            },
        });

        await httpServer.register(fastifyRateLimit, {
            // Apply a generous global default so every route gets some rate
            // limiting (CodeQL can't recognize per-route config alone as
            // coverage). Per-route `limit(...)` overrides tighten this for
            // the Activity endpoints below; the admin/localhost routes run
            // under the global default, which is high enough not to trip
            // legitimate internal callers.
            global: true,
            max: 600,
            timeWindow: "1 minute",
        });

        await httpServer.register(fastifyWebsocket);

        // Lower limits on token + lifecycle endpoints (these create or destroy
        // sessions / hit Discord's OAuth which has its own quota); higher
        // limits on read-only and high-frequency action endpoints.
        const limit: RouteRateLimit = (max) => ({
            config: {
                rateLimit: { max, timeWindow: "1 minute" },
            },
        });

        await registerSiteRoutes(this, httpServer, limit);
        registerInternalRoutes(this, httpServer, limit, fleet);
        registerActivityRoutes(this, httpServer, limit);
        registerWebAuthRoutes(this, httpServer, limit);
        registerWebRoomRoutes(this, httpServer, limit);
        registerWebAudioRoutes(this, httpServer, limit);

        try {
            if (!process.env.WEB_SERVER_PORT) {
                logger.warn(
                    "WEB_SERVER_PORT not specified, not starting web server",
                );
            } else {
                await httpServer.listen({
                    host: "0.0.0.0",
                    port: parseInt(process.env.WEB_SERVER_PORT, 10),
                });
            }
        } catch (err) {
            logger.error(`Erroring starting HTTP server: ${err}`);
        }
    }

    async resolveAccessToken(
        token: string | undefined,
    ): Promise<CachedDiscordUser | null> {
        if (!token) return null;
        const now = Date.now();
        const cached = this.accessTokenCache.get(token);
        if (cached && cached.expiresAt > now) {
            return cached.user;
        }

        // Web session tokens resolve against the local web_sessions store;
        // everything else is a Discord OAuth access token from the embedded
        // Activity and resolves via users/@me.
        if (isWebSessionToken(token)) {
            try {
                const webUser = await resolveWebSession(token);
                if (!webUser) return null;

                const user: CachedDiscordUser = {
                    id: webUser.id,
                    username: webUser.username,
                    locale: webUser.locale,
                    avatarUrl: webUser.avatarUrl,
                    cachedAt: now,
                };

                this.accessTokenCache.set(token, {
                    user,
                    expiresAt: now + ACTIVITY_ACCESS_TOKEN_CACHE_TTL_MS,
                });

                return user;
            } catch (e) {
                logger.warn(
                    `Failed to resolve web session token. err=${
                        (e as Error).message
                    }`,
                );
                return null;
            }
        }

        try {
            const response = await axios.get(DISCORD_USERS_ME_URL, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: ACTIVITY_HTTP_TIMEOUT_MS,
            });

            const user: CachedDiscordUser = {
                id: response.data.id,
                username: response.data.username,
                locale:
                    typeof response.data.locale === "string"
                        ? response.data.locale
                        : "",
                avatarUrl: discordAvatarUrl(
                    response.data.id,
                    response.data.avatar,
                ),
                cachedAt: now,
            };

            this.accessTokenCache.set(token, {
                user,
                expiresAt: now + ACTIVITY_ACCESS_TOKEN_CACHE_TTL_MS,
            });

            return user;
        } catch (e) {
            logger.warn(
                `Failed to resolve activity access token. err=${
                    (e as Error).message
                }`,
            );
            return null;
        }
    }

    /**
     * Resolves a client-supplied instance ID to its guild/participants. Web
     * room codes and Discord Activity instance IDs share the `instance_id`
     * field on the wire; a room-code hit wins (codes are unguessable random
     * strings, so a real Activity instance ID can't collide with a live one).
     * @param instanceId - Activity instance ID or web room invite code
     * @returns the instance context, or null if neither resolves
     */
    async resolveInstanceOrRoom(instanceId: string): Promise<{
        guildID: string;
        channelID: string | null;
        participantIDs: Set<string>;
        webRoom: boolean;
    } | null> {
        const room = this.webRoomManager?.getRoomByCode(instanceId);
        if (room) {
            return {
                guildID: room.roomID,
                channelID: null,
                participantIDs: new Set(room.members.keys()),
                webRoom: true,
            };
        }

        const instance = await this.resolveActivityInstance(instanceId);
        return instance ? { ...instance, webRoom: false } : null;
    }

    private async resolveActivityInstance(instanceId: string): Promise<{
        guildID: string;
        channelID: string | null;
        participantIDs: Set<string>;
    } | null> {
        // SSRF guard: instanceId is user-controlled and gets interpolated into
        // the Discord REST URL. Discord Activity instance IDs are opaque
        // strings, but in practice are a short alphanumeric token. Reject
        // anything outside that shape before making the upstream call.
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(instanceId)) {
            return null;
        }

        const now = Date.now();
        const cached = this.instanceCache.get(instanceId);
        if (cached && cached.expiresAt > now) {
            return {
                guildID: cached.guildID,
                channelID: cached.channelID,
                participantIDs: cached.participantIDs,
            };
        }

        try {
            const response = await axios.get(
                DISCORD_ACTIVITY_INSTANCE_URL(
                    process.env.BOT_CLIENT_ID!,
                    instanceId,
                ),
                {
                    headers: {
                        Authorization: `Bot ${process.env.BOT_TOKEN}`,
                    },
                    timeout: ACTIVITY_HTTP_TIMEOUT_MS,
                },
            );

            const guildID = response.data?.location?.guild_id as
                | string
                | undefined;

            const channelID =
                (response.data?.location?.channel_id as string | undefined) ??
                null;

            // Discord returns `users` as an array of snowflake strings, but
            // some SDK versions wrap them in `{id}` objects. Handle both.
            const rawUsers = (response.data?.users ?? []) as Array<unknown>;
            const participantIDs = new Set<string>(
                rawUsers
                    .map((u) =>
                        typeof u === "string"
                            ? u
                            : ((u as { id?: string }).id ?? null),
                    )
                    .filter((id): id is string => typeof id === "string"),
            );

            if (!guildID) {
                return null;
            }

            this.instanceCache.set(instanceId, {
                guildID,
                channelID,
                participantIDs,
                expiresAt: now + ACTIVITY_INSTANCE_CACHE_TTL_MS,
            });

            return { guildID, channelID, participantIDs };
        } catch (e) {
            logger.warn(
                `Failed to resolve activity instance ${instanceId}. err=${
                    (e as Error).message
                }`,
            );
            return null;
        }
    }
}
