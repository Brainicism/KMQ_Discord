import { DEFAULT_LOCALE } from "./constants";
import RateLimiter from "./rate_limiter";
import type { IPC } from "eris-fleet";
import type GameSession from "./structures/game_session";
import type KmqClient from "./kmq_client";
import type ListeningSession from "./structures/listening_session";
import type LocaleType from "./enums/locale_type";
import type MatchedArtist from "./interfaces/matched_artist";

export default class State {
    static version: string;
    static gameSessions: { [guildID: string]: GameSession } = {};
    static listeningSessions: { [guildID: string]: ListeningSession } = {};
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
    static locales: { [guildID: string]: LocaleType } = {};
    static artistToEntry: { [artistNameOrAlias: string]: MatchedArtist } = {};
    static topArtists: Array<MatchedArtist> = [];
    static getGuildLocale(guildID: string): LocaleType {
        return State.locales[guildID] ?? DEFAULT_LOCALE;
    }
}
