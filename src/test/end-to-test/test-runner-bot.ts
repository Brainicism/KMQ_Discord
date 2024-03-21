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

import { program } from "commander";
import HEALTH_CHECK_TEST_SUITE from "./test_suites/healthcheck_test";

const bot = new Eris.Client(process.env.END_TO_END_TEST_BOT_TOKEN!, {
    gateway: {
        intents: ["guildMessages", "messageContent"],
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
let CURRENT_STAGE: number | null = null;

let RUN_ID = crypto.randomBytes(8).toString("hex");

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

async function sendCommand(message: string): Promise<void> {
    await bot.createMessage(process.env.END_TO_END_TEST_BOT_CHANNEL!, {
        content: message.replace(",", process.env.BOT_PREFIX!),
        embeds: [
            {
                footer: {
                    text: RUN_ID,
                },
            },
        ],
    });
}

let stageTimeout: NodeJS.Timeout | undefined;

async function proceedNextStage(): Promise<void> {
    if (CURRENT_STAGE === null) return;
    const totalTests = TEST_SUITE.tests.length;
    CURRENT_STAGE += 1;
    if (CURRENT_STAGE === TEST_SUITE.tests.length) {
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

        process.exit(failedTests.length > 0 ? 1 : 0);
    }

    await delay(2000);
    await mainLoop();
}

async function mainLoop(): Promise<void> {
    if (CURRENT_STAGE === null) {
        console.log(
            `========================================\nBeginning test, RUN_ID = ${RUN_ID} \n========================================`,
        );
        CURRENT_STAGE = 0;
    }

    console.log(
        `=====================STAGE ${CURRENT_STAGE}===================`,
    );

    const stageData = TEST_SUITE.tests[CURRENT_STAGE]!;
    const command = stageData.command;
    if (TEST_SUITE.resetEachStage) {
        await sendCommand(",reset");

        console.log(
            `STAGE ${CURRENT_STAGE} | Sending pre-test command: ',reset'`,
        );
        await delay(2000);
    }

    if (stageTimeout) {
        clearTimeout(stageTimeout);
    }

    console.log(`STAGE ${CURRENT_STAGE} | Sending command: '${command}'`);
    stageTimeout = setTimeout(async () => {
        console.error(`STAGE ${CURRENT_STAGE} | Timed out.`);
        failedTests.push(stageData.command);
        await proceedNextStage();
    }, 15000);
    await sendCommand(command);
}

bot.on("ready", async () => {
    await mainLoop();
});

bot.on("error", (err) => {
    console.error(err);
});

bot.on("messageCreate", async (msg) => {
    if (msg.author.id !== process.env.BOT_CLIENT_ID) {
        return;
    }

    // When a message is created
    const embeds = msg.embeds;
    if (!embeds.length) {
        return;
    }

    if (embeds[0]?.footer?.text !== RUN_ID) {
        return;
    }

    // ignore resets
    if (msg.referencedMessage?.content === `${process.env.BOT_PREFIX!}reset`)
        return;

    const embed = embeds[0]!;
    const { title, description, fields } = embed;
    let combinedDescription = `${description}\n`;
    for (const field of fields ?? []) {
        combinedDescription += `${field.value}\n`;
    }

    if (CURRENT_STAGE === null) {
        console.error("messageCreate called before test began.");
        process.exit(1);
    }

    const testStage = TEST_SUITE.tests[CURRENT_STAGE]!;
    console.log(`STAGE ${CURRENT_STAGE} | Checking output`);
    const stageOutputValidator = testStage.responseValidator;

    const parsedGameOptions = testStage.isGameOptionsResponse
        ? convertGameOptionsMessage(combinedDescription)
        : undefined;

    if (parsedGameOptions) {
        const updatedOptions = Object.entries(parsedGameOptions)
            .filter((x) => x[1].updated)
            .map((x) => `${x[0]}: ${x[1].value}`);

        if (updatedOptions.length) {
            console.log(`Updated Options:\n ${updatedOptions.join("\n")}`);
        }
    }

    if (stageOutputValidator(title!, combinedDescription, parsedGameOptions)) {
        console.log(`STAGE ${CURRENT_STAGE} | Passed check!`);
    } else {
        console.log(`STAGE ${CURRENT_STAGE} | Failed check!`);
        console.log(parsedGameOptions);
        failedTests.push(testStage.command);
    }

    await proceedNextStage();
});

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
        default:
            console.log(`Test suite not found, name = ${selectedTestSuite}`);
            TEST_SUITE = BASIC_OPTIONS_TEST_SUITE;
            break;
    }

    if (!process.env.BOT_CLIENT_ID) {
        console.error("BOT_CLIENT_ID not specified");
        process.exit(1);
    }

    if (
        !process.env.END_TO_END_TEST_BOT_TOKEN ||
        !process.env.END_TO_END_TEST_BOT_CLIENT ||
        !process.env.END_TO_END_TEST_BOT_CHANNEL
    ) {
        console.error(
            "END_TO_END_TEST_BOT_TOKEN, END_TO_END_TEST_BOT_CLIENT or END_TO_END_TEST_BOT_CHANNEL not specified",
        );
        process.exit(1);
    }

    if (options.source) {
        RUN_ID += `-${options.source}`;
    }

    await bot.connect();
})();
