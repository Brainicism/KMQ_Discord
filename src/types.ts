import Eris, { GuildTextableChannel } from "eris";
import BaseCommand from "./commands/base_command";
import GameSession from "./structures/game_session";
import BotStatsPoster from "./helpers/bot_stats_poster";
import { Gender } from "./commands/game_options/gender";

export type GuildTextableMessage = Eris.Message<GuildTextableChannel>;

export interface MatchedArtist {
    id: number;
    name: string;
}
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
    publishDate?: Date;
    members?: Gender;
    artistID?: number;
    isSolo?: string;
}

export interface EmbedPayload {
    title: string;
    description?: string;
    footerText?: string;
    thumbnailUrl?: string;
    timestamp?: Date;
    fields?: Eris.EmbedField[];
    author?: {
        username: string;
        avatarUrl: string;
    };
    color?: number;
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
    processStartTime: number;
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
    DURATION = "Duration",
    EXCLUDE = "Exclude",
    INCLUDE = "Include",
    ARTIST_TYPE = "Artist Type",
    LANGUAGE_TYPE = "Language Type",
    SUBUNIT_PREFERENCE = "Subunit Preference",
}

export enum EnvType {
    PROD = "production",
    DEV = "development",
    DRY_RUN = "dry-run",
    TEST = "test",
}
