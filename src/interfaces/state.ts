import { IPC } from "eris-fleet";
import LocalizationManager, {
    LocaleType,
} from "../helpers/localization_manager";
import KmqClient from "../kmq_client";
import RateLimiter from "../rate_limiter";
import GameSession from "../structures/game_session";
import MusicSession from "../structures/music_session";
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
