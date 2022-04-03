import Eris, { GuildTextableChannel } from "eris";
import { IPC } from "eris-fleet/dist/util/IPC";

import { Gender } from "./commands/game_options/gender";
import LocalizationManager, {
    LocaleType,
} from "./helpers/localization_manager";
import KmqClient from "./kmq_client";
import RateLimiter from "./rate_limiter";
import GameSession from "./structures/game_session";
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
    songName: string;
    originalSongName: string;
    hangulSongName?: string;
    originalHangulSongName?: string;
    artistName: string;
    hangulArtistName?: string;
    youtubeLink: string;
    publishDate?: Date;
    members?: Gender;
    artistID?: number;
    isSolo?: string;
    views?: number;
    tags?: string;
    language?: string;
    vtype?: string;
}

export interface EmbedPayload {
    title: string;
    url?: string;
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
    components?: Eris.ActionRow[];
}

export interface GameInfoMessage {
    title: string;
    message: string;
    weight: number;
}

export interface State {
    gameSessions: { [guildID: string]: GameSession };
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
}

export enum GameOption {
    LIMIT = "Limit",
    GROUPS = "Groups",
    GENDER = "Gender",
    CUTOFF = "Cutoff",
    ARTIST_TYPE = "Artist Type",
    ANSWER_TYPE = "Answer Type",
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
    FORCE_PLAY_SONG = "Force Play Song",
}

export const GameOptionCommand: { [option: string]: string } = {
    [GameOption.LIMIT]: "limit",
    [GameOption.GROUPS]: "groups",
    [GameOption.GENDER]: "gender",
    [GameOption.CUTOFF]: "cutoff",
    [GameOption.ARTIST_TYPE]: "artisttype",
    [GameOption.ANSWER_TYPE]: "answer",
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
    GameOption.ANSWER_TYPE,
    GameOption.CUTOFF,
];

export const ConflictingGameOptions: { [option: string]: Array<GameOption> } = {
    [GameOption.GROUPS]: [
        GameOption.INCLUDE,
        GameOption.GENDER,
        GameOption.ARTIST_TYPE,
    ],
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
    pointsEarned: number;
}

export enum GameType {
    CLASSIC = "classic",
    ELIMINATION = "elimination",
    TEAMS = "teams",
    COMPETITION = "competition",
}
