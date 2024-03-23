/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
import { KmqResponseType } from "./test_suite";
import type * as Eris from "eris";
import type ParsedGameOptionValues from "../parsed_game_options_value";
import type TestSuite from "./test_suite";

// lightweight check to see that bot is still alive and responding to messages
const PLAY_TEST_SUITE: TestSuite = {
    name: "Gameplay Test",
    cascadingFailures: true,
    tests: [
        {
            command: ",reset",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => title === "Options",
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command: ",limit 6",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) =>
                parsedGameOptions!["limit set top"]!.value.startsWith("6 /") &&
                parsedGameOptions!["limit set top"]!.updated,
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command: ",shuffle popularity", // deterministic ordering so we can figure out how to guess
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) =>
                parsedGameOptions!["shuffle set"]!.value === "popularity" &&
                parsedGameOptions!["shuffle set"]!.updated,
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command: ",answer typingtypos",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) =>
                parsedGameOptions!["answer set"]!.value === "typingtypos" &&
                parsedGameOptions!["answer set"]!.updated,
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command: ",play",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => {
                const voiceMembers = (
                    client!.getChannel(
                        process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL!,
                    ) as Eris.VoiceChannel
                ).voiceMembers.map((x) => x.id);

                console.log(`voiceMembers: ${voiceMembers.join(", ")}`);
                return voiceMembers.includes(process.env.BOT_CLIENT_ID!);
            },
            expectedResponseType: KmqResponseType.NONE,
        },
        {
            command: ",hint",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => title === "Hint",
            expectedResponseType: KmqResponseType.RAW,
        },
        {
            command: "gangnam style", // gangnam style - psy
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => description.includes("guessed correctly"),
            expectedResponseType: KmqResponseType.RAW,
            preCommandDelay: 2500,
        },
        {
            command: ",guessmode artist",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) =>
                parsedGameOptions!["guessmode set"]!.value === "artist" &&
                parsedGameOptions!["guessmode set"]!.updated,
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command: "blackpink", // ddu du ddu du - blackpink
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => description.includes("guessed correctly"),
            expectedResponseType: KmqResponseType.RAW,
            preCommandDelay: 2500,
        },
        {
            command: ",guessmode both",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) =>
                parsedGameOptions!["guessmode set"]!.value === "both" &&
                parsedGameOptions!["guessmode set"]!.updated,
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        },
        {
            command: "blackpink", // kill this love - blackpink
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => description.includes("guessed correctly"),
            expectedResponseType: KmqResponseType.RAW,

            preCommandDelay: 2500,
        },
        {
            command: "dynamite", // dynamite - bts
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => description.includes("guessed correctly"),
            expectedResponseType: KmqResponseType.RAW,

            preCommandDelay: 2500,
        },
        {
            command: "boy with luv", // boy with luv - bts, now with a guess streak
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) =>
                description.includes("guessed correctly") &&
                description.includes("(🔥5)"),
            expectedResponseType: KmqResponseType.RAW,

            preCommandDelay: 2500,
        },
        {
            command: ",skip",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => true,
            expectedResponseType: KmqResponseType.RAW,
        },
        {
            command: "gangnma style", // gangnam style - psy, lost guess streak, unique songs reset, allow typo
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) =>
                description.includes("guessed correctly") &&
                !description.includes("🔥"),
            expectedResponseType: KmqResponseType.RAW,

            preCommandDelay: 2500,
        },
        {
            command: ",score",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => {
                console.log(description);
                return (
                    title === "Scoreboard" &&
                    description.includes("Your score is 4.7")
                );
            },
            expectedResponseType: KmqResponseType.RAW,
        },
        {
            command: ",end",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => {
                const voiceMembers = (
                    client!.getChannel(
                        process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL!,
                    ) as Eris.VoiceChannel
                ).voiceMembers.map((x) => x.id);

                console.log(`voiceMembers: ${voiceMembers.join(", ")}`);
                return !voiceMembers.includes(process.env.BOT_CLIENT_ID!);
            },
            expectedResponseType: KmqResponseType.NONE,
        },
    ],
    resetEachStage: false,
};

export default PLAY_TEST_SUITE;
