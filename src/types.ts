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
