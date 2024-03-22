import { KmqResponseType } from "./test_suite";
import type ParsedGameOptionValues from "../parsed_game_options_value";
import type TestSuite from "./test_suite";

// lightweight check to see that bot is still alive and responding to messages
const HEALTH_CHECK_TEST_SUITE: TestSuite = {
    name: "Healthcheck Test",
    tests: [
        {
            command: ",options",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                // also check that available_songs didn't blow up
                parseInt(
                    parsedGameOptions!
                        ["limit set top"]!.value.split("/")[1]
                        ?.trim()!,
                    10,
                ) > 0,
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
    ],
    cascadingFailures: true,
    resetEachStage: true,
};

export default HEALTH_CHECK_TEST_SUITE;
