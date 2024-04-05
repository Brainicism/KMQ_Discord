/* eslint-disable @typescript-eslint/no-unused-vars */
import { KmqResponseType } from "./test_suite";
import type ParsedGameOptionValues from "../parsed_game_options_value";
import type TestSuite from "./test_suite";

// basic tests to validate most popular user facing options
const BASIC_OPTIONS_TEST_SUITE: TestSuite = {
    name: "Basic Options Test",
    cascadingFailures: false,
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
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command: ",reset",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) => title === "Options",
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
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

            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command:
                ",playlist https://open.spotify.com/playlist/2FJjCCjZ3war3hXypFzJeL",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["playlist set"]!.value.includes("[kpoop]") &&
                parsedGameOptions!["playlist set"]!.updated,
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command:
                ",playlist https://www.youtube.com/watch?v=Gqfq_8jPw8Q&list=PLf3CwmneIZFFkYpy9YC0-tUxD3JrR-3Hs",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
            ) =>
                parsedGameOptions!["playlist set"]!.value.includes("[kpoop]") &&
                parsedGameOptions!["playlist set"]!.updated &&
                description.includes("YouTube"),
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
    ],
};

export default BASIC_OPTIONS_TEST_SUITE;
