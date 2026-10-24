import {
    ACTIVITY_RATE_LIMIT_READ,
    DOCS_BASE_URL,
    LEGACY_DOC_PATHS,
} from "../../constants";
import { IPCLogger } from "../../logger";
import { siteOrigin } from "../web_server_utils";
import fastifyStatic from "@fastify/static";
import fs from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";
import type { RouteRateLimit } from "../types";
import type KmqWebServer from "../../kmq_web_server";

const logger = new IPCLogger("web_server");

/**
 * Registers the website/Activity static bundle and crawler-facing routes
 * (robots.txt, sitemap, legacy doc redirects).
 * @param server - the web server (shared caches/state)
 * @param httpServer - the fastify instance
 * @param limit - per-route rate-limit config builder
 */
export default async function registerSiteRoutes(
    server: KmqWebServer,
    httpServer: FastifyInstance,
    limit: RouteRateLimit,
): Promise<void> {
    const activityDistRoot = path.resolve(
        __dirname,
        "..",
        "..",
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

        // The SPA's <head> carries the crawler-facing tags (canonical,
        // Open Graph, JSON-LD) with a placeholder origin, substituted here
        // so a self-hosted deployment advertises its own URL rather than
        // whatever the file was built against.
        const SITE_ORIGIN_PLACEHOLDER = "__KMQ_SITE_ORIGIN__";

        const serveActivityIndex = async (
            request: any,
            reply: any,
        ): Promise<void> => {
            try {
                const html = await fs.promises.readFile(
                    activityIndexPath,
                    "utf8",
                );

                // Room invite links are private and short-lived; keep them
                // out of search results even though they serve the same
                // indexable shell as the landing page.
                if (String(request.url).startsWith("/play/r/")) {
                    reply.header("X-Robots-Tag", "noindex, nofollow");
                }

                const origin =
                    siteOrigin() ?? `${request.protocol}://${request.hostname}`;

                await reply
                    .type("text/html")
                    .send(html.split(SITE_ORIGIN_PLACEHOLDER).join(origin));
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

    // ─── Crawler-facing files for the standalone website ───────────────
    // nginx proxies the whole public origin here, so robots.txt and the
    // sitemap have to come from this server — there's no static docroot
    // in front of it to drop them in.
    httpServer.get(
        "/robots.txt",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (_request, reply) => {
            const origin = siteOrigin();
            const lines = [
                "User-agent: *",
                // API/websocket routes return JSON or upgrade; room links
                // are private invites (also sent as X-Robots-Tag when the
                // page itself is served).
                "Disallow: /api/",
                "Disallow: /ws/",
                "Disallow: /play/r/",
                "Allow: /",
                "",
            ];

            if (origin) {
                lines.push(`Sitemap: ${origin}/sitemap.xml`, "");
            }

            await reply
                .type("text/plain; charset=utf-8")
                .send(lines.join("\n"));
        },
    );

    httpServer.get(
        "/sitemap.xml",
        limit(ACTIVITY_RATE_LIMIT_READ),
        async (request, reply) => {
            const origin =
                siteOrigin() ?? `${request.protocol}://${request.hostname}`;

            // Only the landing page: /play serves the same SPA and
            // canonicalizes to "/", and room URLs are deliberately
            // excluded above.
            await reply.type("application/xml; charset=utf-8").send(
                `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${origin}/</loc>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>
`,
            );
        },
    );

    // Legacy documentation links — the bot's Discord/top.gg listings and
    // older README revisions point at <origin>/PRIVACY and friends, which
    // started 404ing once the SPA took over the origin. 301 them to the
    // docs site so the links keep working and their ranking signal lands
    // on a page that exists.
    for (const doc of LEGACY_DOC_PATHS) {
        httpServer.get(
            `/${doc}`,
            limit(ACTIVITY_RATE_LIMIT_READ),
            async (_request, reply) => {
                await reply.redirect(`${DOCS_BASE_URL}/${doc}`, 301);
            },
        );
    }
}
