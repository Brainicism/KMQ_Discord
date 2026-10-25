import * as uuid from "uuid";
import {
    ACTIVITY_FEEDBACK_MAX_LENGTH,
    ACTIVITY_GUESS_MAX_LENGTH,
    ACTIVITY_HTTP_TIMEOUT_MS,
    ACTIVITY_RATE_LIMIT_ACTION,
    ACTIVITY_RATE_LIMIT_FEEDBACK,
    ACTIVITY_RATE_LIMIT_GUESS,
    ACTIVITY_RATE_LIMIT_LIFECYCLE,
    ACTIVITY_RATE_LIMIT_READ,
    ACTIVITY_RATE_LIMIT_TOKEN,
    ACTIVITY_WS_HEARTBEAT_INTERVAL_MS,
    ACTIVITY_WS_TICKET_TTL_MS,
    CLIP_DEFAULT_DURATION_SEC,
    CLIP_MAX_DURATION_SEC,
    CLIP_MIN_DURATION_SEC,
    DISCORD_OAUTH_TOKEN_URL,
    ELIMINATION_DEFAULT_LIVES,
    ELIMINATION_MAX_LIVES,
} from "../../constants";
import {
    ACTIVITY_GAME_TYPES,
    PRESET_ACTIONS,
    floatInRange,
    intInRange,
    parseSetOptionBody,
} from "../option_body_parser";
import { IPCLogger } from "../../logger";
import { resolveServerLocale } from "../web_server_utils";
import FeedbackCommand from "../../commands/misc_commands/feedback";
import GameType from "../../enums/game_type";
import axios from "axios";
import i18n from "../../helpers/localization_manager";
import type { ActivityPresetAction } from "../../interfaces/activity_preset_args";
import type { ActivitySubscriber } from "../../activity_hub";
import type { CachedDiscordUser, RouteRateLimit } from "../types";
import type { FastifyInstance } from "fastify";
import type KmqWebServer from "../../kmq_web_server";

const logger = new IPCLogger("web_server");

/**
 * Registers the Activity/website gameplay API (/api/activity/*) and the
 * session websocket.
 * @param server - the web server (shared caches/state)
 * @param httpServer - the fastify instance
 * @param limit - per-route rate-limit config builder
 */
export default function registerActivityRoutes(
    server: KmqWebServer,
    httpServer: FastifyInstance,
    limit: RouteRateLimit,
): void {
    const wsTicketCache: Map<
        string,
        {
            userID: string;
            instanceId: string;
            guildID: string;
            expiresAt: number;
        }
    > = new Map();

    httpServer.post(
        "/api/activity/token",
        limit(ACTIVITY_RATE_LIMIT_TOKEN),
        async (request, reply) => {
            const code = (request.body as any)?.code as string | undefined;
            if (!code) {
                await reply.code(400).send({ error: "Missing code" });
                return;
            }

            if (
                !process.env.BOT_CLIENT_ID ||
                !process.env.DISCORD_CLIENT_SECRET
            ) {
                logger.error(
                    "BOT_CLIENT_ID or DISCORD_CLIENT_SECRET not configured for OAuth",
                );

                await reply.code(500).send({ error: "OAuth not configured" });
                return;
            }

            try {
                const params = new URLSearchParams();
                params.set("client_id", process.env.BOT_CLIENT_ID);
                params.set("client_secret", process.env.DISCORD_CLIENT_SECRET);
                params.set("grant_type", "authorization_code");
                params.set("code", code);

                const response = await axios.post(
                    DISCORD_OAUTH_TOKEN_URL,
                    params.toString(),
                    {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        timeout: ACTIVITY_HTTP_TIMEOUT_MS,
                    },
                );

                await reply
                    .code(200)
                    .send({ access_token: response.data.access_token });
            } catch (e) {
                const err = e as {
                    message: string;
                    response?: { status?: number; data?: unknown };
                };

                logger.warn(
                    `Activity OAuth code exchange failed. err=${err.message} status=${err.response?.status} body=${JSON.stringify(err.response?.data)}`,
                );

                await reply.code(401).send({ error: "Code exchange failed" });
            }
        },
    );

    httpServer.get(
        "/api/activity/i18n",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            // Static translation bundle — no auth required. The caller
            // supplies a raw Discord locale tag (e.g. "en-US", "pt-BR");
            // we normalize it to a KMQ-supported LocaleType, with English
            // as the fallback for unsupported languages.
            const rawLocale = (request.query as any)?.locale as
                | string
                | undefined;

            const locale = resolveServerLocale(rawLocale);
            const bundle = i18n.getBundle(locale, "activity");
            if (!bundle) {
                await reply.code(500).send({ error: "Bundle unavailable" });
                return;
            }

            await reply.code(200).send({ locale, strings: bundle });
        },
    );

    const extractBearer = (request: any): string | undefined => {
        const header = request.headers["authorization"] as string | undefined;

        if (header?.startsWith("Bearer ")) {
            return header.slice(7);
        }

        return undefined;
    };

    httpServer.get(
        "/api/activity/session",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            if (!server.activityHub) {
                await reply.code(503).send({ error: "Activity not enabled" });
                return;
            }

            const user = await server.resolveAccessToken(
                extractBearer(request),
            );

            if (!user) {
                await reply.code(401).send({ error: "Unauthorized" });
                return;
            }

            const instanceId = (request.query as any)?.instance_id as
                | string
                | undefined;

            if (!instanceId) {
                await reply.code(400).send({ error: "Missing instance_id" });
                return;
            }

            const instance = await server.resolveInstanceOrRoom(instanceId);
            if (!instance) {
                await reply.code(404).send({ error: "Unknown instance" });
                return;
            }

            if (!instance.participantIDs.has(user.id)) {
                logger.warn(
                    `Activity participant check failed. user=${user.id}, instance=${instanceId}, participants=${[...instance.participantIDs].join(",")}`,
                );

                await reply
                    .code(403)
                    .send({ error: "Not a participant of this instance" });
                return;
            }

            try {
                const snapshot = await server.activityHub.requestSnapshot(
                    instance.guildID,
                );

                // Echo the user's Discord locale so the client can hydrate
                // i18n without a second SDK round-trip.
                await reply
                    .code(200)
                    .send({ ...snapshot, viewerLocale: user.locale });
            } catch (e) {
                logger.warn(
                    `Failed to fetch activity snapshot. gid=${
                        instance.guildID
                    }. err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Snapshot failed" });
            }
        },
    );

    const requireAuthedInstance = async (
        request: any,
        reply: any,
    ): Promise<{
        user: CachedDiscordUser;
        instance: {
            guildID: string;
            channelID: string | null;
            participantIDs: Set<string>;
            webRoom: boolean;
        };
    } | null> => {
        if (!server.activityHub) {
            await reply.code(503).send({ error: "Activity not enabled" });
            return null;
        }

        const user = await server.resolveAccessToken(extractBearer(request));
        if (!user) {
            await reply.code(401).send({ error: "Unauthorized" });
            return null;
        }

        const body = (request.body ?? {}) as { instance_id?: string };
        const instanceId = body.instance_id;
        if (!instanceId) {
            await reply.code(400).send({ error: "Missing instance_id" });
            return null;
        }

        const instance = await server.resolveInstanceOrRoom(instanceId);
        if (!instance || !instance.participantIDs.has(user.id)) {
            await reply.code(403).send({ error: "Forbidden" });
            return null;
        }

        return { user, instance };
    };

    httpServer.post(
        "/api/activity/start",
        limit(ACTIVITY_RATE_LIMIT_LIFECYCLE),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            if (!ctx.instance.webRoom && !ctx.instance.channelID) {
                await reply.code(400).send({ error: "Missing channel" });
                return;
            }

            const startBody = (request.body ?? {}) as {
                gameType?: unknown;
                eliminationLives?: unknown;
                clipDuration?: unknown;
            };

            const rawType =
                typeof startBody.gameType === "string"
                    ? startBody.gameType
                    : GameType.CLASSIC;

            if (!ACTIVITY_GAME_TYPES.has(rawType)) {
                await reply.code(400).send({ error: "Invalid game type" });
                return;
            }

            const gameType = rawType as GameType;

            let eliminationLives: number | undefined;
            if (gameType === GameType.ELIMINATION) {
                eliminationLives =
                    startBody.eliminationLives === undefined
                        ? ELIMINATION_DEFAULT_LIVES
                        : (intInRange(
                              startBody.eliminationLives,
                              1,
                              ELIMINATION_MAX_LIVES,
                          ) ?? undefined);

                if (eliminationLives === undefined) {
                    await reply.code(400).send({ error: "Invalid lives" });
                    return;
                }
            }

            let clipDuration: number | undefined;
            if (gameType === GameType.CLIP) {
                clipDuration =
                    startBody.clipDuration === undefined
                        ? CLIP_DEFAULT_DURATION_SEC
                        : (floatInRange(
                              startBody.clipDuration,
                              CLIP_MIN_DURATION_SEC,
                              CLIP_MAX_DURATION_SEC,
                          ) ?? undefined);

                if (clipDuration === undefined) {
                    await reply
                        .code(400)
                        .send({ error: "Invalid clip duration" });
                    return;
                }
            }

            try {
                // Web rooms have no channels; the worker gets the room's
                // membership inline so the first round can't race the
                // separate membership push.
                const room = ctx.instance.webRoom
                    ? server.webRoomManager?.getRoomForUser(ctx.user.id)
                    : undefined;

                const result = await server.activityHub!.startGame({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                    voiceChannelID: ctx.instance.channelID ?? "",
                    textChannelID: ctx.instance.channelID ?? "",
                    gameType,
                    eliminationLives,
                    clipDuration,
                    ...(ctx.instance.webRoom
                        ? {
                              mode: "web" as const,
                              members: [...(room?.members.values() ?? [])].map(
                                  (m) => ({
                                      id: m.id,
                                      username: m.username,
                                      avatarUrl: m.avatarUrl,
                                  }),
                              ),
                          }
                        : {}),
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity start failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/skip",
        limit(ACTIVITY_RATE_LIMIT_ACTION),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            try {
                const result = await server.activityHub!.skipVote({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity skip failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/hint",
        limit(ACTIVITY_RATE_LIMIT_ACTION),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            try {
                const result = await server.activityHub!.hint({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity hint failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/emote",
        limit(ACTIVITY_RATE_LIMIT_ACTION),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const body = (request.body ?? {}) as { emote?: string };
            if (typeof body.emote !== "string") {
                await reply.code(400).send({ error: "Missing emote" });
                return;
            }

            try {
                const result = await server.activityHub!.emote({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                    emote: body.emote,
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity emote failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/chat",
        limit(ACTIVITY_RATE_LIMIT_ACTION),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const body = (request.body ?? {}) as { text?: string };
            if (typeof body.text !== "string") {
                await reply.code(400).send({ error: "Missing text" });
                return;
            }

            try {
                const result = await server.activityHub!.chat({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                    text: body.text,
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity chat failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/feedback",
        limit(ACTIVITY_RATE_LIMIT_FEEDBACK),
        async (request, reply) => {
            // Gated on being an authed instance/room participant so only
            // real players can reach the alert webhook. Mirrors the
            // /feedback slash command's two questions (see FeedbackCommand
            // .FEEDBACK_QUESTIONS): "like" is optional, "improve" required.
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const body = (request.body ?? {}) as {
                likeKMQ?: unknown;
                improveKMQ?: unknown;
            };

            const readAnswer = (v: unknown): string | undefined =>
                typeof v === "string" ? v.trim() : undefined;

            const likeKMQ = readAnswer(body.likeKMQ);
            const improveKMQ = readAnswer(body.improveKMQ);

            if (!improveKMQ) {
                await reply.code(400).send({ error: "Missing improveKMQ" });
                return;
            }

            if (
                (likeKMQ?.length ?? 0) > ACTIVITY_FEEDBACK_MAX_LENGTH ||
                improveKMQ.length > ACTIVITY_FEEDBACK_MAX_LENGTH
            ) {
                await reply.code(400).send({ error: "Feedback too long" });
                return;
            }

            try {
                // The submitter's chosen/display username is the tag —
                // getUserTag would 404 for web guests, who have no Discord
                // account.
                await FeedbackCommand.submitFeedback(
                    ctx.instance.guildID,
                    ctx.user.username,
                    ctx.user.id,
                    [likeKMQ, improveKMQ],
                );

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity feedback failed. uid=${ctx.user.id}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.get(
        "/api/activity/artist-autocomplete",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            if (!server.activityHub) {
                await reply.code(503).send({ error: "Activity not enabled" });
                return;
            }

            const user = await server.resolveAccessToken(
                extractBearer(request),
            );

            if (!user) {
                await reply.code(401).send({ error: "Unauthorized" });
                return;
            }

            const q = (request.query as any)?.q;
            const query = typeof q === "string" ? q : "";

            // Route to a worker — State.artistToEntry / State.topArtists
            // are populated per-worker at boot via reloadCaches(), so the
            // admiral has to ask one. Worker returns prefix matches
            // capped at ACTIVITY_AUTOCOMPLETE_LIMIT.
            try {
                const response =
                    await server.activityHub.autocompleteArtists(query);

                await reply.code(200).send(response);
            } catch (e) {
                logger.warn(
                    `Activity artist-autocomplete failed. err=${(e as Error).message}`,
                );
                await reply.code(200).send({ results: [] });
            }
        },
    );

    httpServer.get(
        "/api/activity/song-search",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            if (!server.activityHub) {
                await reply.code(503).send({ error: "Activity not enabled" });
                return;
            }

            const user = await server.resolveAccessToken(
                extractBearer(request),
            );

            if (!user) {
                await reply.code(401).send({ error: "Unauthorized" });
                return;
            }

            const q = (request.query as any)?.q;
            const query = typeof q === "string" ? q : "";
            const rawLocale = (request.query as any)?.locale as
                | string
                | undefined;

            const locale = resolveServerLocale(rawLocale);

            // Route to a worker — available_songs is queried per-worker;
            // any worker can answer. Worker returns name matches capped at
            // ACTIVITY_SONG_SEARCH_LIMIT.
            try {
                const response = await server.activityHub.searchSongs(
                    query,
                    locale,
                );

                await reply.code(200).send(response);
            } catch (e) {
                logger.warn(
                    `Activity song-search failed. err=${(e as Error).message}`,
                );
                await reply.code(200).send({ results: [] });
            }
        },
    );

    httpServer.post(
        "/api/activity/option",
        limit(ACTIVITY_RATE_LIMIT_ACTION),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const parsed = parseSetOptionBody(request.body);
            if (!parsed) {
                await reply.code(400).send({ error: "Invalid option payload" });
                return;
            }

            try {
                const result = await server.activityHub!.setOption({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                    ...parsed,
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity setOption failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/preset",
        limit(ACTIVITY_RATE_LIMIT_ACTION),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const body = (request.body ?? {}) as {
                action?: unknown;
                name?: unknown;
            };

            const action = body.action;
            if (typeof action !== "string" || !PRESET_ACTIONS.has(action)) {
                await reply.code(400).send({ error: "Invalid preset action" });
                return;
            }

            const name = typeof body.name === "string" ? body.name : undefined;

            try {
                const result = await server.activityHub!.preset({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                    action: action as ActivityPresetAction,
                    name,
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply
                    .code(200)
                    .send({ ok: true, presets: result.presets });
            } catch (e) {
                logger.warn(
                    `Activity preset failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/profile",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const body = (request.body ?? {}) as {
                target_user_id?: string;
            };

            const targetUserID =
                typeof body.target_user_id === "string"
                    ? body.target_user_id
                    : ctx.user.id;

            // Only let callers view profiles of fellow instance
            // participants (self always qualifies) — don't expose
            // arbitrary global users' stats.
            if (!ctx.instance.participantIDs.has(targetUserID)) {
                await reply.code(403).send({ error: "Forbidden" });
                return;
            }

            try {
                const result = await server.activityHub!.profile({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                    targetUserID,
                });

                await reply.code(200).send(result);
            } catch (e) {
                logger.warn(
                    `Activity profile failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/song",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const body = (request.body ?? {}) as {
                youtube_link?: string;
            };

            if (typeof body.youtube_link !== "string") {
                await reply.code(400).send({ error: "Missing youtube_link" });
                return;
            }

            try {
                const result = await server.activityHub!.songInfo({
                    guildID: ctx.instance.guildID,
                    youtubeLink: body.youtube_link,
                });

                await reply.code(200).send(result);
            } catch (e) {
                logger.warn(
                    `Activity song lookup failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/bookmark",
        limit(ACTIVITY_RATE_LIMIT_ACTION),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const body = (request.body ?? {}) as { youtube_link?: string };
            const youtubeLink = body.youtube_link;

            try {
                const result = await server.activityHub!.bookmark({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                    youtubeLink:
                        typeof youtubeLink === "string" && youtubeLink
                            ? youtubeLink
                            : undefined,
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({
                    ok: true,
                    songName: result.songName,
                    artistName: result.artistName,
                    youtubeLink: result.youtubeLink,
                });
            } catch (e) {
                logger.warn(
                    `Activity bookmark failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/end",
        limit(ACTIVITY_RATE_LIMIT_LIFECYCLE),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            try {
                const result = await server.activityHub!.endGame({
                    guildID: ctx.instance.guildID,
                    userID: ctx.user.id,
                });

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity end failed. gid=${ctx.instance.guildID}, err=${(e as Error).message}`,
                );
                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/guess",
        limit(ACTIVITY_RATE_LIMIT_GUESS),
        async (request, reply) => {
            if (!server.activityHub) {
                await reply.code(503).send({ error: "Activity not enabled" });
                return;
            }

            const user = await server.resolveAccessToken(
                extractBearer(request),
            );

            if (!user) {
                await reply.code(401).send({ error: "Unauthorized" });
                return;
            }

            const body = (request.body ?? {}) as {
                instance_id?: string;
                guess?: string;
            };

            const instanceId = body.instance_id;
            const guess = body.guess;
            if (
                !instanceId ||
                typeof guess !== "string" ||
                guess.length === 0
            ) {
                await reply
                    .code(400)
                    .send({ error: "Missing instance_id or guess" });
                return;
            }

            if (guess.length > ACTIVITY_GUESS_MAX_LENGTH) {
                await reply.code(400).send({ error: "Guess too long" });
                return;
            }

            const instance = await server.resolveInstanceOrRoom(instanceId);
            if (!instance || !instance.participantIDs.has(user.id)) {
                await reply.code(403).send({ error: "Forbidden" });
                return;
            }

            try {
                const result = await server.activityHub.submitGuess(
                    instance.guildID,
                    user.id,
                    guess,
                    Date.now(),
                );

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity guess failed. gid=${instance.guildID}, uid=${user.id}, err=${(e as Error).message}`,
                );

                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    httpServer.post(
        "/api/activity/mc-guess",
        limit(ACTIVITY_RATE_LIMIT_GUESS),
        async (request, reply) => {
            if (!server.activityHub) {
                await reply.code(503).send({ error: "Activity not enabled" });
                return;
            }

            const user = await server.resolveAccessToken(
                extractBearer(request),
            );

            if (!user) {
                await reply.code(401).send({ error: "Unauthorized" });
                return;
            }

            const body = (request.body ?? {}) as {
                instance_id?: string;
                choiceID?: string;
            };

            const instanceId = body.instance_id;
            const choiceID = body.choiceID;
            // choiceID is a server-generated round button uuid (36 chars);
            // cap length so a malicious client can't ship a huge payload.
            if (
                !instanceId ||
                typeof choiceID !== "string" ||
                choiceID.length === 0 ||
                choiceID.length > 64
            ) {
                await reply
                    .code(400)
                    .send({ error: "Missing instance_id or choiceID" });
                return;
            }

            const instance = await server.resolveInstanceOrRoom(instanceId);
            if (!instance || !instance.participantIDs.has(user.id)) {
                await reply.code(403).send({ error: "Forbidden" });
                return;
            }

            try {
                const result = await server.activityHub.submitMcGuess(
                    instance.guildID,
                    user.id,
                    choiceID,
                    Date.now(),
                );

                if (!result.ok) {
                    await reply.code(409).send({ error: result.reason });
                    return;
                }

                await reply.code(200).send({ ok: true });
            } catch (e) {
                logger.warn(
                    `Activity mc-guess failed. gid=${instance.guildID}, uid=${user.id}, err=${(e as Error).message}`,
                );

                await reply.code(500).send({ error: "Internal" });
            }
        },
    );

    // Short-lived single-use ticket exchange. The Activity calls this with
    // its bearer access token, gets back a UUID, and uses the UUID in the
    // WS query string. Tokens never appear in URLs or server access logs.
    httpServer.post(
        "/api/activity/ws-ticket",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            const ctx = await requireAuthedInstance(request, reply);
            if (!ctx) return;

            const body = (request.body ?? {}) as { instance_id?: string };
            const instanceId = body.instance_id;
            if (!instanceId) {
                await reply.code(400).send({ error: "Missing instance_id" });
                return;
            }

            const ticket = uuid.v4();
            wsTicketCache.set(ticket, {
                userID: ctx.user.id,
                instanceId,
                guildID: ctx.instance.guildID,
                expiresAt: Date.now() + ACTIVITY_WS_TICKET_TTL_MS,
            });

            await reply.code(200).send({ ticket });
        },
    );

    httpServer.get(
        "/ws/activity",
        {
            websocket: true,
            config: {
                rateLimit: {
                    max: ACTIVITY_RATE_LIMIT_READ,
                    timeWindow: "1 minute",
                },
            },
        },
        async (socket, request) => {
            if (!server.activityHub) {
                socket.close(1011, "Activity not enabled");
                return;
            }

            const ticket = (request.query as any)?.ticket as string | undefined;

            if (!ticket) {
                socket.close(4400, "Missing ticket");
                return;
            }

            const entry = wsTicketCache.get(ticket);
            if (!entry || entry.expiresAt < Date.now()) {
                wsTicketCache.delete(ticket);
                socket.close(4401, "Invalid or expired ticket");
                return;
            }

            // Single-use — drop the ticket immediately so a leaked URL
            // can't be replayed.
            wsTicketCache.delete(ticket);

            const { userID, instanceId, guildID } = entry;

            const subscriber: ActivitySubscriber = {
                id: `${userID}:${instanceId}`,
                send: (data) => {
                    try {
                        socket.send(data);
                    } catch (e) {
                        logger.debug(
                            `Activity WS send failed for ${userID}. err=${e}`,
                        );
                    }
                },
                close: () => {
                    try {
                        socket.close();
                    } catch {
                        // ignore
                    }
                },
            };

            server.activityHub.subscribe(guildID, subscriber);
            // For web rooms the instance ID is the room code; an open
            // socket is what marks the member present.
            server.webRoomManager?.memberConnected(instanceId, userID);

            let alive = true;
            const heartbeat = setInterval(() => {
                if (!alive) {
                    try {
                        socket.terminate();
                    } catch {
                        // ignore
                    }

                    return;
                }

                alive = false;
                try {
                    socket.ping();
                } catch {
                    // ignore
                }
            }, ACTIVITY_WS_HEARTBEAT_INTERVAL_MS);

            socket.on("pong", () => {
                alive = true;
            });

            socket.on("close", () => {
                clearInterval(heartbeat);
                if (server.activityHub) {
                    server.activityHub.unsubscribe(guildID, subscriber);
                }

                server.webRoomManager?.memberDisconnected(instanceId, userID);
            });

            try {
                const snapshot =
                    await server.activityHub.requestSnapshot(guildID);

                socket.send(JSON.stringify({ type: "snapshot", snapshot }));
            } catch (e) {
                logger.warn(
                    `Failed initial activity snapshot for gid=${guildID}. err=${
                        (e as Error).message
                    }`,
                );
            }
        },
    );
}
