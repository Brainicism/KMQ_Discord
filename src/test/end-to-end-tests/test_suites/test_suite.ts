import type * as Eris from "eris";
import type ParsedGameOptionValues from "../parsed_game_options_value";

export default interface TestSuite {
    name: string;
    tests: {
        command: string;
        responseValidator: (
            title: string,
            description: string,
            parsedGameOptions?: ParsedGameOptionValues,
            client?: Eris.Client,
        ) => boolean;
        expectedResponseType: KmqResponseType;
        prevalidationDelay?: number;
        preCommandDelay?: number;
    }[];
    cascadingFailures: boolean;
}

export enum KmqResponseType {
    GAME_OPTIONS_RESPONSE,
    RAW,
    NONE,
}
