import type ParsedGameOptionValues from "../parsed_game_options_value";
import type TestSuite from "./test_suite";

const BASIC_OPTIONS_TEST_SUITE: TestSuite = {
    tests: [
        {
            command: ",limit 2",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["limit set top"]!.value.startsWith("2 /") &&
                parsedGameOptions!["limit set top"]!.updated,
            isGameOptionsResponse: true,
        },
        {
            command: ",gender coed male",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["gender set"]!.value === "coed, male" &&
                parsedGameOptions!["gender set"]!.updated,
            isGameOptionsResponse: true,
        },
        {
            command: ",groups blackpink, bts",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["groups set"]!.value === "Blackpink, BTS" &&
                parsedGameOptions!["groups set"]!.updated,
            isGameOptionsResponse: true,
        },
        {
            command: ",answer typingtypos",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["answer set"]!.value === "typingtypos" &&
                parsedGameOptions!["answer set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",cutoff 2012 2014",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["cutoff set earliest"]!.value ===
                    "2012 - 2014" &&
                parsedGameOptions!["cutoff set earliest"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",artisttype soloists",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["artisttype set"]!.value === "soloists" &&
                parsedGameOptions!["artisttype set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",release official",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["release set"]!.value === "official" &&
                parsedGameOptions!["release set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",language korean",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["language set"]!.value === "korean" &&
                parsedGameOptions!["language set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",subunits exclude",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["subunits set"]!.value === "exclude" &&
                parsedGameOptions!["subunits set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",ost exclusive",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["ost set"]!.value === "exclusive" &&
                parsedGameOptions!["ost set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",multiguess off",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["multiguess set"]!.value === "off" &&
                parsedGameOptions!["multiguess set"]!.updated,

            isGameOptionsResponse: true,
        },

        {
            command: ",seek beginning",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["seek set"]!.value === "beginning" &&
                parsedGameOptions!["seek set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",special faster",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["special set"]!.value === "faster" &&
                parsedGameOptions!["special set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",guessmode both",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["guessmode set"]!.value === "both" &&
                parsedGameOptions!["guessmode set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",goal 7",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["goal set"]!.value === "7" &&
                parsedGameOptions!["goal set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",timer 24",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["timer set"]!.value === "24 sec" &&
                parsedGameOptions!["timer set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",duration 100",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["duration set"]!.value === "100 mins" &&
                parsedGameOptions!["duration set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",exclude psy",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["exclude set"]!.value === "PSY" &&
                parsedGameOptions!["exclude set"]!.updated,

            isGameOptionsResponse: true,
        },
        {
            command: ",include bts",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["include set"]!.value === "BTS" &&
                parsedGameOptions!["include set"]!.updated,

            isGameOptionsResponse: true,
        },
    ],
    resetEachStage: true,
};

export default BASIC_OPTIONS_TEST_SUITE;
