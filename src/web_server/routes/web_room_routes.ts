import {
    ACTIVITY_RATE_LIMIT_LIFECYCLE,
    ACTIVITY_RATE_LIMIT_READ,
    WEB_ROOM_PASSWORD_MAX_LENGTH,
} from "../../constants";
import { isGuestUserID } from "../../helpers/web_session_manager";
import KmqConfiguration from "../../kmq_configuration";
import type { CachedDiscordUser, RouteRateLimit } from "../types";
import type { FastifyInstance } from "fastify";
import type KmqWebServer from "../../kmq_web_server";

/**
 * Validates a client-supplied room password. Returns the trimmed password,
 * null when none was supplied (open room), or `undefined` when the value
 * is the wrong type or too long (the caller should 400).
 * @param raw - the raw `password` field from the request body
 * @returns the password, null, or undefined (invalid)
 */
function parseRoomPassword(raw: unknown): string | null | undefined {
    if (raw === undefined || raw === null || raw === "") {
        return null;
    }

    if (typeof raw !== "string" || raw.length > WEB_ROOM_PASSWORD_MAX_LENGTH) {
        return undefined;
    }

    return raw;
}

/**
 * Registers the standalone-website room routes (/api/web/room*): create/
 * join/leave/read multiplayer rooms whose invite code doubles as the
 * client's instance_id for every gameplay route. Gated behind the same
 * webModeEnabled feature switch as the auth routes.
 * @param server - the web server (shared caches/state)
 * @param httpServer - the fastify instance
 * @param limit - per-route rate-limit config builder
 */
export default function registerWebRoomRoutes(
    server: KmqWebServer,
    httpServer: FastifyInstance,
    limit: RouteRateLimit,
): void {
    // Resolves the requester or replies with the right error; returns
    // null when a response has already been sent.
    const requireWebUser = async (
        request: any,
        reply: any,
    ): Promise<CachedDiscordUser | null> => {
        if (!KmqConfiguration.Instance.webModeEnabled()) {
            await reply.code(503).send({ error: "Web mode disabled" });
            return null;
        }

        if (!server.webRoomManager) {
            await reply.code(503).send({ error: "Rooms not enabled" });
            return null;
        }

        const header = request.headers["authorization"] as string | undefined;

        const token = header?.startsWith("Bearer ")
            ? header.slice(7)
            : undefined;

        const user = await server.resolveAccessToken(token);
        if (!user) {
            await reply.code(401).send({ error: "Unauthorized" });
            return null;
        }

        return user;
    };

    httpServer.post(
        "/api/web/room",
        limit(ACTIVITY_RATE_LIMIT_LIFECYCLE),
        async (request, reply) => {
            const user = await requireWebUser(request, reply);
            if (!user) return;

            // Guests host like anyone else (their rooms get their own
            // guild-ID space, see WebRoomManager.roomIDForOwner), unless
            // hosting has been shed via the feature switch — joining an
            // invite still works in that case.
            const isGuest = isGuestUserID(user.id);
            if (
                isGuest &&
                !KmqConfiguration.Instance.webGuestHostingEnabled()
            ) {
                await reply.code(403).send({ error: "guest_forbidden" });
                return;
            }

            const createBody = (request.body ?? {}) as {
                visibility?: unknown;
                password?: unknown;
            };

            // Default private (preserves the pre-lobbies behavior); only
            // "public" opts into the browse list.
            const visibility =
                createBody.visibility === "public" ? "public" : "private";

            const password = parseRoomPassword(createBody.password);
            if (password === undefined) {
                await reply.code(400).send({ error: "Invalid password" });
                return;
            }

            const result = server.webRoomManager!.createRoom(
                {
                    id: user.id,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                },
                { visibility, password },
            );

            if ("error" in result) {
                // Only possible when rejoining one's own still-alive room
                // that has since filled up.
                await reply.code(409).send({ error: result.error });
                return;
            }

            await reply.code(200).send({
                room: server.webRoomManager!.serializeRoom(result.room),
            });
        },
    );

    httpServer.post(
        "/api/web/room/join",
        limit(ACTIVITY_RATE_LIMIT_LIFECYCLE),
        async (request, reply) => {
            const user = await requireWebUser(request, reply);
            if (!user) return;

            const joinBody = (request.body ?? {}) as {
                code?: unknown;
                password?: unknown;
            };

            const code = joinBody.code;
            if (!code || typeof code !== "string") {
                await reply.code(400).send({ error: "Missing code" });
                return;
            }

            const password = parseRoomPassword(joinBody.password);
            if (password === undefined) {
                await reply.code(400).send({ error: "Invalid password" });
                return;
            }

            const result = server.webRoomManager!.joinRoom(
                code,
                {
                    id: user.id,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                },
                password ?? undefined,
            );

            if ("error" in result) {
                // not_found → 404; wrong_password → 403; full → 409.
                const statusByError: Record<string, number> = {
                    not_found: 404,
                    wrong_password: 403,
                    full: 409,
                };

                await reply
                    .code(statusByError[result.error] ?? 409)
                    .send({ error: result.error });
                return;
            }

            await reply.code(200).send({
                room: server.webRoomManager!.serializeRoom(result.room),
            });
        },
    );

    httpServer.post(
        "/api/web/room/leave",
        limit(ACTIVITY_RATE_LIMIT_LIFECYCLE),
        async (request, reply) => {
            const user = await requireWebUser(request, reply);
            if (!user) return;

            server.webRoomManager!.leaveRoom(user.id);
            await reply.code(204).send();
        },
    );

    httpServer.get(
        "/api/web/room",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            const user = await requireWebUser(request, reply);
            if (!user) return;

            // With ?code=, read that room (members only — the code is
            // the room's bearer capability, but presence/usernames still
            // shouldn't leak to non-members probing codes). Without it,
            // resolve the requester's current room for reconnects.
            const code = (request.query as { code?: string }).code;
            const room = code
                ? server.webRoomManager!.getRoomByCode(code)
                : server.webRoomManager!.getRoomForUser(user.id);

            if (!room) {
                await reply.code(404).send({ error: "No room" });
                return;
            }

            if (!room.members.has(user.id)) {
                await reply.code(403).send({ error: "Not a member" });
                return;
            }

            await reply.code(200).send({
                room: server.webRoomManager!.serializeRoom(room),
            });
        },
    );

    httpServer.get(
        "/api/web/rooms",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            // Public lobby list — the "find a game" surface. Any web user
            // (guest included) may browse it; it never leaks rosters or
            // passwords (see WebRoomManager.listPublicRooms).
            const user = await requireWebUser(request, reply);
            if (!user) return;

            await reply.code(200).send({
                rooms: server.webRoomManager!.listPublicRooms(),
            });
        },
    );
}
