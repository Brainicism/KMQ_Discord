import GameOption from "./enums/game_option_name";
import type { GuildTextableWithThreads } from "eris";
import type Eris from "eris";

export type GuildTextableMessage = Eris.Message<GuildTextableWithThreads> & {
    guildID: string;
};
export type EmbedGenerator = () => Promise<Eris.EmbedOptions>;

export const GameOptionCommand: { [option: string]: string } = {
    [GameOption.LIMIT]: "limit",
    [GameOption.GROUPS]: "groups",
    [GameOption.GENDER]: "gender",
    [GameOption.CUTOFF]: "cutoff",
    [GameOption.ARTIST_TYPE]: "artisttype",
    [GameOption.ANSWER_TYPE]: "answer",
    [GameOption.RELEASE_TYPE]: "release",
    [GameOption.LANGUAGE_TYPE]: "language",
    [GameOption.SUBUNIT_PREFERENCE]: "subunits",
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
    [GameOption.PLAYLIST_ID]: "playlist",
};

export const PriorityGameOption: Array<GameOption> = [
    GameOption.LIMIT,
    GameOption.GROUPS,
    GameOption.GENDER,
    GameOption.ANSWER_TYPE,
    GameOption.CUTOFF,
    GameOption.PLAYLIST_ID,
];

export const ConflictingGameOptions: { [option: string]: Array<GameOption> } = {
    [GameOption.GROUPS]: [
        GameOption.INCLUDE,
        GameOption.GENDER,
        GameOption.ARTIST_TYPE,
    ],
};

export type ButtonActionRow = Omit<Eris.ActionRow, "components"> & {
    components: Eris.InteractionButton[];
};
