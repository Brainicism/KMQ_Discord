import fs from "fs";
import { exec } from "child_process";
import moment from "moment-timezone";
import crypto from "crypto";
import _ from "lodash";
import _logger from "../logger";

const logger = _logger("utils");

/**
 * Promise-based delay function
 * @param delayDuration - Delay in milliseconds
 */
export function delay(delayDuration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayDuration));
}

/**
 * @param text - Text to bold
 * @returns bolded text
 */
export function bold(text: string): string {
    return `**${text}**`;
}

/**
 * @param text - Text to italicize
 * @returns italicized text
 */
export function italicize(text: string): string {
    return `*${text}*`;
}

/**
 * @param text - Text to codify
 * @returns codified text
 */
export function codeLine(text: string): string {
    return `\`${text}\``;
}

/**
 * @param text - Text to underline
 * @returns underlined text
 */
export function underline(text: string): string {
    return `__${text}__`;
}

/**
 * @param text - Text to strikethrough
 * @returns struckthrough text
 */
export function strikethrough(text: string): string {
    return `~~${text}~~`;
}

/**
 * @param num - The number to round
 * @param places - The number of places to round
 * @returns the rounded number
 */
export function roundDecimal(num: number, places: number) {
    return Math.round(num * (10 ** places)) / (10 ** places);
}

/**
 * Chunks in an array in subarrays of specified size
 * @param array - The input array
 * @param chunkSize - The size of each chunked array
 */
export function chunkArray<T>(array: Array<T>, chunkSize: number): Array<Array<T>> {
    const chunkedArrays = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        const embedFieldsSubset = array.slice(i, Math.min(i + chunkSize, array.length));
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
        exec(`ffprobe -i "${songPath}" -show_entries format=duration -v quiet -of csv="p=0"`, (err, stdout, stderr) => {
            if (!stdout || stderr) {
                logger.error(`Error getting audio duration: path = ${songPath}, err = ${stderr}`);
                resolve(0);
                return;
            }
            resolve(parseInt(stdout));
        });
    });
}

/**
 * @param filePath - the file path of the JSON file
 * @returns a Javascript object representation of the file
 */
export function parseJsonFile(filePath: string) {
    return JSON.parse(fs.readFileSync(filePath).toString());
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
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/**
 * Chooses random element from a list
 * @param list - List of arbitrary elements
 * @returns the randomly selected element
 */
export function chooseRandom(list: Array<any>) {
    return list[Math.floor(Math.random() * list.length)] || null;
}

/**
 * Chooses random element from a weighted list
 * Requires some list element to have a "weight" property for weighting to function
 * From: https://stackoverflow.com/a/55671924
 * @param list - List of arbitrary elements
 * @returns the randomly selected element
 */
export function chooseWeightedRandom(list: Array<any>) {
    const weights = [];
    for (let i = 0; i < list.length; i++) {
        const previousWeight = weights[i - 1] || 0;
        if (!list[i].weight) {
            weights[i] = 1 + previousWeight;
        } else {
            weights[i] = list[i].weight + previousWeight;
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
export function friendlyFormattedDate(date: Date): string {
    return date.toISOString().split("T")[0];
}

/**
 * @param job - the function to retry
 * @param jobArgs - arguments to pass to job
 * @param maxRetries - retries of job before throwing
 * @param delayDuration - time (in ms) before attempting job retry
 * @returns the result of job
 */
export async function retryJob(job: (...args: any) => Promise<void>, jobArgs: Array<any>, maxRetries: number, firstTry: boolean, delayDuration?: number): Promise<void> {
    if (!firstTry && delayDuration) {
        await delay(delayDuration);
    }
    return job(...jobArgs).catch((err) => {
        logger.error(`err = ${err}`);
        if (maxRetries <= 0) {
            throw err;
        }
        return retryJob(job, jobArgs, maxRetries - 1, false, delayDuration);
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
export function md5Hash(input: string | number, bits: number) {
    if (bits > 128) {
        logger.warn("Maximum bit length is 128");
    }
    const hash = crypto.createHash("md5").update(input.toString()).digest("hex");
    return parseInt(hash.slice(0, bits / 4), 16);
}

/** @returns whether its a KMQ power hour */
export function isPowerHour(): boolean {
    const date = new Date();
    const dateSeed = (date.getDate() * 31 + date.getMonth()) * 31 + date.getFullYear();
    // distribute between each third of the day to accomodate timezone differences
    const powerHours = [md5Hash(dateSeed, 8) % 7, (md5Hash(dateSeed + 1, 8) % 7) + 8, (md5Hash(dateSeed + 2, 8) % 7) + 16];
    const currentHour = date.getHours();
    return powerHours.some((powerHour) => currentHour >= powerHour && currentHour <= (powerHour + 1));
}

/**
 * @param n - The number
 * @returns the number with its proper ordinal suffix
 */
export function getOrdinalNum(n: number): string {
    return n + (n > 0 ? ["th", "st", "nd", "rd"][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : "");
}

/**
 * https://stackoverflow.com/a/9083076/11002711
 * @param num - The decimal number to be converted
 * @returns the roman numeral representation
 */
export function romanize(num: number) {
    if (Number.isNaN(num)) {
        return NaN;
    }
    const digits = String(+num).split("");
    const key = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM",
        "", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC",
        "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
    let roman = "";
    let i = 3;
    while (i--) {
        roman = (key[+digits.pop() + (i * 10)] || "") + roman;
    }
    return Array(+digits.join("") + 1).join("M") + roman;
}

/**
 * @param a - the starting set (as an array)
 * @param args - the sets whose elements are removed from a (as arrays)
 * @returns the difference of the n sets (a \ (b ∪ c ... ∪ z))
 */
export function setDifference<Type>(a: Array<Type>, ...args: Array<Array<Type>>): Set<Type> {
    return new Set(_.difference(a, ...args));
}

/**
 * @param args - the starting sets (as arrays)
 * @returns the intersection of the given sets (a ∩ b ... ∩ z)
 */
export function setIntersection<Type>(...args: Array<Array<Type>>): Set<Type> {
    return new Set(_.intersection(...args));
}
