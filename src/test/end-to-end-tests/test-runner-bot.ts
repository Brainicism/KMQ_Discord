/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import * as Eris from "eris";
import { EMBED_ERROR_COLOR, KmqImages } from "../../constants";
import { delay } from "../../helpers/utils";
import { sendInfoWebhook } from "../../helpers/discord_utils";
import BASIC_OPTIONS_TEST_SUITE from "./test_suites/basic_options_test";
import crypto from "crypto";
import type ParsedGameOptionValues from "./parsed_game_options_value";
import type TestSuite from "./test_suites/test_suite";

import { KmqResponseType } from "./test_suites/test_suite";
import { program } from "commander";
import Axios from "axios";
import HEALTH_CHECK_TEST_SUITE from "./test_suites/healthcheck_test";
import PLAY_TEST_SUITE from "./test_suites/gameplay_test";

function log(msg: string): void {
    console.log(`${new Date().toISOString()} | ${msg}`);
}

function debug(msg: string): void {
    if (options.debug) {
        console.log(`DEBUG: ${new Date().toISOString()} | ${msg}`);
    }
}

// eslint-disable-next-line consistent-return
async function getKmqRunId(): Promise<string> {
    try {
        return (
            await Axios.get(
                `http://127.0.0.1:${process.env.WEB_SERVER_PORT}/run_id`,
            )
        ).data;
    } catch (e) {
        console.error(`Error fetching RUN_ID, is KMQ running? e = ${e}`);
        process.exit(1);
    }
}

function logError(msg: string): void {
    console.error(`${new Date().toISOString()} | ${msg}`);
}

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

program
    .option("-t, --test-suite <suite>", "The test suite")
    .option("-d, --debug")
    .option("--stage-delay <seconds>", "Delay between test stages", (x) =>
        parseFloat(x),
    );

program.parse();
const options = program.opts();

const failedTests: string[] = [];
let TEST_SUITE: TestSuite = BASIC_OPTIONS_TEST_SUITE;
let CURRENT_STAGE: {
    stage: number;
    commandExecuted: string | null;
    processed: boolean;
    ready: boolean;
} | null = null;

let RUN_ID: string;
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
            const optionValue = splitLine.slice(2).join(":").trim();
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
    if (!CURRENT_STAGE) {
        return "";
    }

    const command = message.replace(",", process.env.BOT_PREFIX!);
    CURRENT_STAGE.commandExecuted = command;
    return (
        await bot.createMessage(process.env.END_TO_END_TEST_BOT_CHANNEL!, {
            content: command,
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
    CURRENT_STAGE.commandExecuted = null;
    CURRENT_STAGE.ready = false;
    CURRENT_STAGE.processed = false;
    if (
        CURRENT_STAGE.stage === TEST_SUITE.tests.length ||
        (TEST_SUITE.cascadingFailures && failedTests.length > 0)
    ) {
        log(
            "========================================Test suite completed========================================",
        );

        if (failedTests.length) {
            const message = !TEST_SUITE.cascadingFailures
                ? `Passed ${totalTests - failedTests.length}/${totalTests}   ${failedTests.length > 0 ? `\nFailed Tests:\n ${failedTests.join("\n ")}` : ""} `
                : `Failed Test During Step: ${failedTests.join("\n")}`;

            log(message);

            await sendInfoWebhook(
                process.env.ALERT_WEBHOOK_URL!,
                `Test Suite '${TEST_SUITE.name}' Failed`,
                message,
                EMBED_ERROR_COLOR,
                KmqImages.DEAD,
                "Kimiqo",
            );
        }

        if (voiceConnection) {
            getVoiceChannel().leave();
            await delay(1000);
        }

        process.exit(failedTests.length > 0 ? 1 : 0);
    }

    if (options.stageDelay) {
        log(`Waiting ${options.stageDelay * 1000}ms`);
        await delay(options.stageDelay * 1000);
    }

    await mainLoop();
}

function getVoiceChannel(): Eris.VoiceChannel {
    const voiceChannel = bot.getChannel(
        process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL!,
    ) as Eris.VoiceChannel | undefined;

    if (!voiceChannel) {
        logError(
            `Failed to get voice channel ID: ${process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL}`,
        );
        process.exit(1);
    }

    return voiceChannel;
}

async function mainLoop(): Promise<void> {
    if (CURRENT_STAGE === null) {
        log(
            `========================================\nBeginning test, RUN_ID = ${RUN_ID} \n========================================`,
        );

        await ensureVoiceConnection();
        CURRENT_STAGE = {
            stage: 0,
            processed: false,
            commandExecuted: null,
            ready: false,
        };
    }

    log(`=====================STAGE ${CURRENT_STAGE.stage}===================`);

    const testStage = TEST_SUITE.tests[CURRENT_STAGE.stage]!;
    const command = testStage.command;

    if (stageTimeout) {
        clearTimeout(stageTimeout);
    }

    stageTimeout = setTimeout(async () => {
        logError(`STAGE ${CURRENT_STAGE!.stage} | Timed out.`);
        failedTests.push(testStage.command);
        await proceedNextStage();
    }, 15000);

    if (testStage.preCommandDelay) {
        log(
            `STAGE ${CURRENT_STAGE.stage} | Waiting ${testStage.preCommandDelay}ms`,
        );
        await delay(testStage.preCommandDelay);
    }

    CURRENT_STAGE.ready = true;
    CURRENT_STAGE.processed = false;
    log(`STAGE ${CURRENT_STAGE.stage} | Sending command: '${command}'`);
    await sendCommand(command);
    switch (testStage.expectedResponseType) {
        case KmqResponseType.GAME_OPTIONS_RESPONSE:
        case KmqResponseType.RAW:
            log(
                `STAGE ${CURRENT_STAGE.stage} | Expecting response from KMQ before stage validation...`,
            );
            break;
        case KmqResponseType.NONE:
            log(
                `STAGE ${CURRENT_STAGE.stage} | Not expecting response.. validate stage immediately`,
            );
            await evaluateStage();
            return;
        default:
            logError(
                `Unhandled KmqResponseType in mainLoop: ${testStage.expectedResponseType}`,
            );
            break;
    }
}

async function pollVoiceConnectionReady(): Promise<void> {
    const voiceChannel = getVoiceChannel();

    // wait up to 5 minutes for vc to be ready
    for (let i = 0; i < 30; i++) {
        if (voiceChannel.voiceMembers.size === 0) {
            log("Voice channel ready!");
            return;
        }

        log(
            `Voice channel still occupied, waiting... [${Array.from(
                voiceChannel.voiceMembers,
            )
                .map((x) => x[1].username)
                .join(",")}]`,
        );
        await delay(10000);
    }

    log("Timed out waiting for voice channel to be ready");
    process.exit(1);
}

bot.on("ready", async () => {
    await pollVoiceConnectionReady();
    await mainLoop();
});

bot.on("error", (err) => {
    logError(JSON.stringify(err));
});

async function evaluateStage(messageResponse?: {
    title: string;
    description: string;
    parsedGameOptions?: ParsedGameOptionValues;
}): Promise<boolean> {
    if (CURRENT_STAGE === null) {
        logError("evaluateStage called before test began.");
        process.exit(1);
    }

    if (messageResponse?.parsedGameOptions) {
        const updatedOptions = Object.entries(messageResponse.parsedGameOptions)
            .filter((x) => x[1].updated)
            .map((x) => `${x[0]}: ${x[1].value}`);

        if (updatedOptions.length) {
            log(`Updated Options:\n ${updatedOptions.join("\n")}`);
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
            logError(
                `Unhandled KmqResponseType in evaluateStage: ${testStage.expectedResponseType}`,
            );
            break;
    }

    log(`STAGE ${CURRENT_STAGE.stage} | Validating stage`);
    const stageOutputValidator = testStage.responseValidator;
    if (
        stageOutputValidator(
            messageResponse?.title!,
            messageResponse?.description!,
            messageResponse?.parsedGameOptions,
            bot,
        )
    ) {
        log(`STAGE ${CURRENT_STAGE.stage} | Passed check!`);
        CURRENT_STAGE.processed = true;
        await proceedNextStage();
        return true;
    } else {
        log(
            `STAGE ${CURRENT_STAGE.stage} | Current message failed check, waiting for next...`,
        );
        return false;
    }
}

bot.on("messageCreate", async (msg) => {
    if (!CURRENT_STAGE) {
        return;
    }

    if (msg.author.id !== process.env.BOT_CLIENT_ID) {
        return;
    }

    // When a message is created
    const embeds = msg.embeds;
    if (!embeds.length) {
        return;
    }

    const embed = embeds[0]!;
    const { title, description, fields, footer } = embed;
    debug(
        `Received messageCreate. \nProcessed: ${CURRENT_STAGE.processed}\nStage Ready:${CURRENT_STAGE!.ready}\ntitle = ${embed.title}\nFooter=${footer?.text}\nCurrent Command:${CURRENT_STAGE.commandExecuted}`,
    );

    // response was for a different nessage, already processed a message for the current stage, or the stage hasnt executed yet
    if (CURRENT_STAGE.processed || !CURRENT_STAGE.ready) {
        return;
    }

    let combinedDescription = `${description}\n`;
    for (const field of fields ?? []) {
        combinedDescription += `${field.value}\n`;
    }

    if (!footer) return;
    combinedDescription += `\n${footer.text}`;

    log(
        `STAGE ${CURRENT_STAGE.stage} | Received response: ${JSON.stringify({ title, description, fields, footer })}}`,
    );

    if (!footer.text.includes(`${RUN_ID}|${CURRENT_STAGE.commandExecuted}`)) {
        return;
    }

    const testStage = TEST_SUITE.tests[CURRENT_STAGE.stage]!;

    let parsedGameOptions: ParsedGameOptionValues | undefined;

    switch (testStage.expectedResponseType) {
        case KmqResponseType.GAME_OPTIONS_RESPONSE:
            parsedGameOptions = convertGameOptionsMessage(combinedDescription);
            if (Object.keys(parsedGameOptions).length === 0) {
                debug("Non-game options message received, skipping..");
                return;
            }

            break;
        case KmqResponseType.NONE:
            // if no response was expected, dont process incoming ones
            return;
        case KmqResponseType.RAW:
            break;
        default:
            logError(
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
            log(`Test suite not found, name = ${selectedTestSuite}`);
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
        logError("BOT_CLIENT_ID not specified");
        process.exit(1);
    }

    if (
        !process.env.END_TO_END_TEST_BOT_TOKEN ||
        !process.env.END_TO_END_TEST_BOT_CLIENT ||
        !process.env.END_TO_END_TEST_BOT_CHANNEL ||
        !process.env.END_TO_END_TEST_BOT_VOICE_CHANNEL
    ) {
        logError(
            "END_TO_END_TEST_BOT_TOKEN, END_TO_END_TEST_BOT_CLIENT, END_TO_END_TEST_BOT_VOICE_CHANNEL, or END_TO_END_TEST_BOT_CHANNEL not specified",
        );
        process.exit(1);
    }

    RUN_ID = await getKmqRunId();
    await bot.connect();
})();

process.on("SIGINT", async () => {
    log("Caught SIGINT, leaving voice channel");
    if (voiceConnection) {
        getVoiceChannel().leave();
        await delay(1000);
    }

    process.exit(1);
});
