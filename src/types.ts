import Eris from "eris";
import BaseCommand from "./commands/base_command";
import GameSession from "./structures/game_session";
import BotStatsPoster from "./helpers/bot_stats_poster";

export interface ParsedMessage {
    action: string;
    argument: string;
    message: string;
    components: Array<string>;
}

export interface QueriedSong {
    name: string;
    artist: string;
    youtubeLink: string;
}

export interface MessageContext {
    channel: Eris.GuildTextableChannel;
    user?: {
        username: string;
        id: string;
        avatarURL: string;
    };
}

export interface State {
    commands: { [commandName: string]: BaseCommand };
    gameSessions: { [guildID: string]: GameSession };
    botStatsPoster: BotStatsPoster;
    client: Eris.Client;
    aliases: {
        artist: { [artistName: string]: Array<string> },
        song: { [songName: string]: Array<string> }
    };
}

export enum GameOption {
    GENDER = "Gender",
    CUTOFF = "Cutoff",
    LIMIT = "Limit",
    VOLUME = "Volume",
    SEEK_TYPE = "Seek Type",
    MODE_TYPE = "Guess Mode",
    SHUFFLE_TYPE = "Shuffle",
    GROUPS = "Groups",
    GOAL = "Goal",
    TIMER = "Timer",
    EXCLUDE = "Exclude",
    ARTIST_TYPE = "Artist Type",
    LANGUAGE_TYPE = "Language Type",
}

export enum EnvType {
    PROD = "production",
    DEV = "development",
    DRY_RUN = "dry-run",
}
