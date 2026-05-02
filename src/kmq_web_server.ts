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
    DEFAULT_LOCALE,
    DISCORD_ACTIVITY_INSTANCE_URL,
    DISCORD_OAUTH_TOKEN_URL,
    DISCORD_USERS_ME_URL,
} from "./constants";
import { IPCLogger } from "./logger";
import { availableGenders } from "./enums/option_types/gender";
import { measureExecutionTime, standardDateFormat } from "./helpers/utils";
import { sql } from "kysely";
import { userVoted } from "./helpers/bot_listing_manager";
import GuessModeType from "./enums/option_types/guess_mode_type";
import LocaleType from "./enums/locale_type";
import MultiGuessType from "./enums/option_types/multiguess_type";
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
import type { ActivitySubscriber } from "./activity_hub";
import type { DatabaseContext } from "./database_context";
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

// Subset of ActivitySetOptionArgs that the client supplies — guildID /
// userID are filled in server-side from the auth context.
type SetOptionBody =
    | { kind: "gender"; genders: GenderModeOptions[] }
    | { kind: "guessMode"; guessMode: GuessModeType }
    | { kind: "multiguess"; multiguess: MultiGuessType };

/**
 * Parses + whitelists the JSON body of POST /api/activity/option. Never
 * trust the client: only accept `kind` + the typed value for that kind,
 * and reject everything else.
 * @param body - Raw JSON body supplied by the request.
 * @returns A validated SetOptionBody, or null if the shape/enum mismatch
 * means the caller should respond 400.
 */
function parseSetOptionBody(body: unknown): SetOptionBody | null {
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

    constructor(
        databaseContext: DatabaseContext,
        activityHub: ActivityHub | null = null,
    ) {
        this.dbContext = databaseContext;
        this.activityHub = activityHub;
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

            httpServer.get(
                "/",
                limit(ACTIVITY_RATE_LIMIT_READ),
                async (request, reply) => {
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
                },
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
            await reply.code(200).send();
        });

        httpServer.post("/clear-restart", {}, async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Clear restart attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

            await fleet.ipc.allClustersCommand("clear_restart");
            await reply.code(200).send();
        });

        httpServer.post("/reload-config", {}, async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Reload config attempted by non-allowed IP");
                await reply.code(401).send();
                return;
            }

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

                const instance = await this.resolveActivityInstance(instanceId);
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

            const instance = await this.resolveActivityInstance(instanceId);
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

                if (!ctx.instance.channelID) {
                    await reply.code(400).send({ error: "Missing channel" });
                    return;
                }

                try {
                    const result = await this.activityHub!.startGame({
                        guildID: ctx.instance.guildID,
                        userID: ctx.user.id,
                        voiceChannelID: ctx.instance.channelID,
                        textChannelID: ctx.instance.channelID,
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

                const instance = await this.resolveActivityInstance(instanceId);
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
