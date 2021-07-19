import Eris, { GuildTextableChannel } from "eris";
import { IPC } from "eris-fleet/dist/util/IPC";
import BaseCommand from "./commands/interfaces/base_command";
import GameSession from "./structures/game_session";
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

export interface EndGameMessage {
    title: string;
    message: string;
    weight: number;
}

export interface State {
    commands: { [commandName: string]: BaseCommand };
    gameSessions: { [guildID: string]: GameSession };
    client: Eris.Client;
    aliases: {
        artist: { [artistName: string]: Array<string> },
        song: { [songName: string]: Array<string> }
    };
    processStartTime: number;
    ipc: IPC;
}

export enum GameOption {
    LIMIT = "Limit",
    GROUPS = "Groups",
    GENDER = "Gender",
    CUTOFF = "Cutoff",
    ARTIST_TYPE = "Artist Type",
    RELEASE_TYPE = "Release Type",
    LANGUAGE_TYPE = "Language Type",
    SUBUNIT_PREFERENCE = "Subunit Preference",
    OST_PREFERENCE = "OST Preference",
    MULTIGUESS = "Multiguess",
    SHUFFLE_TYPE = "Shuffle",
    SEEK_TYPE = "Seek Type",
    SPECIAL_TYPE = "Special Type",
    GUESS_MODE_TYPE = "Guess Mode",
    GOAL = "Goal",
    TIMER = "Timer",
    DURATION = "Duration",
    EXCLUDE = "Exclude",
    INCLUDE = "Include",
    PRESET = "Preset",
}

export const GameOptionCommand: { [option: string]: string } = {
    [GameOption.LIMIT]: "limit",
    [GameOption.GROUPS]: "groups",
    [GameOption.GENDER]: "gender",
    [GameOption.CUTOFF]: "cutoff",
    [GameOption.ARTIST_TYPE]: "artisttype",
    [GameOption.RELEASE_TYPE]: "release",
    [GameOption.LANGUAGE_TYPE]: "language",
    [GameOption.SUBUNIT_PREFERENCE]: "subunit",
    [GameOption.OST_PREFERENCE]: "ost",
    [GameOption.MULTIGUESS]: "multiguess",
    [GameOption.SHUFFLE_TYPE]: "shuffle",
    [GameOption.SEEK_TYPE]: "seek",
    [GameOption.SPECIAL_TYPE]: "special",
    [GameOption.GUESS_MODE_TYPE]: "guessmode",
    [GameOption.GOAL]: "goal",
    [GameOption.TIMER]: "timer",
    [GameOption.DURATION]: "duration",
    [GameOption.EXCLUDE]: "exclude",
    [GameOption.INCLUDE]: "include",
};

export const PriorityGameOption: Array<GameOption> = [
    GameOption.LIMIT,
    GameOption.GROUPS,
    GameOption.GENDER,
    GameOption.CUTOFF,
];

export const ConflictingGameOptions: { [option: string]: Array<GameOption> } = {
    [GameOption.GROUPS]: [GameOption.INCLUDE, GameOption.GENDER, GameOption.ARTIST_TYPE],
};

export enum EnvType {
    PROD = "production",
    DEV = "development",
    DRY_RUN = "dry-run",
    CI = "ci",
    TEST = "test",
}

export interface PlayerRoundResult {
    player: KmqMember;
    streak: number;
    expGain: number;
}

export enum GameType {
    CLASSIC = "classic",
    ELIMINATION = "elimination",
    TEAMS = "teams",
}
