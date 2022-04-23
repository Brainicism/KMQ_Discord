import { IPC } from "eris-fleet";
import KmqClient from "./kmq_client";
import RateLimiter from "./rate_limiter";
import type GameSession from "./structures/game_session";
import type MusicSession from "./structures/music_session";
import { Campaign } from "patreon-discord";
import LocalizationManager from "./helpers/localization_manager";
import { LocaleType } from "./enums/locale_type";

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
    static localizer = new LocalizationManager();
    static locales: { [guildID: string]: LocaleType } = {};
}
