/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import * as Eris from "eris";
import { EMBED_ERROR_COLOR, KmqImages } from "../../constants";
import { delay } from "../../helpers/utils";
import { sendDebugAlertWebhook } from "../../helpers/discord_utils";
import BASIC_OPTIONS_TEST_SUITE from "./test_suites/basic_options_test";
import crypto from "crypto";
import type ParsedGameOptionValues from "./parsed_game_options_value";
import type TestSuite from "./test_suites/test_suite";

import { KmqResponseType } from "./test_suites/test_suite";
import { program } from "commander";
import HEALTH_CHECK_TEST_SUITE from "./test_suites/healthcheck_test";
import PLAY_TEST_SUITE from "./test_suites/gameplay_test";

const bot = new Eris.Client(process.env.END_TO_END_TEST_BOT_TOKEN!, {
    gateway: {
        intents: [
            "guildMessages",
            "messageContent",
            "guilds",
            "guildVoiceStates",
        ],
    },
});

program.option("-t, --test-suite <suite>", "The test suite");
program.option(
    "-s, --source <source>",
    "The execution source (i.e: gci, cronjob)",
);

program.parse();
const options = program.opts();

const failedTests: string[] = [];
let TEST_SUITE: TestSuite = BASIC_OPTIONS_TEST_SUITE;
let CURRENT_STAGE: {
    stage: number;
    messageId: string | null;
    processed: boolean;
    ready: boolean;
} | null = null;

let RUN_ID = crypto.randomBytes(8).toString("hex");
let voiceConnection: Eris.VoiceConnection | undefined;

function convertGameOptionsMessage(
    inputString: string,
): ParsedGameOptionValues {
    const lines = inputString.split("\n");
    const result: ParsedGameOptionValues = {};
    const regex = /<\/([^>]+):/;
    for (const line of lines) {
        const splitLine = line.split(":");

        // commands without displayed values
        if (splitLine.length < 3) continue;

        const match = line.match(regex);
        if (match) {
            const capturedText = match[1];
            const optionValue = splitLine.at(-1)!.trim();
            const isUpdated =
                optionValue.startsWith("__") && optionValue.endsWith("__");

            result[capturedText!] = {
                value: isUpdated
                    ? optionValue.substring(2, optionValue.length - 2)
                    : optionValue,
                updated: isUpdated,
            };
        }
    }

    return result;
}

async function sendCommand(message: string): Promise<string> {
    return (
        await bot.createMessage(process.env.END_TO_END_TEST_BOT_CHANNEL!, {
            content: message.replace(",", process.env.BOT_PREFIX!),
            embeds: [
                {
                    footer: {
                        text: RUN_ID,
                    },
                },
            ],
        })
    ).id;
}

let stageTimeout: NodeJS.Timeout | undefined;

async function proceedNextStage(): Promise<void> {
    if (CURRENT_STAGE === null) return;
    const totalTests = TEST_SUITE.tests.length;
    CURRENT_STAGE.stage += 1;
    CURRENT_STAGE.messageId = null;
    CURRENT_STAGE.ready = false;
    CURRENT_STAGE.processed = false;
    if (
        CURRENT_STAGE.stage === TEST_SUITE.tests.length ||
        (TEST_SUITE.cascadingFailures && failedTests.length > 0)
    ) {
        console.log(
            "========================================Test suite completed========================================",
        );

        console.log(`Passed ${totalTests - failedTests.length}/${totalTests}`);
        if (failedTests.length) {
            await sendDebugAlertWebhook(
                `Test Suite '${TEST_SUITE.name}' Failed`,
                `Passed ${totalTests - failedTests.length}/${totalTests}   ${failedTests.length > 0 ? `\nFailed Tests:\n ${failedTests.join("\n ")}` : ""} `,
                EMBED_ERROR_COLOR,
                KmqImages.DEAD,
            );
        }

        if (voiceConnection) {
            getVoiceChannel().leave();
            await delay(1000);
        }

        process.exit(failedTests.length > 0 ? 1 : 0);
    }

    await mainLoop();
}

function getVoiceChannel(): Eris.VoiceChannel {
    const voiceChannel = bot.getChannel(
        process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL!,
    ) as Eris.VoiceChannel | undefined;

    if (!voiceChannel) {
        console.error(
            `Failed to get voice channel ID: ${process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL}`,
        );
        process.exit(1);
    }

    return voiceChannel;
}

async function mainLoop(): Promise<void> {
    if (CURRENT_STAGE === null) {
        console.log(
            `========================================\nBeginning test, RUN_ID = ${RUN_ID} \n========================================`,
        );

        CURRENT_STAGE = {
            stage: 0,
            processed: false,
            messageId: null,
            ready: false,
        };
    }

    console.log(
        `=====================STAGE ${CURRENT_STAGE.stage}===================`,
    );

    const testStage = TEST_SUITE.tests[CURRENT_STAGE.stage]!;
    const command = testStage.command;

    if (stageTimeout) {
        clearTimeout(stageTimeout);
    }

    await ensureVoiceConnection();

    console.log(`STAGE ${CURRENT_STAGE.stage} | Sending command: '${command}'`);
    stageTimeout = setTimeout(async () => {
        console.error(`STAGE ${CURRENT_STAGE!.stage} | Timed out.`);
        failedTests.push(testStage.command);
        await proceedNextStage();
    }, 15000);

    CURRENT_STAGE.ready = true;
    if (testStage.preCommandDelay) {
        await delay(testStage.preCommandDelay);
    }

    CURRENT_STAGE.messageId = await sendCommand(command);
    switch (testStage.expectedResponseType) {
        case KmqResponseType.GAME_OPTIONS_RESPONSE:
        case KmqResponseType.RAW:
            console.log(
                `STAGE ${CURRENT_STAGE.stage} | Expecting response from KMQ before stage validation...`,
            );
            break;
        case KmqResponseType.NONE:
            console.log(
                `STAGE ${CURRENT_STAGE.stage} | Not expecting response.. validate stage immediately`,
            );
            CURRENT_STAGE.processed = true;
            await evaluateStage();
            return;
        default:
            console.error(
                `Unhandled KmqResponseType in mainLoop: ${testStage.expectedResponseType}`,
            );
            break;
    }
}

async function pollVoiceConnectionReady(): Promise<void> {
    const voiceChannel = getVoiceChannel();

    // wait up to 2 minutes for vc to be ready
    for (let i = 0; i < 12; i++) {
        if (voiceChannel.voiceMembers.size === 0) {
            console.log("Voice channel ready!");
            return;
        }

        console.log(
            `Voice channel still occupied, waiting... [${Array.from(
                voiceChannel.voiceMembers,
            )
                .map((x) => x[1].username)
                .join(",")}]`,
        );
        await delay(10000);
    }

    console.log("Timed out waiting for voice channel to be ready");
    process.exit(1);
}

bot.on("ready", async () => {
    await pollVoiceConnectionReady();
    await mainLoop();
});

bot.on("error", (err) => {
    console.error(err);
});

async function evaluateStage(messageResponse?: {
    title: string;
    description: string;
    parsedGameOptions?: ParsedGameOptionValues;
}): Promise<void> {
    if (CURRENT_STAGE === null) {
        console.error("evaluateStage called before test began.");
        process.exit(1);
    }

    if (messageResponse?.parsedGameOptions) {
        const updatedOptions = Object.entries(messageResponse.parsedGameOptions)
            .filter((x) => x[1].updated)
            .map((x) => `${x[0]}: ${x[1].value}`);

        if (updatedOptions.length) {
            console.log(`Updated Options:\n ${updatedOptions.join("\n")}`);
        }
    }

    const testStage = TEST_SUITE.tests[CURRENT_STAGE.stage]!;
    switch (testStage.expectedResponseType) {
        case KmqResponseType.GAME_OPTIONS_RESPONSE:
        case KmqResponseType.RAW:
            // response was already received via messageCreate, no need to wait
            break;
        case KmqResponseType.NONE:
            // if no response was expected, delay to ensure that command was received
            await delay(2500);
            break;
        default:
            console.error(
                `Unhandled KmqResponseType in evaluateStage: ${testStage.expectedResponseType}`,
            );
            break;
    }

    console.log(`STAGE ${CURRENT_STAGE.stage} | Validating stage`);
    const stageOutputValidator = testStage.responseValidator;
    if (
        stageOutputValidator(
            messageResponse?.title!,
            messageResponse?.description!,
            messageResponse?.parsedGameOptions,
            bot,
        )
    ) {
        console.log(`STAGE ${CURRENT_STAGE.stage} | Passed check!`);
    } else {
        console.log(`STAGE ${CURRENT_STAGE.stage} | Failed check!`);
        failedTests.push(testStage.command);
    }

    await proceedNextStage();
}

bot.on("messageCreate", async (msg) => {
    if (msg.author.id !== process.env.BOT_CLIENT_ID) {
        return;
    }

    // When a message is created
    const embeds = msg.embeds;
    if (!embeds.length) {
        return;
    }

    if (!embeds[0]?.footer?.text.includes(RUN_ID)) {
        return;
    }

    if (CURRENT_STAGE === null) {
        console.error("messageCreate called before test began.");
        process.exit(1);
    }

    // response was for a different nessage, already processed a message for the current stage, or the stage hasnt executed yet
    console.log(msg.referencedMessage?.id, CURRENT_STAGE.messageId);
    if (
        msg.referencedMessage?.id !== CURRENT_STAGE.messageId ||
        CURRENT_STAGE.processed ||
        !CURRENT_STAGE.ready
    ) {
        return;
    }

    CURRENT_STAGE.processed = true;
    const embed = embeds[0]!;
    const { title, description, fields, footer } = embed;
    let combinedDescription = `${description}\n`;
    for (const field of fields ?? []) {
        combinedDescription += `${field.value}\n`;
    }

    combinedDescription += `\n${footer!.text}`;

    console.log({ title, description, fields, footer });

    const testStage = TEST_SUITE.tests[CURRENT_STAGE.stage]!;

    let parsedGameOptions: ParsedGameOptionValues | undefined;

    switch (testStage.expectedResponseType) {
        case KmqResponseType.GAME_OPTIONS_RESPONSE:
            parsedGameOptions = convertGameOptionsMessage(combinedDescription);
            break;
        case KmqResponseType.NONE:
            // if no response was expected, dont process incoming ones
            return;
        case KmqResponseType.RAW:
            break;
        default:
            console.error(
                `Unhandled KmqResponseType in messageCreate: ${testStage.expectedResponseType}`,
            );
            break;
    }

    await evaluateStage({
        title: title!,
        description: combinedDescription,
        parsedGameOptions,
    });
});

async function ensureVoiceConnection(): Promise<void> {
    voiceConnection = await bot.joinVoiceChannel(
        process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL!,
        {
            opusOnly: true,
            selfDeaf: true,
        },
    );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    const selectedTestSuite = options.testSuite as string | undefined;
    switch (selectedTestSuite) {
        case "BASIC_OPTIONS":
            TEST_SUITE = BASIC_OPTIONS_TEST_SUITE;
            break;
        case "HEALTH_CHECK":
            TEST_SUITE = HEALTH_CHECK_TEST_SUITE;
            break;
        case "PLAY":
            TEST_SUITE = PLAY_TEST_SUITE;
            break;
        default:
            console.log(`Test suite not found, name = ${selectedTestSuite}`);
            TEST_SUITE = BASIC_OPTIONS_TEST_SUITE;
            break;
    }

    if (TEST_SUITE.resetEachStage) {
        const resetStep = {
            command: ",reset",
            responseValidator: (
                title: string,
                description: string,
                parsedGameOptions?: ParsedGameOptionValues,
                client?: Eris.Client,
            ) => title === "Options",
            expectedResponseType: KmqResponseType.GAME_OPTIONS_RESPONSE,
        };

        // put a reset step before each step
        TEST_SUITE.tests = TEST_SUITE.tests
            .map((item) => [resetStep, item])
            .flat();
    }

    if (!process.env.BOT_CLIENT_ID) {
        console.error("BOT_CLIENT_ID not specified");
        process.exit(1);
    }

    if (
        !process.env.END_TO_END_TEST_BOT_TOKEN ||
        !process.env.END_TO_END_TEST_BOT_CLIENT ||
        !process.env.END_TO_END_TEST_BOT_CHANNEL ||
        !process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL
    ) {
        console.error(
            "END_TO_END_TEST_BOT_TOKEN, END_TO_END_TEST_BOT_CLIENT, END_TO_END_TEST_BOT_VOICE_CHANNEL, or END_TO_END_TEST_BOT_CHANNEL not specified",
        );
        process.exit(1);
    }

    if (options.source) {
        RUN_ID += `-${options.source}`;
    }

    await bot.connect();
})();
