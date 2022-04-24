import type { GuildTextableChannel } from "eris";
import type Eris from "eris";
import { GameOption } from "./enums/game_option_name";

export type GuildTextableMessage = Eris.Message<GuildTextableChannel>;
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
