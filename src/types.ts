import Eris, { GuildTextableChannel } from "eris";
import BaseCommand from "./commands/base_command";
import GameSession from "./structures/game_session";
import BotListingManager from "./helpers/bot_listing_manager";
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

interface EndGameMessage {
    title: string;
    message: string;
    weight: number;
}
export interface State {
    commands: { [commandName: string]: BaseCommand };
    gameSessions: { [guildID: string]: GameSession };
    botListingManager: BotListingManager;
    client: Eris.Client;
    aliases: {
        artist: {
            guessAliases: {
                [artistName: string]: Array<string>
            },
            matchAliases: {
                [alias: string]: string
            }
        },
        song: { [songName: string]: Array<string> }
    };
    endGameMessages: {
        kmq: EndGameMessage[],
        game: EndGameMessage[],
    },
    processStartTime: number;
    bonusUsers: Set<string>;
}

export enum GameOption {
    GROUPS = "Groups",
    INCLUDE = "Include",
    EXCLUDE = "Exclude",
    LIMIT = "Limit",
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
    MODE_TYPE = "Guess Mode",
    GOAL = "Goal",
    TIMER = "Timer",
    DURATION = "Duration",
    PRESET = "Preset",
}

export const GameOptionCommand: { [option: string]: string } = {
    [GameOption.GROUPS]: "groups",
    [GameOption.LIMIT]: "limit",
    [GameOption.GENDER]: "gender",
    [GameOption.CUTOFF]: "cutoff",
    [GameOption.ARTIST_TYPE]: "type",
    [GameOption.RELEASE_TYPE]: "release",
    [GameOption.LANGUAGE_TYPE]: "language",
    [GameOption.SUBUNIT_PREFERENCE]: "subunit",
    [GameOption.OST_PREFERENCE]: "ost",
    [GameOption.MULTIGUESS]: "multiguess",
    [GameOption.SHUFFLE_TYPE]: "shuffle",
    [GameOption.SEEK_TYPE]: "seek",
    [GameOption.MODE_TYPE]: "mode",
    [GameOption.GOAL]: "goal",
    [GameOption.TIMER]: "timer",
    [GameOption.DURATION]: "duration",
    [GameOption.INCLUDE]: "include",
    [GameOption.EXCLUDE]: "exclude",
};

export const PriorityGameOption: Array<GameOption> = [
    GameOption.GROUPS,
    GameOption.LIMIT,
    GameOption.GENDER,
    GameOption.CUTOFF,
];

export const ConflictingGameOptions: { [option: string]: Array<GameOption> } = {
    [GameOption.GROUPS]: [GameOption.INCLUDE, GameOption.EXCLUDE, GameOption.GENDER, GameOption.ARTIST_TYPE],
    [GameOption.INCLUDE]: [GameOption.GROUPS],
    [GameOption.EXCLUDE]: [GameOption.GROUPS],
};

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
