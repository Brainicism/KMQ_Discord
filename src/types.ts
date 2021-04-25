import Eris, { GuildTextableChannel } from "eris";
import BaseCommand from "./commands/base_command";
import GameSession from "./structures/game_session";
import BotStatsPoster from "./helpers/bot_stats_poster";
import { Gender } from "./commands/game_options/gender";
import KmqMember from "./structures/kmq_member";

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
    RELEASE_TYPE = "Release Type",
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
    OST_PREFERENCE = "OST Preference",
    PRESET = "Preset",
    MULTIGUESS = "Multiguess",
}

export const GameOptionCommand: Map<string, string> = new Map([
    [GameOption.GENDER, "gender"],
    [GameOption.CUTOFF, "cutoff"],
    [GameOption.LIMIT, "limit"],
    [GameOption.SEEK_TYPE, "seek"],
    [GameOption.MODE_TYPE, "mode"],
    [GameOption.RELEASE_TYPE, "release"],
    [GameOption.SHUFFLE_TYPE, "shuffle"],
    [GameOption.GROUPS, "groups"],
    [GameOption.GOAL, "goal"],
    [GameOption.TIMER, "timer"],
    [GameOption.DURATION, "duration"],
    [GameOption.EXCLUDE, "exclude"],
    [GameOption.INCLUDE, "include"],
    [GameOption.ARTIST_TYPE, "type"],
    [GameOption.LANGUAGE_TYPE, "language"],
    [GameOption.SUBUNIT_PREFERENCE, "subunit"],
    [GameOption.OST_PREFERENCE, "ost"],
    [GameOption.MULTIGUESS, "multiguess"],
]);

export enum EnvType {
    PROD = "production",
    DEV = "development",
    DRY_RUN = "dry-run",
    TEST = "test",
}

export interface PlayerRoundResult {
    player: KmqMember;
    streak: number;
    expGain: number;
}
