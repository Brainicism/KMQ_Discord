/** Builds the per-route rate-limit config passed to fastify route options. */
export type RouteRateLimit = (max: number) => {
    config: { rateLimit: { max: number; timeWindow: string } };
};

export interface CachedDiscordUser {
    id: string;
    username: string;
    /** Discord user locale (e.g. "en-US"). Empty if Discord didn't return one. */
    locale: string;
    avatarUrl: string | null;
    cachedAt: number;
}
