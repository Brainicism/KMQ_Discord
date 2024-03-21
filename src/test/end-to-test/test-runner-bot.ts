/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import * as Eris from "eris";
import { delay } from "../../helpers/utils";
import BASIC_OPTIONS_TEST_SUITE from "./test_suites/basic_options_test";
import type ParsedGameOptionValues from "./parsed_game_options_value";
import type TestSuite from "./test_suites/test_suite";

const bot = new Eris.Client(process.env.END_TO_END_TEST_BOT_TOKEN!, {
    gateway: {
        intents: ["guildMessages", "messageContent"],
    },
});

const failedTests: string[] = [];
let TEST_SUITE: TestSuite | undefined;
let CURRENT_STAGE: number | null = null;

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

async function mainLoop(): Promise<void> {
    if (TEST_SUITE === undefined) {
        console.error("Test suite not specified");
        process.exit(1);
    }

    if (CURRENT_STAGE === null) {
        console.log(
            "========================================\nBeginning test\n========================================",
        );
        CURRENT_STAGE = 0;
    }

    console.log(
        `=====================STAGE ${CURRENT_STAGE}===================`,
    );

    const stageData = BASIC_OPTIONS_TEST_SUITE.tests[CURRENT_STAGE]!;
    const command = stageData.command;
    if (TEST_SUITE.resetEachStage) {
        await bot.createMessage(process.env.END_TO_END_TEST_CHANNEL!, ",reset");
        console.log(
            `STAGE ${CURRENT_STAGE} | Sending pre-test command: ',reset'`,
        );
        await delay(2000);
    }

    console.log(`STAGE ${CURRENT_STAGE} | Sending command: '${command}'`);
    await bot.createMessage(process.env.END_TO_END_TEST_CHANNEL!, command);
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

    // ignore resets
    if (msg.referencedMessage?.content === ",reset") return;

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

    const totalTests = BASIC_OPTIONS_TEST_SUITE.tests.length;
    const testStage = BASIC_OPTIONS_TEST_SUITE.tests[CURRENT_STAGE]!;
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

    CURRENT_STAGE += 1;
    if (CURRENT_STAGE === BASIC_OPTIONS_TEST_SUITE.tests.length) {
        console.log(
            "========================================Test suite completed========================================",
        );

        await bot.createMessage(
            process.env.END_TO_END_TEST_CHANNEL!,
            `Passed ${totalTests - failedTests.length}/${totalTests}   ${failedTests.length > 0 ? `\nFailed Tests:\n ${failedTests.join("\n ")}` : ""} `,
        );

        console.log(`Passed ${totalTests - failedTests.length}/${totalTests}`);
        process.exit(failedTests.length > 0 ? 0 : 1);
    }

    await delay(2000);
    await mainLoop();
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    TEST_SUITE = BASIC_OPTIONS_TEST_SUITE;
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
            "END_TO_END_TEST_BOT_TOKEN, END_TO_END_TEST_BOT_CLIENT or END_TO_END_TEST_CHANNEL not specified",
        );
        process.exit(1);
    }

    await bot.connect();
})();
