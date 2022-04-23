import { IPC } from "eris-fleet";
import { LocaleType } from "../enums/locale_type";
import type LocalizationManager from "../helpers/localization_manager";
import type KmqClient from "../kmq_client";
import type RateLimiter from "../rate_limiter";
import type GameSession from "../structures/game_session";
import type MusicSession from "../structures/music_session";
import { Campaign } from "patreon-discord";

export default interface State {
    gameSessions: { [guildID: string]: GameSession };
    musicSessions: { [guildID: string]: MusicSession };
    client: KmqClient;
    aliases: {
        artist: { [artistName: string]: Array<string> };
        song: { [songName: string]: Array<string> };
    };
    processStartTime: number;
    ipc: IPC;
    rateLimiter: RateLimiter;
    bonusArtists: Set<string>;
    locales: { [guildID: string]: LocaleType };
    localizer: LocalizationManager;
    patreonCampaign: Campaign;
}
