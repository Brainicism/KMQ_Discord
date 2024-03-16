/* eslint-disable tsdoc/syntax */
import * as uuid from "uuid";
import { DataFiles } from "../constants";
import { GameOptionCommand } from "../types";
import { IPCLogger } from "../logger";
import { exec } from "child_process";
import GameOption from "../enums/game_option_name";
import State from "../state";
import _ from "lodash";
import crypto from "crypto";
import fs from "fs";
import i18n from "./localization_manager";
import moment from "moment-timezone";

const logger = new IPCLogger("utils");

/**
 * Promise-based delay function
 * @param delayDuration - Delay in milliseconds
 * @returns Promise
 */
export function delay(delayDuration: number): Promise<void> {
    // eslint-disable-next-line no-promise-executor-return
    return new Promise((resolve) => setTimeout(resolve, delayDuration));
}

/**
 * @param text - Text to bold
 * @returns bolded text
 */
export function bold(text: string | number): string {
    return `**${String(text).split("*").join("\\*")}**`;
}

/**
 * @param text - Text to italicize
 * @returns italicized text
 */
export function italicize(text: string): string {
    return `*${text.split("*").join("\\*")}*`;
}

/**
 * @param text - Text to codify
 * @returns codified text
 */
export function codeLine(text: string): string {
    return `\`${text.split("`").join("\\`")}\``;
}

/**
 * @param text - Text to underline
 * @returns underlined text
 */
export function underline(text: string): string {
    return `__${text.split("_").join("\\_")}__`;
}

/**
 * @param text - Text to strikethrough
 * @returns struckthrough text
 */
export function strikethrough(text: string): string {
    return `~~${text.split("~").join("\\~")}~~`;
}

/**
 * @param text - Text to escape
 * @returns text with formatting-disrupting characters escaped
 */
export function escapedFormatting(text: string): string {
    const SPECIAL_CHARACTERS = ["\\", "*", "`", "_", "~", "|", "<", ">"];
    for (const char of SPECIAL_CHARACTERS) {
        text = text.replaceAll(char, `\\${char}`);
    }

    return text;
}

/**
 * @param commandName - The name of the slash command
 * @param subcommandName - The suboption of the slash command
 * @param subcommandGroupName - The suboption group of the slash command
 * @returns a formatted version of the slash command, that allows users to click
 */
export function clickableSlashCommand(
    commandName: string,
    subcommandName?: string,
    subcommandGroupName?: string,
): string {
    let commandAndSubcommand = commandName;

    if (!subcommandName) {
        if (Object.values(GameOptionCommand).includes(commandName)) {
            subcommandName = "set";
            if (commandName === GameOptionCommand[GameOption.LIMIT]) {
                subcommandName = "set top";
            } else if (commandName === GameOptionCommand[GameOption.CUTOFF]) {
                subcommandName = "set earliest";
            }
        }

        switch (commandName) {
            case "play":
                subcommandName = "classic";
                break;
            case "add":
            case "remove":
                commandName = "groups";
                subcommandName = commandName;
                break;
            case "preset":
                subcommandName = "list";
                break;
            case "leaderboard":
                subcommandName = "show";
                break;
            case "lookup":
                subcommandName = "song_name";
                break;
            case "news":
                subcommandName = "daily";
                break;
            default:
                break;
        }
    }

    if (subcommandName) {
        commandAndSubcommand = `${commandName} ${subcommandName}`;
        if (subcommandGroupName) {
            commandAndSubcommand = `${commandAndSubcommand} ${subcommandGroupName}`;
        }
    }

    return `</${commandAndSubcommand}:${State.commandToID[commandName]}>`;
}

/**
 * Chunks in an array in subarrays of specified size
 * @param array - The input array
 * @param chunkSize - The size of each chunked array
 * @returns The chunked array
 */
export function chunkArray<T>(
    array: Array<T>,
    chunkSize: number,
): Array<Array<T>> {
    const chunkedArrays: Array<Array<T>> = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        const embedFieldsSubset: Array<T> = array.slice(
            i,
            Math.min(i + chunkSize, array.length),
        );

        chunkedArrays.push(embedFieldsSubset);
    }

    return chunkedArrays;
}

/**
 * @param songPath - the file path of the song file
 * @returns the audio duration of the song
 */
export function getAudioDurationInSeconds(songPath: string): Promise<number> {
    return new Promise((resolve) => {
        exec(
            `ffprobe -i "${songPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
            (_err, stdout, stderr) => {
                if (!stdout || stderr) {
                    logger.error(
                        `Error getting audio duration: path = ${songPath}, err = ${stderr}`,
                    );
                    resolve(0);
                    return;
                }

                resolve(parseInt(stdout, 10));
            },
        );
    });
}

/**
 * @param filePath - the file path of the JSON file
 * @returns a Javascript object representation of the file
 */
export async function parseJsonFile(filePath: string): Promise<any> {
    try {
        const fileContents = (await fs.promises.readFile(filePath)).toString();
        return JSON.parse(fileContents);
    } catch (e) {
        throw new Error(`Unable to read JSON file at: ${filePath}`);
    }
}

/**
 * @param filePath - the file path of the JSON file
 * @returns a Javascript object representation of the file
 */
export function parseJsonFileSync(filePath: string): any {
    try {
        // eslint-disable-next-line node/no-sync
        const fileContents = fs.readFileSync(filePath).toString();
        return JSON.parse(fileContents);
    } catch (e) {
        throw new Error(`Unable to read JSON file at: ${filePath}`);
    }
}

/**
 * @param arr - The input array of strings
 * @returns a proper comma+'and' separated string
 */
export function arrayToString(arr: Array<string>): string {
    const elements = arr.map((element) => `\`${element}\``);
    if (elements.length === 1) return elements[0];
    const lastElement = elements.splice(-1);
    return `${elements.join(", ")} and ${lastElement}`;
}

/**
 * Stolen from https://weeknumber.net/how-to/javascript
 * @param dateObj - The input date object
 * @returns the current ISO week number in the year, ranges from 1-52 (53 on certain years)
 */
export function weekOfYear(dateObj?: Date): number {
    const date = dateObj || new Date();
    date.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    // January 4 is always in week 1.
    const week1 = new Date(date.getFullYear(), 0, 4);
    // Adjust to Thursday in week 1 and count number of weeks from date to week1.
    return (
        1 +
        Math.round(
            ((date.getTime() - week1.getTime()) / (1000 * 60 * 60 * 24) -
                3 +
                ((week1.getDay() + 6) % 7)) /
                7,
        )
    );
}

/**
 * Chooses random element from a list
 * @param list - List of arbitrary elements
 * @returns the randomly selected element
 */
export function chooseRandom<T>(list: Array<T>): T {
    return list[Math.floor(Math.random() * list.length)];
}

/**
 * Chooses random element from a weighted list
 * Requires some list element to have a "weight" property for weighting to function
 * From: https://stackoverflow.com/a/55671924
 * @param list - List of arbitrary elements
 * @param weightKey - The name of the key to be sorted on
 * @returns the randomly selected element
 */
export function chooseWeightedRandom(
    list: Array<any>,
    weightKey = "weight",
): any {
    const weights: Array<number> = [];
    for (let i = 0; i < list.length; i++) {
        const previousWeight = weights[i - 1] || 0;
        if (!list[i][weightKey]) {
            weights[i] = 1 + previousWeight;
        } else {
            weights[i] = list[i][weightKey] + previousWeight;
        }
    }

    const random = Math.random() * weights[weights.length - 1];
    for (let i = 0; i < weights.length; i++) {
        if (weights[i] > random) {
            return list[i];
        }
    }

    return null;
}

/**
 * @param date - the date Object
 * @returns the date in yyyy-mm-dd format
 */
export function standardDateFormat(date: Date): string {
    return date.toISOString().split("T")[0];
}

/**
 * @param date - the date Object
 * @param format - the date format to use https://discord.com/developers/docs/reference#message-formatting-timestamp-styles
 * @returns a formatted string that appears as an interactable date in Discord
 */
export function discordDateFormat(
    date: Date,
    format: "t" | "T" | "d" | "D" | "f" | "F" | "R",
): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:${format}>`;
}

/**
 * @param date - the date Object
 * @param guildID - the guild ID
 * @returns the date in (minutes/hours ago) or yyyy-mm-dd format
 */
export function friendlyFormattedDate(date: Date, guildID: string): string {
    const timeDiffSeconds = (Date.now() - date.getTime()) / 1000;
    const timeDiffMinutes = timeDiffSeconds / 60.0;
    if (timeDiffMinutes <= 60) {
        return i18n.translateN(
            guildID,
            "misc.plural.minuteAgo",
            Math.ceil(timeDiffMinutes),
        );
    }

    const timeDiffHours = timeDiffMinutes / 60.0;
    if (timeDiffHours <= 24) {
        return i18n.translateN(
            guildID,
            "misc.plural.hourAgo",
            Math.ceil(timeDiffHours),
        );
    }

    return standardDateFormat(date);
}

/**
 * @param job - the function to retry
 * @param jobArgs - arguments to pass to job
 * @param maxRetries - retries of job before throwing
 * @param firstTry - whether this is the first try
 * @param delayDuration - time (in ms) before attempting job retry
 * @param sendError - whether to send a warning or error
 * @returns the result of job
 */
export async function retryJob<Type>(
    job: (...args: any) => Promise<Type>,
    jobArgs: Array<any>,
    maxRetries: number,
    firstTry: boolean,
    delayDuration?: number,
    sendError = true,
): Promise<Type> {
    if (!firstTry && delayDuration) {
        await delay(delayDuration);
    }

    return job(...jobArgs).catch((err) => {
        if (sendError) {
            logger.error(`err = ${err}`);
        } else {
            logger.warn(`err = ${err}`);
        }

        if (maxRetries <= 0) {
            throw err;
        }

        return retryJob(
            job,
            jobArgs,
            maxRetries - 1,
            false,
            delayDuration,
            sendError,
        );
    });
}

/**
 * @param func - the function to retry
 * @param description - description of the function
 * @param maxRetries - retries of job before throwing
 * @param initialDelayMs - time (in ms) before attempting job retry
 * @returns the result of job
 */
export function retryWithExponentialBackoff<T>(
    func: () => Promise<T>,
    description: string | undefined,
    maxRetries = 5,
    initialDelayMs = 1000,
): Promise<T> {
    logger.info(
        `Executing retry with exponential backoff for ${uuid.v4()}}. ${description}`,
    );
    return new Promise(async (resolve, reject) => {
        let retryCount = 0;
        let delayMs = initialDelayMs;

        async function attempt(): Promise<void> {
            try {
                logger.info(
                    `Executing retry with exponential backoff for ${uuid.v4()}}. Retries remaining: ${
                        maxRetries - retryCount
                    }/${maxRetries}`,
                );
                const result = await func();
                resolve(result);
            } catch (error) {
                if (retryCount >= maxRetries) {
                    logger.info(
                        `Retry with exponential backoff for ${uuid.v4()}} failed. after ${maxRetries} retries`,
                    );
                    reject(error);
                    return;
                }

                retryCount++;
                setTimeout(attempt, delayMs);
                delayMs *= 2;
            }
        }

        await attempt();
    });
}

/** @returns whether it's a weekend or not */
export function isWeekend(): boolean {
    const normalizedDate = moment().tz("America/New_York");
    return normalizedDate.weekday() === 0 || normalizedDate.weekday() === 6;
}

/**
 * @param input - The hash input
 * @param bits - The number of bits wanted in the output
 * @returns the output hash as a number
 */
export function md5Hash(input: string | number, bits: number): number {
    if (bits > 128) {
        logger.warn("Maximum bit length is 128");
    }

    const hash = crypto
        .createHash("md5")
        .update(input.toString())
        .digest("hex");

    return parseInt(hash.slice(0, bits / 4), 16);
}

/**
 * @param n - the number to format
 * @returns the given number, with thousands separated by commas
 */
export function friendlyFormattedNumber(n: number): string {
    return n.toLocaleString("en");
}

/**
 * @param n - The number
 * @returns the number with its proper ordinal suffix
 */
export function getOrdinalNum(n: number): string {
    return (
        friendlyFormattedNumber(n) +
        (n > 0
            ? ["th", "st", "nd", "rd"][
                  (n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10
              ]
            : "")
    );
}

/**
 * https://stackoverflow.com/a/9083076/11002711
 * @param num - The decimal number to be converted
 * @returns the roman numeral representation
 */
export function romanize(num: number): string | number {
    if (Number.isNaN(num)) {
        return NaN;
    }

    const digits = String(+num).split("");
    const key = [
        "",
        "C",
        "CC",
        "CCC",
        "CD",
        "D",
        "DC",
        "DCC",
        "DCCC",
        "CM",
        "",
        "X",
        "XX",
        "XXX",
        "XL",
        "L",
        "LX",
        "LXX",
        "LXXX",
        "XC",
        "",
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
    ];

    let roman = "";
    let i = 3;
    while (i--) {
        const digit = digits.pop();
        roman = digit ? (key[+digit + i * 10] || "") + roman : roman;
    }

    return Array(+digits.join("") + 1).join("M") + roman;
}

/**
 * @param a - the starting set (as an array)
 * @param args - the sets whose elements are removed from a (as arrays)
 * @returns the difference of the n sets (a \ (b ∪ c ... ∪ z))
 */
export function setDifference<Type>(
    a: Array<Type>,
    ...args: Array<Array<Type>>
): Set<Type> {
    return new Set(_.difference(a, ...args));
}

/**
 * @param args - the starting sets (as arrays)
 * @returns the intersection of the given sets (a ∩ b ... ∩ z)
 */
export function setIntersection<Type>(...args: Array<Array<Type>>): Set<Type> {
    return new Set(_.intersection(...args));
}

/**
 * @param promise - The promise to measure execution time against
 * @returns - The execution time in ms
 */
export async function measureExecutionTime(
    promise: Promise<any>,
): Promise<number> {
    const hrstart = process.hrtime();
    await promise;
    const hrend = process.hrtime(hrstart);
    return hrend[0] * 1000 + hrend[1] / 1000000;
}

/**
 * @param s - the string to be tested for Hangul
 * @returns true if the string contains any Hangul
 */
export function containsHangul(s: string): boolean {
    return /[\uac00-\ud7af]|[\u1100-\u11ff]|[\u3130-\u318f]|[\ua960-\ua97f]|[\ud7b0-\ud7ff]/giu.test(
        s,
    );
}

/**
 * @param userID - The user ID
 * @returns a clickable mention to user
 */
export function getMention(userID: string): string {
    return `<@${userID}>`;
}

/**
 * @param filePath - The file path
 * @returns whether the path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * @param filePath - The file path
 * @returns whether the path exists
 */
export function pathExistsSync(filePath: string): boolean {
    try {
        // eslint-disable-next-line node/no-sync
        fs.accessSync(filePath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * @returns whether this instance should skip metrics posting
 */
export async function isPrimaryInstance(): Promise<boolean> {
    return pathExists(DataFiles.PRIMARY_COOKIE);
}

/**
 * @param url - the URL
 * @returns whether the URL is valid
 */
export function isValidURL(url: string): boolean {
    try {
        // eslint-disable-next-line no-new
        new URL(url);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Type-safe property copy
 * @param target - the target object
 * @param source - the source object
 * @param key - the key of the property to be copied
 */
export function mapTo<T, S extends T, K extends keyof T>(
    target: T,
    source: S,
    key: K,
): void {
    if (source[key] === null) {
        target[key] = null as T[K];
    } else if (Array.isArray(source[key])) {
        target[key] = [...(source[key] as any)] as any;
    } else if (typeof source[key] === "object") {
        target[key] = { ...source[key] };
    } else {
        target[key] = source[key];
    }
}

/**
 * Get the number of seconds between two timestamps
 * @param startTime - the beginning timestamp
 * @param endTime - the ending timestamp
 * @returns the number of seconds between the two timestamps
 */
export function durationSeconds(startTime: number, endTime: number): number {
    return Math.abs(endTime - startTime) / 1000;
}

/**
 * Get the number of days between two timestamps
 * @param startTime - the beginning timestamp
 * @param endTime - the ending timestamp
 * @returns the number of days between the two timestamps
 */
export function durationDays(startTime: number, endTime: number): number {
    return (endTime - startTime) / (1000 * 60 * 60 * 24);
}

/**
 * Generate a formatted progress bar
 * @param current - the current value
 * @param total - the total value
 * @param barLength - the length of the bar
 * @returns a formatted progress bar
 */
export function visualProgressBar(
    current: number,
    total: number,
    barLength = 10,
): string {
    // Ensure the ratio is between 0 and 1
    const ratio = Math.max(0, Math.min(1, current / total));

    const completedBlocks = Math.floor(ratio * barLength);
    const remainingBlocks = barLength - completedBlocks;

    return "▓".repeat(completedBlocks) + "░".repeat(remainingBlocks);
}

/**
 * @param input - the input string
 * @param maxLength - the maximum length of the string
 * @returns the input string, truncated to the given length
 */
export function truncatedString(input: string, maxLength: number): string {
    if (input.length <= maxLength) {
        return input;
    }

    return `${input.substring(0, maxLength - 3)}...`;
}

/**
 * @param kmqPlaylistIdentifier - Identifier containing either youtube/spotify followed by the playlist ID
 * @returns whether it is a Spotify playlist, and the parsed playlist ID
 */
export function parseKmqPlaylistIdentifier(kmqPlaylistIdentifier: string): {
    isSpotify: boolean;
    playlistId: string;
} {
    const identifierComponents = kmqPlaylistIdentifier.split("|");
    if (identifierComponents.length === 1) {
        return {
            isSpotify: true,
            playlistId: identifierComponents[0],
        };
    }

    return {
        isSpotify: identifierComponents[0] === "spotify",
        playlistId: identifierComponents[1],
    };
}

/**
 * @param m: the string
 * @returns whether the string contains atleast one alphanum char
 */
export function hasAtLeastOneAlphanumeric(m: string): boolean {
    // eslint-disable-next-line no-control-regex
    return /[a-zA-Z0-9]/.test(m);
}

/**
 * @param arr - the array
 * @param numPartitions - the number of partition
 * @returns the array sorted in individual partitions
 */
export function shufflePartitionedArray<T>(
    arr: T[],
    numPartitions: number,
): T[] {
    // Check if the number of partitions is valid
    if (numPartitions <= 0 || numPartitions >= arr.length) {
        throw new Error("Invalid number of partitions");
    }

    // Calculate the partition size
    const partitionSize = Math.ceil(arr.length / numPartitions);

    // Partition the array into chunks
    const partitions: T[][] = [];
    for (let i = 0; i < arr.length; i += partitionSize) {
        partitions.push(arr.slice(i, i + partitionSize));
    }

    // Shuffle the elements within each partition
    for (const partition of partitions) {
        for (let i = partition.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [partition[i], partition[j]] = [partition[j], partition[i]];
        }
    }

    // Flatten the shuffled partitions while keeping their order intact
    const shuffledArray: T[] = [];
    for (const partition of partitions) {
        shuffledArray.push(...partition);
    }

    return shuffledArray;
}
