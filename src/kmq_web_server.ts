import * as uuid from "uuid";
import {
    ACTIVITY_ACCESS_TOKEN_CACHE_TTL_MS,
    ACTIVITY_GUESS_MAX_LENGTH,
    ACTIVITY_HTTP_TIMEOUT_MS,
    ACTIVITY_INSTANCE_CACHE_TTL_MS,
    ACTIVITY_RATE_LIMIT_ACTION,
    ACTIVITY_RATE_LIMIT_GUESS,
    ACTIVITY_RATE_LIMIT_LIFECYCLE,
    ACTIVITY_RATE_LIMIT_READ,
    ACTIVITY_RATE_LIMIT_TOKEN,
    ACTIVITY_WS_HEARTBEAT_INTERVAL_MS,
    ACTIVITY_WS_TICKET_TTL_MS,
    CLIP_DEFAULT_DURATION_SEC,
    CLIP_MAX_DURATION_SEC,
    CLIP_MIN_DURATION_SEC,
    DEFAULT_LOCALE,
    DISCORD_ACTIVITY_INSTANCE_URL,
    DISCORD_OAUTH_AUTHORIZE_URL,
    DISCORD_OAUTH_TOKEN_URL,
    DISCORD_USERS_ME_URL,
    EARLIEST_BEGINNING_SEARCH_YEAR,
    ELIMINATION_DEFAULT_LIVES,
    ELIMINATION_MAX_LIVES,
    WEB_AUDIO_MAX_CONCURRENT_STREAMS,
    WEB_AUDIO_URL_PREFIX,
    WEB_LOGIN_CODE_TTL_MS,
    WEB_OAUTH_STATE_COOKIE,
    WEB_OAUTH_STATE_TTL_MS,
    WEB_ROOM_SWEEP_INTERVAL_MS,
    discordAvatarUrl,
} from "./constants";
import { IPCLogger } from "./logger";
import { availableGenders } from "./enums/option_types/gender";
import { buildAudioStreamArgs } from "./web_audio_registry";
import {
    createWebSession,
    deleteWebSession,
    isGuestUserID,
    isWebSessionToken,
    mintGuestUserID,
    resolveWebSession,
    sanitizeGuestUsername,
} from "./helpers/web_session_manager";
import { measureExecutionTime, standardDateFormat } from "./helpers/utils";
import { spawn } from "child_process";
import { sql } from "kysely";
import { userVoted } from "./helpers/bot_listing_manager";
import AnswerType from "./enums/option_types/answer_type";
import ArtistType from "./enums/option_types/artist_type";
import GameType from "./enums/game_type";
import GuessModeType from "./enums/option_types/guess_mode_type";
import KmqConfiguration from "./kmq_configuration";
import LanguageType from "./enums/option_types/language_type";
import LocaleType from "./enums/locale_type";
import MultiGuessType from "./enums/option_types/multiguess_type";
import OstPreference from "./enums/option_types/ost_preference";
import ReleaseType from "./enums/option_types/release_type";
import SeekType from "./enums/option_types/seek_type";
import ShuffleType from "./enums/option_types/shuffle_type";
import SpecialType from "./enums/option_types/special_type";
import SubunitsPreference from "./enums/option_types/subunit_preference";
import WebRoomManager from "./web_room_manager";
import _ from "lodash";
import axios from "axios";
import ejs from "ejs";
import fastify from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import fastifyWebsocket from "@fastify/websocket";
import fs from "fs";
import i18n from "./helpers/localization_manager";
import os from "os";
import path from "path";
import type { ActivityPresetAction } from "./interfaces/activity_preset_args";
import type { ActivitySubscriber } from "./activity_hub";
import type { DatabaseContext } from "./database_context";
import type { FastifyInstance } from "fastify";
import type { Fleet, Stats } from "eris-fleet";
import type { GenderModeOptions } from "./enums/option_types/gender";
import type ActivityHub from "./activity_hub";

const logger = new IPCLogger("web_server");

interface ClusterData {
    id: number;
    ram: string;
    apiLatency: string;
    uptime: string;
    version: string;
    voiceConnections: number;
    activeGameSessions: number;
    activePlayers: number;
    activeListeningSessions: number;
    activeListeners: number;
    shardData: Array<ShardData>;
}

enum HealthIndicator {
    HEALTHY = 0,
    WARNING = 1,
    UNHEALTHY = 2,
}

interface ShardData {
    latency: string;
    status: string;
    members: string;
    id: number;
    guilds: string;
    healthIndicator: HealthIndicator;
}

interface CachedDiscordUser {
    id: string;
    username: string;
    /** Discord user locale (e.g. "en-US"). Empty if Discord didn't return one. */
    locale: string;
    avatarUrl: string | null;
    cachedAt: number;
}

const SUPPORTED_LOCALES: ReadonlySet<string> = new Set(
    Object.values(LocaleType),
);

/**
 * Normalizes a raw locale tag from an Activity client into a KMQ-supported
 * `LocaleType`. Discord hands back BCP-47-ish tags ("en-US", "pt-BR") while
 * KMQ only supports a subset, so we match exact, then the language prefix,
 * then fall back to English.
 * @param raw - unverified locale tag from the client
 * @returns a supported `LocaleType`
 */
function resolveServerLocale(raw: string | undefined): LocaleType {
    if (!raw) return DEFAULT_LOCALE;

    if (SUPPORTED_LOCALES.has(raw)) {
        return raw as LocaleType;
    }

    const language = raw.split("-")[0]?.toLowerCase();
    if (!language) return DEFAULT_LOCALE;

    if (SUPPORTED_LOCALES.has(language)) {
        return language as LocaleType;
    }

    for (const supported of SUPPORTED_LOCALES) {
        if (supported.split("-")[0] === language) {
            return supported as LocaleType;
        }
    }

    return DEFAULT_LOCALE;
}

const GENDER_VALUES: ReadonlySet<string> = new Set(availableGenders);
const GUESS_MODE_VALUES: ReadonlySet<string> = new Set(
    Object.values(GuessModeType),
);

const MULTIGUESS_VALUES: ReadonlySet<string> = new Set(
    Object.values(MultiGuessType),
);

const SHUFFLE_VALUES: ReadonlySet<string> = new Set(Object.values(ShuffleType));
const SEEK_VALUES: ReadonlySet<string> = new Set(Object.values(SeekType));
const LANGUAGE_VALUES: ReadonlySet<string> = new Set(
    Object.values(LanguageType),
);

const RELEASE_VALUES: ReadonlySet<string> = new Set(Object.values(ReleaseType));
const ARTIST_TYPE_VALUES: ReadonlySet<string> = new Set(
    Object.values(ArtistType),
);

const SUBUNITS_VALUES: ReadonlySet<string> = new Set(
    Object.values(SubunitsPreference),
);

const ANSWER_TYPE_VALUES: ReadonlySet<string> = new Set(
    Object.values(AnswerType),
);

const OST_VALUES: ReadonlySet<string> = new Set(Object.values(OstPreference));
const SPECIAL_VALUES: ReadonlySet<string> = new Set(Object.values(SpecialType));

const PRESET_ACTIONS: ReadonlySet<string> = new Set([
    "list",
    "save",
    "load",
    "delete",
]);

// Game types the Activity can start. Teams (needs a lobby) and competition
// (moderator-gated) are intentionally excluded.
const ACTIVITY_GAME_TYPES: ReadonlySet<string> = new Set([
    GameType.CLASSIC,
    GameType.SUDDEN_DEATH,
    GameType.ELIMINATION,
    GameType.CLIP,
]);

// Numeric bounds for the Activity options panel. Kept in sync with the
// slash-command handlers (src/commands/game_options/{limit,timer,...}.ts);
// validated server-side so a malicious client can't persist out-of-range
// values.
const LIMIT_MIN = 0;
const LIMIT_MAX = 100_000;
const GOAL_MIN = 1;
const GOAL_MAX = 100_000;
const TIMER_MIN = 2;
const TIMER_MAX = 180;
const DURATION_MIN = 2;
const DURATION_MAX = 600;
// Cap artist-list writes; the slash-command UX tops out at a similar
// size and anything larger is almost certainly abuse or a client bug.
const ARTIST_LIST_MAX = 200;

// Subset of ActivitySetOptionArgs that the client supplies — guildID /
// userID are filled in server-side from the auth context.
type SetOptionBody =
    | { kind: "gender"; genders: GenderModeOptions[] }
    | { kind: "guessMode"; guessMode: GuessModeType }
    | { kind: "multiguess"; multiguess: MultiGuessType }
    | { kind: "limit"; limitStart: number; limitEnd: number }
    | { kind: "cutoff"; beginningYear: number; endYear: number }
    | { kind: "goal"; goal: number | null }
    | { kind: "timer"; timer: number | null }
    | { kind: "duration"; duration: number | null }
    | { kind: "shuffle"; shuffle: ShuffleType }
    | { kind: "seek"; seek: SeekType }
    | { kind: "language"; language: LanguageType }
    | { kind: "release"; release: ReleaseType }
    | { kind: "artisttype"; artisttype: ArtistType }
    | { kind: "subunits"; subunits: SubunitsPreference }
    | { kind: "answer"; answer: AnswerType }
    | { kind: "ost"; ost: OstPreference }
    | { kind: "special"; special: SpecialType | null }
    | { kind: "groups"; artistIDs: number[] }
    | { kind: "includes"; artistIDs: number[] }
    | { kind: "excludes"; artistIDs: number[] }
    | { kind: "playlist"; playlistURL: string | null }
    | { kind: "reset" };

function intInRange(v: unknown, min: number, max: number): number | null {
    if (typeof v !== "number" || !Number.isInteger(v)) return null;
    if (v < min || v > max) return null;
    return v;
}

function nullableIntInRange(
    v: unknown,
    min: number,
    max: number,
): number | null | undefined {
    // null explicitly clears the option; a present-but-invalid value (wrong
    // type or out of range) is signalled as `undefined` so the caller rejects
    // it with a 400 rather than silently coercing it to a reset.
    if (v === null) return null;
    const parsed = intInRange(v, min, max);
    return parsed === null ? undefined : parsed;
}

function floatInRange(v: unknown, min: number, max: number): number | null {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    if (v < min || v > max) return null;
    return v;
}

/**
 * Parses + whitelists the JSON body of POST /api/activity/option. Never
 * trust the client: only accept `kind` + the typed value for that kind,
 * and reject everything else.
 * @param body - Raw JSON body supplied by the request.
 * @returns A validated SetOptionBody, or null if the shape/enum mismatch
 * means the caller should respond 400.
 */
export function parseSetOptionBody(body: unknown): SetOptionBody | null {
    if (!body || typeof body !== "object") return null;
    const obj = body as Record<string, unknown>;
    switch (obj["kind"]) {
        case "gender": {
            const raw = obj["genders"];
            if (!Array.isArray(raw)) return null;
            if (raw.length > 4) return null;
            const genders: GenderModeOptions[] = [];
            for (const g of raw) {
                if (typeof g !== "string" || !GENDER_VALUES.has(g)) {
                    return null;
                }

                genders.push(g as GenderModeOptions);
            }

            return { kind: "gender", genders };
        }

        case "guessMode": {
            const v = obj["guessMode"];
            if (typeof v !== "string" || !GUESS_MODE_VALUES.has(v)) {
                return null;
            }

            return { kind: "guessMode", guessMode: v as GuessModeType };
        }

        case "multiguess": {
            const v = obj["multiguess"];
            if (typeof v !== "string" || !MULTIGUESS_VALUES.has(v)) {
                return null;
            }

            return { kind: "multiguess", multiguess: v as MultiGuessType };
        }

        case "limit": {
            const start = intInRange(obj["limitStart"], LIMIT_MIN, LIMIT_MAX);
            const end = intInRange(obj["limitEnd"], LIMIT_MIN, LIMIT_MAX);
            if (start === null || end === null) return null;
            if (start >= end) return null;
            return { kind: "limit", limitStart: start, limitEnd: end };
        }

        case "cutoff": {
            const now = new Date().getFullYear();
            const begin = intInRange(
                obj["beginningYear"],
                EARLIEST_BEGINNING_SEARCH_YEAR,
                now,
            );

            const end = intInRange(
                obj["endYear"],
                EARLIEST_BEGINNING_SEARCH_YEAR,
                now,
            );

            if (begin === null || end === null) return null;
            if (begin > end) return null;
            return { kind: "cutoff", beginningYear: begin, endYear: end };
        }

        case "goal": {
            const v = nullableIntInRange(obj["goal"], GOAL_MIN, GOAL_MAX);
            if (v === undefined) return null;
            return { kind: "goal", goal: v };
        }

        case "timer": {
            const v = nullableIntInRange(obj["timer"], TIMER_MIN, TIMER_MAX);
            if (v === undefined) return null;
            return { kind: "timer", timer: v };
        }

        case "duration": {
            const v = nullableIntInRange(
                obj["duration"],
                DURATION_MIN,
                DURATION_MAX,
            );

            if (v === undefined) return null;
            return { kind: "duration", duration: v };
        }

        case "shuffle": {
            const v = obj["shuffle"];
            if (typeof v !== "string" || !SHUFFLE_VALUES.has(v)) {
                return null;
            }

            return { kind: "shuffle", shuffle: v as ShuffleType };
        }

        case "seek": {
            const v = obj["seek"];
            if (typeof v !== "string" || !SEEK_VALUES.has(v)) {
                return null;
            }

            return { kind: "seek", seek: v as SeekType };
        }

        case "language": {
            const v = obj["language"];
            if (typeof v !== "string" || !LANGUAGE_VALUES.has(v)) {
                return null;
            }

            return { kind: "language", language: v as LanguageType };
        }

        case "release": {
            const v = obj["release"];
            if (typeof v !== "string" || !RELEASE_VALUES.has(v)) {
                return null;
            }

            return { kind: "release", release: v as ReleaseType };
        }

        case "artisttype": {
            const v = obj["artisttype"];
            if (typeof v !== "string" || !ARTIST_TYPE_VALUES.has(v)) {
                return null;
            }

            return { kind: "artisttype", artisttype: v as ArtistType };
        }

        case "subunits": {
            const v = obj["subunits"];
            if (typeof v !== "string" || !SUBUNITS_VALUES.has(v)) {
                return null;
            }

            return { kind: "subunits", subunits: v as SubunitsPreference };
        }

        case "answer": {
            const v = obj["answer"];
            if (typeof v !== "string" || !ANSWER_TYPE_VALUES.has(v)) {
                return null;
            }

            return { kind: "answer", answer: v as AnswerType };
        }

        case "ost": {
            const v = obj["ost"];
            if (typeof v !== "string" || !OST_VALUES.has(v)) {
                return null;
            }

            return { kind: "ost", ost: v as OstPreference };
        }

        case "special": {
            const v = obj["special"];
            // null is a valid value: it clears the audio modifier.
            if (
                v !== null &&
                (typeof v !== "string" || !SPECIAL_VALUES.has(v))
            ) {
                return null;
            }

            return { kind: "special", special: v as SpecialType | null };
        }

        case "groups":
        case "includes":
        case "excludes": {
            const raw = obj["artistIDs"];
            if (!Array.isArray(raw)) return null;
            if (raw.length > ARTIST_LIST_MAX) return null;
            const artistIDs: number[] = [];
            for (const id of raw) {
                if (
                    typeof id !== "number" ||
                    !Number.isInteger(id) ||
                    id <= 0
                ) {
                    return null;
                }

                artistIDs.push(id);
            }

            return {
                kind: obj["kind"] as "groups" | "includes" | "excludes",
                artistIDs,
            };
        }

        case "playlist": {
            const v = obj["playlistURL"];
            if (v === null) return { kind: "playlist", playlistURL: null };
            // Cap length defensively; the worker validates the URL shape.
            if (typeof v !== "string" || v.length > 2048) return null;
            return { kind: "playlist", playlistURL: v };
        }

        case "reset":
            return { kind: "reset" };

        default:
            return null;
    }
}

export default class KmqWebServer {
    private dbContext: DatabaseContext;

    private activityHub: ActivityHub | null;

    private accessTokenCache: Map<
        string,
        { user: CachedDiscordUser; expiresAt: number }
    > = new Map();

    private instanceCache: Map<
        string,
        {
            guildID: string;
            channelID: string | null;
            participantIDs: Set<string>;
            expiresAt: number;
        }
    > = new Map();

    private wsTicketCache: Map<
        string,
        {
            userID: string;
            instanceId: string;
            guildID: string;
            expiresAt: number;
        }
    > = new Map();

    // OAuth `state` nonces awaiting the web-login callback. `next` is the
    // validated in-site path to land on after login (e.g. an invite link).
    private webOauthStates: Map<string, { expiresAt: number; next: string }> =
        new Map();

    // One-time codes bridging the OAuth callback redirect to the SPA. Values
    // hold the freshly minted session token until the SPA collects it.
    private webLoginCodes: Map<
        string,
        {
            token: string;
            user: CachedDiscordUser;
            expiresAt: number;
        }
    > = new Map();

    private webRoomManager: WebRoomManager | null = null;

    // Live ffmpeg transcodes serving /api/web/audio streams (one per
    // listener), for the global concurrency cap.
    private activeAudioStreams = 0;

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
        const httpServer = fastify({});
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
        const limit = (
            max: number,
        ): { config: { rateLimit: { max: number; timeWindow: string } } } => ({
            config: {
                rateLimit: { max, timeWindow: "1 minute" },
            },
        });

        const activityDistRoot = path.resolve(
            __dirname,
            "..",
            "activity",
            "dist",
        );

        let activityDistExists = false;
        try {
            await fs.promises.access(activityDistRoot);
            activityDistExists = true;
        } catch {
            // dist not present; will skip static handler below
        }

        if (activityDistExists) {
            await httpServer.register(fastifyStatic, {
                root: activityDistRoot,
                prefix: "/activity/",
                decorateReply: false,
            });

            // Discord opens the Activity iframe at the root of the URL Mapping
            // target ("/?instance_id=...&channel_id=..."). Serve index.html
            // there so the SPA can pick up the params from window.location.
            const activityIndexPath = path.join(activityDistRoot, "index.html");

            const serveActivityIndex = async (
                _request: unknown,
                reply: any,
            ): Promise<void> => {
                try {
                    const html = await fs.promises.readFile(
                        activityIndexPath,
                        "utf8",
                    );

                    await reply.type("text/html").send(html);
                } catch (e) {
                    logger.warn(
                        `Failed to serve activity index. err=${
                            (e as Error).message
                        }`,
                    );
                    await reply.code(500).send();
                }
            };

            httpServer.get(
                "/",
                limit(ACTIVITY_RATE_LIMIT_READ),
                serveActivityIndex,
            );

            // The standalone website mounts the same SPA at /play; deep links
            // like /play/r/<room-code> must also resolve to the index so the
            // client can route from the path. Asset URLs are absolute
            // (/activity/...), so serving the index at any depth is safe.
            httpServer.get(
                "/play",
                limit(ACTIVITY_RATE_LIMIT_READ),
                serveActivityIndex,
            );

            httpServer.get(
                "/play/*",
                limit(ACTIVITY_RATE_LIMIT_READ),
                serveActivityIndex,
            );
        } else {
            logger.info(
                `Activity dist not found at ${activityDistRoot}; skipping static handler. Build with 'npm run build:activity' to enable.`,
            );
        }

        httpServer.get("/run_id", {}, async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Fetch RUN_ID attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

            await reply.code(200).send(process.env.RUN_ID);
        });

        httpServer.post("/announce-restart", {}, async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Announce restart attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

            const restartMinutes = (request.body as any)[
                "restartMinutes"
            ] as number;

            await fleet.ipc.allClustersCommand(
                `announce_restart|${restartMinutes}`,
            );

            // Activity/web subscribers get the warning as a live banner; the
            // clusters only reach text channels.
            this.activityHub?.setRestartNotice(
                Date.now() + restartMinutes * 60 * 1000,
            );

            await reply.code(200).send();
        });

        httpServer.post("/clear-restart", {}, async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Clear restart attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

            await fleet.ipc.allClustersCommand("clear_restart");
            this.activityHub?.setRestartNotice(null);
            await reply.code(200).send();
        });

        httpServer.post("/reload-config", {}, async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Reload config attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

            // The admiral process reads feature switches too (web-mode
            // gating), so reload locally in addition to the clusters.
            KmqConfiguration.reload();
            await fleet.ipc.allClustersCommand("reload_config");
            await reply.code(200).send();
        });

        httpServer.post("/voted", {}, async (request, reply) => {
            const requestAuthorizationToken = request.headers["authorization"];
            if (requestAuthorizationToken !== process.env.TOP_GG_WEBHOOK_AUTH) {
                logger.warn(
                    "Webhook received with non-matching authorization token",
                );
                await reply.code(401).send();
                return;
            }

            const userID = (request.body as any)["user"] as string;
            await userVoted(userID);
            await reply.code(200).send();
        });

        // example: curl -X POST 127.0.0.1:5858/eval-central-request-handler  -H "Content-Type: text/plain" -d 'this.ratelimits
        httpServer.post(
            "/eval-central-request-handler",
            {},
            async (request, reply) => {
                if (request.ip !== "127.0.0.1") {
                    logger.error("eval attempted by non-allowed IP");
                    await reply.code(401).send();
                    return;
                }

                const query = request.body as string;

                // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises
                (async function executeEval(command: string) {
                    try {
                        // eslint-disable-next-line no-eval
                        const result = eval(command);
                        await reply.code(200).send({ result });
                    } catch (e) {
                        await reply.code(400).send(`Error: ${e.message}`);
                    }
                }).call(fleet.eris.requestHandler, query);
            },
        );

        httpServer.get("/ping", async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Ping attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

            try {
                const clusterStatuses = (await fleet.ipc.allClustersCommand(
                    "ping",
                    true,
                ))!;

                const allClustersReady = Array.from(
                    clusterStatuses.values(),
                ).every((x) => x === true);

                if (allClustersReady) {
                    await reply.code(200).send("Pong");
                } else {
                    logger.warn("Clusters not ready");
                    await reply.code(503).send();
                }
            } catch (e) {
                logger.error(`Health check on /ping failed with error: ${e}`);
                await reply.code(500).send(e);
            }
        });

        httpServer.get("/session-count", async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("session-count attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

            try {
                const gameplayStats = (await fleet.ipc.allClustersCommand(
                    "game_session_stats",
                    true,
                )) as Map<number, any>;

                const totalSessionCount = Array.from(
                    gameplayStats.values(),
                ).reduce(
                    (partialSum, a) =>
                        partialSum +
                        a.activeListeningSessions +
                        a.activeGameSessions,
                    0,
                );

                await reply.code(200).send(totalSessionCount);
            } catch (e) {
                logger.error(`Session count failed with error: ${e}`);
                await reply.code(500).send(e);
            }
        });

        httpServer.post("/reload_autocomplete", async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Reload autocomplete attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

            try {
                await fleet.ipc.allClustersCommand(
                    "reload_autocomplete_data",
                    true,
                );
                await reply.code(200).send();
            } catch (e) {
                logger.error(`reload_autocomplete failed with: ${e}`);
                await reply.code(500).send(e);
            }
        });

        httpServer.get("/status", async (request, reply) => {
            if (fleet.stats?.guilds === 0) {
                return "KMQ is still starting up. Check back in a few minutes!";
            }

            let gameplayStats: Map<number, any>;
            let fleetStats: Stats;
            let workerVersions: Map<Number, string>;
            try {
                gameplayStats = (await fleet.ipc.allClustersCommand(
                    "game_session_stats",
                    true,
                )) as Map<number, any>;

                workerVersions = (await fleet.ipc.allClustersCommand(
                    "worker_version",
                    true,
                )) as Map<number, any>;

                fleetStats = await fleet.collectStats();
            } catch (e) {
                logger.error(
                    `Error fetching stats for status page. err = ${e}`,
                );
                return "Couldn't retrieve status information. Please try again later.";
            }

            const clusterData: Array<ClusterData> = [];
            for (let i = 0; i < fleetStats.clusters.length; i++) {
                const fleetCluster = fleetStats.clusters[i];
                if (!fleetCluster) {
                    logger.error(`Cluster stats for cluster ${i} missing`);
                    continue;
                }

                const shardData: Array<ShardData> = fleetCluster.shards.map(
                    (rawShardData) => {
                        let healthIndicator: HealthIndicator;
                        if (rawShardData.ready === false)
                            healthIndicator = HealthIndicator.UNHEALTHY;
                        else if (
                            rawShardData.latency &&
                            rawShardData.latency > 300
                        )
                            healthIndicator = HealthIndicator.WARNING;
                        else healthIndicator = HealthIndicator.HEALTHY;
                        return {
                            latency: (rawShardData.latency ?? "?").toString(),
                            status: rawShardData.status,
                            members: rawShardData.members.toLocaleString(),
                            id: rawShardData.id,
                            guilds: rawShardData.guilds.toLocaleString(),
                            healthIndicator,
                        };
                    },
                );

                clusterData.push({
                    id: fleetCluster.id,
                    ram: Math.ceil(fleetCluster.ram).toLocaleString(),
                    apiLatency: Math.ceil(
                        _.mean(fleetCluster.shards.map((x) => x.latency)),
                    ).toLocaleString(),
                    uptime: standardDateFormat(
                        new Date(Date.now() - fleetCluster.uptime),
                    ),
                    version: workerVersions.get(i) as string,
                    voiceConnections: fleetCluster.voice,
                    activeGameSessions: gameplayStats.get(i).activeGameSessions,
                    activePlayers: gameplayStats.get(i).activePlayers,
                    activeListeningSessions:
                        gameplayStats.get(i).activeListeningSessions,
                    activeListeners: gameplayStats.get(i).activeListeners,
                    shardData,
                });
            }

            const databaseLatency = await measureExecutionTime(
                sql`SELECT 1`.execute(this.dbContext.agnostic),
            );

            let databaseLatencyHealthIndicator: HealthIndicator;
            if (databaseLatency < 10)
                databaseLatencyHealthIndicator = HealthIndicator.HEALTHY;
            else if (databaseLatency < 50)
                databaseLatencyHealthIndicator = HealthIndicator.WARNING;
            else databaseLatencyHealthIndicator = HealthIndicator.UNHEALTHY;

            const requestLatency =
                (
                    await this.dbContext.kmq
                        .selectFrom("system_stats")
                        .select(["stat_value"])
                        .where("stat_name", "=", "avg_request_latency")
                        .where(
                            "date",
                            ">",
                            new Date(Date.now() - 2 * 60 * 1000),
                        )
                        .orderBy("date", "desc")
                        .executeTakeFirst()
                )?.stat_value ?? -1;

            let requestLatencyHealthIndicator: HealthIndicator;
            if (requestLatency < 500)
                requestLatencyHealthIndicator = HealthIndicator.HEALTHY;
            else if (requestLatency < 1000)
                requestLatencyHealthIndicator = HealthIndicator.WARNING;
            else requestLatencyHealthIndicator = HealthIndicator.UNHEALTHY;

            const loadAvg = os.loadavg();
            const cpuCount = os.cpus().length;
            let loadAvgHealthIndicator: HealthIndicator;
            if (loadAvg.some((x) => x > cpuCount))
                loadAvgHealthIndicator = HealthIndicator.UNHEALTHY;
            else if (loadAvg.some((x) => x > cpuCount / 2))
                loadAvgHealthIndicator = HealthIndicator.WARNING;
            else loadAvgHealthIndicator = HealthIndicator.HEALTHY;

            const overallStatsData = {
                requestLatency: {
                    latency: requestLatency,
                    healthIndicator: requestLatencyHealthIndicator,
                },
                databaseLatency: {
                    latency: databaseLatency.toFixed(0),
                    healthIndicator: databaseLatencyHealthIndicator,
                },
                loadAverage: {
                    loadAverage: loadAvg.map((x) => x.toFixed(2)).join(", "),
                    healthIndicator: loadAvgHealthIndicator,
                },
                totalVoiceConnections: fleetStats.voice,
                totalRAM: Math.ceil(fleetStats.totalRam).toLocaleString(),
                lastUpdated: new Date(),
                shardCount: fleetStats.shardCount,
                totalActiveGameSessions: clusterData.reduce(
                    (x, y) => x + y.activeGameSessions,
                    0,
                ),
                totalActivePlayers: clusterData.reduce(
                    (x, y) => x + y.activePlayers,
                    0,
                ),
                totalActiveListeningSessions: clusterData.reduce(
                    (x, y) => x + y.activeListeningSessions,
                    0,
                ),
                totalActiveListeners: clusterData.reduce(
                    (x, y) => x + y.activeListeners,
                    0,
                ),
            };

            return reply.view("../templates/index.ejs", {
                clusterData,
                overallStatsData,
            });
        });

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

                    await reply
                        .code(500)
                        .send({ error: "OAuth not configured" });
                    return;
                }

                try {
                    const params = new URLSearchParams();
                    params.set("client_id", process.env.BOT_CLIENT_ID);
                    params.set(
                        "client_secret",
                        process.env.DISCORD_CLIENT_SECRET,
                    );
                    params.set("grant_type", "authorization_code");
                    params.set("code", code);

                    const response = await axios.post(
                        DISCORD_OAUTH_TOKEN_URL,
                        params.toString(),
                        {
                            headers: {
                                "Content-Type":
                                    "application/x-www-form-urlencoded",
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

                    await reply
                        .code(401)
                        .send({ error: "Code exchange failed" });
                }
            },
        );

        this.registerWebAuthRoutes(httpServer, limit);
        this.registerWebRoomRoutes(httpServer, limit);
        this.registerWebAudioRoutes(httpServer, limit);

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
            const header = request.headers["authorization"] as
                | string
                | undefined;

            if (header?.startsWith("Bearer ")) {
                return header.slice(7);
            }

            return undefined;
        };

        httpServer.get(
            "/api/activity/session",
            limit(ACTIVITY_RATE_LIMIT_READ),
            async (request, reply) => {
                if (!this.activityHub) {
                    await reply
                        .code(503)
                        .send({ error: "Activity not enabled" });
                    return;
                }

                const user = await this.resolveAccessToken(
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
                    await reply
                        .code(400)
                        .send({ error: "Missing instance_id" });
                    return;
                }

                const instance = await this.resolveInstanceOrRoom(instanceId);
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
                    const snapshot = await this.activityHub.requestSnapshot(
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
            if (!this.activityHub) {
                await reply.code(503).send({ error: "Activity not enabled" });
                return null;
            }

            const user = await this.resolveAccessToken(extractBearer(request));
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

            const instance = await this.resolveInstanceOrRoom(instanceId);
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
                        ? this.webRoomManager?.getRoomForUser(ctx.user.id)
                        : undefined;

                    const result = await this.activityHub!.startGame({
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
                                  members: [
                                      ...(room?.members.values() ?? []),
                                  ].map((m) => ({
                                      id: m.id,
                                      username: m.username,
                                      avatarUrl: m.avatarUrl,
                                  })),
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
                    const result = await this.activityHub!.skipVote({
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
                    const result = await this.activityHub!.hint({
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
                    const result = await this.activityHub!.emote({
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

        httpServer.get(
            "/api/activity/artist-autocomplete",
            limit(ACTIVITY_RATE_LIMIT_READ),
            async (request, reply) => {
                if (!this.activityHub) {
                    await reply
                        .code(503)
                        .send({ error: "Activity not enabled" });
                    return;
                }

                const user = await this.resolveAccessToken(
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
                        await this.activityHub.autocompleteArtists(query);

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
                if (!this.activityHub) {
                    await reply
                        .code(503)
                        .send({ error: "Activity not enabled" });
                    return;
                }

                const user = await this.resolveAccessToken(
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
                    const response = await this.activityHub.searchSongs(
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
                    await reply
                        .code(400)
                        .send({ error: "Invalid option payload" });
                    return;
                }

                try {
                    const result = await this.activityHub!.setOption({
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
                    await reply
                        .code(400)
                        .send({ error: "Invalid preset action" });
                    return;
                }

                const name =
                    typeof body.name === "string" ? body.name : undefined;

                try {
                    const result = await this.activityHub!.preset({
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
                    const result = await this.activityHub!.profile({
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
                    await reply
                        .code(400)
                        .send({ error: "Missing youtube_link" });
                    return;
                }

                try {
                    const result = await this.activityHub!.songInfo({
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
                    const result = await this.activityHub!.bookmark({
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
                    const result = await this.activityHub!.endGame({
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
                if (!this.activityHub) {
                    await reply
                        .code(503)
                        .send({ error: "Activity not enabled" });
                    return;
                }

                const user = await this.resolveAccessToken(
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

                const instance = await this.resolveInstanceOrRoom(instanceId);
                if (!instance || !instance.participantIDs.has(user.id)) {
                    await reply.code(403).send({ error: "Forbidden" });
                    return;
                }

                try {
                    const result = await this.activityHub.submitGuess(
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
                if (!this.activityHub) {
                    await reply
                        .code(503)
                        .send({ error: "Activity not enabled" });
                    return;
                }

                const user = await this.resolveAccessToken(
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

                const instance = await this.resolveInstanceOrRoom(instanceId);
                if (!instance || !instance.participantIDs.has(user.id)) {
                    await reply.code(403).send({ error: "Forbidden" });
                    return;
                }

                try {
                    const result = await this.activityHub.submitMcGuess(
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
                    await reply
                        .code(400)
                        .send({ error: "Missing instance_id" });
                    return;
                }

                const ticket = uuid.v4();
                this.wsTicketCache.set(ticket, {
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
                if (!this.activityHub) {
                    socket.close(1011, "Activity not enabled");
                    return;
                }

                const ticket = (request.query as any)?.ticket as
                    | string
                    | undefined;

                if (!ticket) {
                    socket.close(4400, "Missing ticket");
                    return;
                }

                const entry = this.wsTicketCache.get(ticket);
                if (!entry || entry.expiresAt < Date.now()) {
                    this.wsTicketCache.delete(ticket);
                    socket.close(4401, "Invalid or expired ticket");
                    return;
                }

                // Single-use — drop the ticket immediately so a leaked URL
                // can't be replayed.
                this.wsTicketCache.delete(ticket);

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

                this.activityHub.subscribe(guildID, subscriber);
                // For web rooms the instance ID is the room code; an open
                // socket is what marks the member present.
                this.webRoomManager?.memberConnected(instanceId, userID);

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
                    if (this.activityHub) {
                        this.activityHub.unsubscribe(guildID, subscriber);
                    }

                    this.webRoomManager?.memberDisconnected(instanceId, userID);
                });

                try {
                    const snapshot =
                        await this.activityHub.requestSnapshot(guildID);

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

    private async resolveAccessToken(
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
    private async resolveInstanceOrRoom(instanceId: string): Promise<{
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

    /**
     * Registers the standalone-website auth routes (/api/web/*): a standard
     * Discord OAuth2 redirect flow that ends in an opaque `web_`-prefixed
     * bearer token the SPA uses exactly like the Activity's access token.
     * All routes 503 while the webModeEnabled feature switch is off.
     * @param httpServer - the fastify instance
     * @param limit - per-route rate-limit config builder
     */
    private registerWebAuthRoutes(
        httpServer: FastifyInstance,
        limit: (max: number) => {
            config: { rateLimit: { max: number; timeWindow: string } };
        },
    ): void {
        // WEB_PUBLIC_BASE_URL is the site origin used to build the OAuth
        // redirect_uri; it falls back to the Activity tunnel URL so a dev
        // setup configured for the Activity works for the website too.
        const webPublicBaseUrl = (): string | null => {
            const base =
                process.env.WEB_PUBLIC_BASE_URL ||
                process.env.ACTIVITY_PUBLIC_BASE_URL;

            return base ? base.replace(/\/+$/, "") : null;
        };

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

        const pruneExpired = (
            map: Map<string, { expiresAt: number }>,
        ): void => {
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

                    await reply
                        .code(500)
                        .send({ error: "OAuth not configured" });
                    return;
                }

                const state = uuid.v4();
                pruneExpired(this.webOauthStates);

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

                this.webOauthStates.set(state, {
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
                const stateEntry = state
                    ? this.webOauthStates.get(state)
                    : undefined;

                const stateValid =
                    !!state &&
                    cookieState === state &&
                    (stateEntry?.expiresAt ?? 0) > Date.now();

                if (state) this.webOauthStates.delete(state);

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
                    params.set(
                        "client_secret",
                        process.env.DISCORD_CLIENT_SECRET,
                    );
                    params.set("grant_type", "authorization_code");
                    params.set("code", query.code);
                    params.set("redirect_uri", `${baseUrl}/api/web/callback`);

                    const tokenResponse = await axios.post(
                        DISCORD_OAUTH_TOKEN_URL,
                        params.toString(),
                        {
                            headers: {
                                "Content-Type":
                                    "application/x-www-form-urlencoded",
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

                    pruneExpired(this.webLoginCodes);
                    const loginCode = uuid.v4();
                    this.webLoginCodes.set(loginCode, {
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

                const entry = this.webLoginCodes.get(loginCode);
                // Single-use: consumed on first attempt, valid or not.
                this.webLoginCodes.delete(loginCode);

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
                    await reply
                        .code(503)
                        .send({ error: "Guest mode disabled" });
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

                const user = await this.resolveAccessToken(token);
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
                    const cached = this.accessTokenCache.get(token);
                    if (cached) {
                        this.webRoomManager?.leaveRoom(cached.user.id);
                    }

                    this.accessTokenCache.delete(token);
                }

                await reply.code(204).send();
            },
        );
    }

    /**
     * Registers the standalone-website room routes (/api/web/room*): create/
     * join/leave/read multiplayer rooms whose invite code doubles as the
     * client's instance_id for every gameplay route. Gated behind the same
     * webModeEnabled feature switch as the auth routes.
     * @param httpServer - the fastify instance
     * @param limit - per-route rate-limit config builder
     */
    private registerWebRoomRoutes(
        httpServer: FastifyInstance,
        limit: (max: number) => {
            config: { rateLimit: { max: number; timeWindow: string } };
        },
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

            if (!this.webRoomManager) {
                await reply.code(503).send({ error: "Rooms not enabled" });
                return null;
            }

            const header = request.headers["authorization"] as
                | string
                | undefined;

            const token = header?.startsWith("Bearer ")
                ? header.slice(7)
                : undefined;

            const user = await this.resolveAccessToken(token);
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

                // Guests can join rooms but never host: free identities
                // shouldn't own persistent per-owner state (game options,
                // presets), and a guest ID fed to roomIDForOwner would
                // collide with the guest ID range (bit 62 already set).
                if (isGuestUserID(user.id)) {
                    await reply.code(403).send({ error: "guest_forbidden" });
                    return;
                }

                const result = this.webRoomManager!.createRoom({
                    id: user.id,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                });

                if ("error" in result) {
                    // Only possible when rejoining one's own still-alive room
                    // that has since filled up.
                    await reply.code(409).send({ error: result.error });
                    return;
                }

                await reply.code(200).send({
                    room: this.webRoomManager!.serializeRoom(result.room),
                });
            },
        );

        httpServer.post(
            "/api/web/room/join",
            limit(ACTIVITY_RATE_LIMIT_LIFECYCLE),
            async (request, reply) => {
                const user = await requireWebUser(request, reply);
                if (!user) return;

                const code = (request.body as { code?: string } | null)?.code;
                if (!code || typeof code !== "string") {
                    await reply.code(400).send({ error: "Missing code" });
                    return;
                }

                const result = this.webRoomManager!.joinRoom(code, {
                    id: user.id,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                });

                if ("error" in result) {
                    await reply
                        .code(result.error === "not_found" ? 404 : 409)
                        .send({ error: result.error });
                    return;
                }

                await reply.code(200).send({
                    room: this.webRoomManager!.serializeRoom(result.room),
                });
            },
        );

        httpServer.post(
            "/api/web/room/leave",
            limit(ACTIVITY_RATE_LIMIT_LIFECYCLE),
            async (request, reply) => {
                const user = await requireWebUser(request, reply);
                if (!user) return;

                this.webRoomManager!.leaveRoom(user.id);
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
                    ? this.webRoomManager!.getRoomByCode(code)
                    : this.webRoomManager!.getRoomForUser(user.id);

                if (!room) {
                    await reply.code(404).send({ error: "No room" });
                    return;
                }

                if (!room.members.has(user.id)) {
                    await reply.code(403).send({ error: "Not a member" });
                    return;
                }

                await reply.code(200).send({
                    room: this.webRoomManager!.serializeRoom(room),
                });
            },
        );
    }

    /**
     * Registers the web-room audio stream route. The token is the bearer
     * capability (audio elements can't attach Authorization headers); it's
     * an unguessable uuid distributed only to the room's subscribers, and it
     * expires with the playback. Each GET spawns a dedicated ffmpeg seeked to
     * the live position, so reloads and late joiners stay in sync.
     * @param httpServer - the fastify instance
     * @param limit - per-route rate-limit config builder
     */
    private registerWebAudioRoutes(
        httpServer: FastifyInstance,
        limit: (max: number) => {
            config: { rateLimit: { max: number; timeWindow: string } };
        },
    ): void {
        httpServer.get(
            `${WEB_AUDIO_URL_PREFIX}/:token`,
            limit(ACTIVITY_RATE_LIMIT_READ),
            async (request, reply) => {
                if (!KmqConfiguration.Instance.webModeEnabled()) {
                    await reply.code(503).send({ error: "Web mode disabled" });
                    return;
                }

                if (!this.activityHub) {
                    await reply
                        .code(503)
                        .send({ error: "Activity hub not available" });
                    return;
                }

                const token = (request.params as { token: string }).token;
                const entry = this.activityHub.getAudioEntry(token);
                if (!entry) {
                    await reply.code(404).send({ error: "Unknown token" });
                    return;
                }

                const args = buildAudioStreamArgs(entry, Date.now());
                if (!args) {
                    await reply.code(410).send({ error: "Playback ended" });
                    return;
                }

                if (
                    this.activeAudioStreams >= WEB_AUDIO_MAX_CONCURRENT_STREAMS
                ) {
                    logger.warn(
                        `Audio stream cap hit (${this.activeAudioStreams} active)`,
                    );

                    await reply
                        .code(503)
                        .send({ error: "Too many active streams" });
                    return;
                }

                this.activeAudioStreams++;
                let released = false;
                const release = (): void => {
                    if (released) return;
                    released = true;
                    this.activeAudioStreams--;
                };

                const child = spawn("ffmpeg", args, {
                    stdio: ["ignore", "pipe", "pipe"],
                });

                // -loglevel error: anything here is a real failure. Drain it
                // regardless so ffmpeg can't block on a full stderr pipe.
                let stderr = "";
                child.stderr.on("data", (chunk: Buffer) => {
                    if (stderr.length < 2048) {
                        stderr += chunk.toString();
                    }
                });

                child.on("close", (code) => {
                    release();
                    if (code !== 0 && code !== null && stderr) {
                        logger.error(
                            `Audio stream ffmpeg failed. gid=${entry.guildID}, code=${code}, err=${stderr.trim()}`,
                        );
                    }
                });

                child.on("error", (e) => {
                    release();
                    logger.error(`Audio stream ffmpeg spawn failed. err=${e}`);
                    if (!reply.sent) {
                        reply
                            .code(500)
                            .send({ error: "Stream unavailable" })
                            .then(
                                () => {},
                                () => {},
                            );
                    }
                });

                // Tab closed / element released: kill the transcode instead
                // of encoding to a dead socket for the rest of the song.
                request.raw.on("close", () => {
                    child.kill("SIGKILL");
                    release();
                });

                await reply
                    .code(200)
                    .header("Content-Type", "audio/mpeg")
                    .header("Cache-Control", "no-store")
                    .header("Accept-Ranges", "none")
                    .send(child.stdout);
            },
        );
    }
}
