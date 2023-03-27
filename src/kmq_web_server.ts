import { IPCLogger } from "./logger";
import { measureExecutionTime, standardDateFormat } from "./helpers/utils";
import { userVoted } from "./helpers/bot_listing_manager";
import _ from "lodash";
import ejs from "ejs";
import fastify from "fastify";
import fastifyView from "@fastify/view";
import os from "os";
import type { DatabaseContext } from "./database_context";
import type { Fleet, Stats } from "eris-fleet";

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

export default class KmqWebServer {
    private dbContext: DatabaseContext;
    constructor(databaseContext: DatabaseContext) {
        this.dbContext = databaseContext;
    }

    /**
     * @param fleet - The fleet instance
     * Starts web server
     * */
    async startWebServer(fleet: Fleet): Promise<void> {
        const httpServer = fastify({});
        httpServer.register(fastifyView, {
            engine: {
                ejs,
            },
        });

        httpServer.post("/announce-restart", {}, async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Announce restart attempted by non-allowed IP");
                reply.code(401).send();
                return;
            }

            const restartMinutes = (request.body as any)[
                "restartMinutes"
            ] as number;

            await fleet.ipc.allClustersCommand(
                `announce_restart|${restartMinutes}`
            );
            reply.code(200).send();
        });

        httpServer.post("/clear-restart", {}, async (request, reply) => {
            if (request.ip !== "127.0.0.1") {
                logger.error("Clear restart attempted by non-allowed IP");
                reply.code(401).send();
                return;
            }

            await fleet.ipc.allClustersCommand("clear_restart");
            reply.code(200).send();
        });

        httpServer.post("/voted", {}, async (request, reply) => {
            const requestAuthorizationToken = request.headers["authorization"];
            if (requestAuthorizationToken !== process.env.TOP_GG_WEBHOOK_AUTH) {
                logger.warn(
                    "Webhook received with non-matching authorization token"
                );
                reply.code(401).send();
                return;
            }

            const userID = (request.body as any)["user"] as string;
            await userVoted(userID);
            reply.code(200).send();
        });

        // example: curl -X POST 127.0.0.1:5858/eval-central-request-handler  -H "Content-Type: text/plain" -d 'this.ratelimits
        httpServer.post(
            "/eval-central-request-handler",
            {},
            async (request, reply) => {
                if (request.ip !== "127.0.0.1") {
                    logger.error("Clear restart attempted by non-allowed IP");
                    reply.code(401).send();
                    return;
                }

                const query = request.body as string;

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (function executeEval(command: string) {
                    try {
                        // eslint-disable-next-line no-eval
                        const result = eval(command);
                        reply.code(200).send({ result });
                    } catch (e) {
                        reply.code(400).send(`Error: ${e.message}`);
                    }
                }.call(fleet.eris.requestHandler, query));
            }
        );

        httpServer.get("/ping", async (request, reply) => {
            reply.code(200).send();
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
                    true
                )) as Map<number, any>;

                workerVersions = (await fleet.ipc.allClustersCommand(
                    "worker_version",
                    true
                )) as Map<number, any>;

                fleetStats = await fleet.collectStats();
            } catch (e) {
                logger.error(
                    `Error fetching stats for status page. err = ${e}`
                );
                return "Couldn't retrieve status information. Please try again later.";
            }

            const clusterData: Array<ClusterData> = [];
            for (let i = 0; i < fleetStats.clusters.length; i++) {
                const fleetCluster = fleetStats.clusters[i];
                const shardData: Array<ShardData> = fleetCluster.shards.map(
                    (rawShardData) => {
                        let healthIndicator: HealthIndicator;
                        if (rawShardData.ready === false)
                            healthIndicator = HealthIndicator.UNHEALTHY;
                        else if (rawShardData.latency > 300)
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
                    }
                );

                clusterData.push({
                    id: fleetCluster.id,
                    ram: Math.ceil(fleetCluster.ram).toLocaleString(),
                    apiLatency: _.mean(
                        fleetCluster.shards.map((x) => x.latency)
                    ).toLocaleString(),
                    uptime: standardDateFormat(
                        new Date(Date.now() - fleetCluster.uptime)
                    ),
                    version: workerVersions.get(i) as string,
                    voiceConnections: fleetCluster.voice,
                    activeGameSessions: gameplayStats.get(i).activeGameSessions,
                    activePlayers: gameplayStats.get(i).activePlayers,
                    shardData,
                });
            }

            const databaseLatency = await measureExecutionTime(
                this.dbContext.kmq.raw("SELECT 1;")
            );

            let databaseLatencyHealthIndicator: HealthIndicator;
            if (databaseLatency < 10)
                databaseLatencyHealthIndicator = HealthIndicator.HEALTHY;
            else if (databaseLatency < 50)
                databaseLatencyHealthIndicator = HealthIndicator.WARNING;
            else databaseLatencyHealthIndicator = HealthIndicator.UNHEALTHY;

            const requestLatency =
                fleetStats.centralRequestHandlerLatencyRef?.latency ?? -1;

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
                cachedUsers: fleetStats.users.toLocaleString(),
                totalMembers: fleetStats.members.toLocaleString(),
                totalVoiceConnections: fleetStats.voice,
                totalRAM: Math.ceil(fleetStats.totalRam).toLocaleString(),
                lastUpdated: new Date(),
                shardCount: fleetStats.shardCount,
                totalActiveGameSessions: clusterData.reduce(
                    (x, y) => x + y.activeGameSessions,
                    0
                ),
                totalActivePlayers: clusterData.reduce(
                    (x, y) => x + y.activePlayers,
                    0
                ),
            };

            return reply.view("../templates/index.ejs", {
                clusterData,
                overallStatsData,
            });
        });

        try {
            if (!process.env.WEB_SERVER_PORT) {
                logger.warn(
                    "WEB_SERVER_PORT not specified, not starting web server"
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
}
