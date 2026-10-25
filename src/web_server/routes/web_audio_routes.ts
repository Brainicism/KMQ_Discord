import {
    ACTIVITY_RATE_LIMIT_READ,
    WEB_AUDIO_MAX_CONCURRENT_STREAMS,
    WEB_AUDIO_URL_PREFIX,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    buildAudioStreamArgs,
    remainingPlaybackSec,
} from "../../web_audio_registry";
import { spawn } from "child_process";
import KmqConfiguration from "../../kmq_configuration";
import type { FastifyInstance } from "fastify";
import type { RouteRateLimit } from "../types";
import type KmqWebServer from "../../kmq_web_server";

const logger = new IPCLogger("web_server");

/**
 * Registers the web-room audio stream route. The token is the bearer
 * capability (audio elements can't attach Authorization headers); it's
 * an unguessable uuid distributed only to the room's subscribers, and it
 * expires with the playback. Each GET spawns a dedicated ffmpeg seeked to
 * the live position, so reloads and late joiners stay in sync.
 * @param server - the web server (shared caches/state)
 * @param httpServer - the fastify instance
 * @param limit - per-route rate-limit config builder
 */
export default function registerWebAudioRoutes(
    server: KmqWebServer,
    httpServer: FastifyInstance,
    limit: RouteRateLimit,
): void {
    // Live ffmpeg transcodes serving /api/web/audio streams (one per
    // listener), for the global concurrency cap.
    let activeAudioStreams = 0;

    httpServer.get(
        `${WEB_AUDIO_URL_PREFIX}/:token`,
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            if (!KmqConfiguration.Instance.webModeEnabled()) {
                await reply.code(503).send({ error: "Web mode disabled" });
                return;
            }

            if (!server.activityHub) {
                await reply
                    .code(503)
                    .send({ error: "Activity hub not available" });
                return;
            }

            const token = (request.params as { token: string }).token;
            const entry = server.activityHub.getAudioEntry(token);
            if (!entry) {
                // Expected right after a session ends (the entry is
                // dropped while the element re-requests), otherwise a sign
                // the client is chasing a playback that got replaced.
                logger.info(
                    `Audio stream token not found. token=${token.slice(0, 8)}`,
                );

                await reply.code(404).send({ error: "Unknown token" });
                return;
            }

            const now = Date.now();
            const args = buildAudioStreamArgs(entry, now);
            if (!args) {
                logger.info(
                    `Audio stream past its end. gid=${entry.guildID}, elapsed=${((now - entry.mintedAt) / 1000).toFixed(1)}s, duration=${entry.playbackDurationSec}s`,
                );

                await reply.code(410).send({ error: "Playback ended" });
                return;
            }

            if (activeAudioStreams >= WEB_AUDIO_MAX_CONCURRENT_STREAMS) {
                logger.warn(
                    `Audio stream cap hit (${activeAudioStreams} active)`,
                );

                await reply
                    .code(503)
                    .send({ error: "Too many active streams" });
                return;
            }

            activeAudioStreams++;
            let released = false;
            const release = (): void => {
                if (released) return;
                released = true;
                activeAudioStreams--;
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

            const elapsedSec = (now - entry.mintedAt) / 1000;
            logger.info(
                `Audio stream starting. gid=${entry.guildID}, elapsed=${elapsedSec.toFixed(1)}s, remaining=${remainingPlaybackSec(entry, now).toFixed(1)}s, active=${activeAudioStreams}`,
            );

            // Tab closed / element released: kill the transcode instead
            // of encoding to a dead socket for the rest of the song.
            request.raw.on("close", () => {
                // A body cut short is exactly what a listener hears as
                // "the audio stopped" — worth distinguishing from the
                // normal case where the client leaves after we finished.
                if (!reply.raw.writableEnded) {
                    logger.info(
                        `Audio stream client disconnected mid-body. gid=${entry.guildID}, afterSec=${((Date.now() - now) / 1000).toFixed(1)}`,
                    );
                }

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
