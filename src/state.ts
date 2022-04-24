import { DEFAULT_LOCALE } from "./constants";
import RateLimiter from "./rate_limiter";
import type { Campaign } from "patreon-discord";
import type { IPC } from "eris-fleet";
import type GameSession from "./structures/game_session";
import type KmqClient from "./kmq_client";
import type LocaleType from "./enums/locale_type";
import type MusicSession from "./structures/music_session";

export default class State {
    static gameSessions: { [guildID: string]: GameSession } = {};

    static musicSessions: { [guildID: string]: MusicSession } = {};

    static client: KmqClient;

    static aliases: {
        artist: { [artistName: string]: Array<string> };
        song: { [songName: string]: Array<string> };
    } = {
        artist: {},
        song: {},
    };

    static processStartTime: number = Date.now();

    static ipc: IPC;

    static rateLimiter = new RateLimiter(15, 30);

    static bonusArtists: Set<string> = new Set<string>();

    static patreonCampaign: Campaign;

    static locales: { [guildID: string]: LocaleType } = {};

    static getGuildLocale(guildID: string): LocaleType {
        return State.locales[guildID] ?? DEFAULT_LOCALE;
    }
}
