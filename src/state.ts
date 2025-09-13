import { DEFAULT_LOCALE } from "./constants.js";
import RateLimiter from "./rate_limiter.js";
import type { IPC } from "eris-fleet";
import type { RedditClient } from "./helpers/reddit_client.js";
import type GameSession from "./structures/game_session.js";
import type GeminiClient from "./helpers/gemini_client.js";
import type KmqClient from "./kmq_client.js";
import type ListeningSession from "./structures/listening_session.js";
import type LocaleType from "./enums/locale_type.js";
import type MatchedArtist from "./interfaces/matched_artist.js";
import type PlaylistManager from "./helpers/playlist_manager.js";
import type RestartNotification from "./interfaces/restart_notification.js";

export default class State {
    static version: string;
    static gameSessions: { [guildID: string]: GameSession } = {};
    static listeningSessions: { [guildID: string]: ListeningSession } = {};
    static client: KmqClient;
    static aliases: {
        artist: { [artistName: string]: Array<string> };
        song: { [songLink: string]: Array<string> };
    } = {
        artist: {},
        song: {},
    };

    static bannedServers: Set<string> = new Set();
    static bannedPlayers: Set<string> = new Set();
    static processStartTime: number = Date.now();
    static runningStats: {
        roundsPlayed: number;
        gamesPlayed: number;
    } = {
        roundsPlayed: 0,
        gamesPlayed: 0,
    };

    static ipc: IPC;
    static rateLimiter = new RateLimiter(15, 30);
    static bonusArtists: Set<string> = new Set<string>();
    static locales: { [guildID: string]: LocaleType } = {};
    static artistToEntry: { [artistNameOrAlias: string]: MatchedArtist } = {};
    static topArtists: Array<MatchedArtist> = [];
    static songLinkToEntry: {
        [songLink: string]: {
            name: string;
            hangulName: string | null;
            artistID: number;
        };
    } = {};

    static newSongs: Array<{
        songLink: string;
        name: string;
        hangulName?: string;
        artistID: number;
    }> = [];

    static restartNotification: RestartNotification | null;
    static playlistManager: PlaylistManager;
    static redditClient: RedditClient;
    static geminiClient: GeminiClient;

    static commandToID: { [commandName: string]: string } = {};
    static getGuildLocale(guildID: string): LocaleType {
        return State.locales[guildID] ?? DEFAULT_LOCALE;
    }
}
