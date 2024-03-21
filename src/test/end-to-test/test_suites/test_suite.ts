import type ParsedGameOptionValues from "../parsed_game_options_value";

export default interface TestSuite {
    tests: {
        command: string;
        responseValidator: (
            title: string,
            description: string,
            parsedGameOptions?: ParsedGameOptionValues,
        ) => boolean;
        isGameOptionsResponse: boolean;
    }[];
    resetEachStage: boolean;
}
