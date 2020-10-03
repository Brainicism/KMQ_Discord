import { exec } from "child_process";
import _logger from "../logger";
const logger = _logger("game_session");

export function delay(delayDuration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayDuration));
}
export function bold(text: string): string {
    return `**${text}**`;
}

export function italicize(text: string): string {
    return `*${text}*`;
}

export function codeLine(text: string): string {
    return `\`${text}\``
}

export function chunkArray<T>(array: Array<T>, chunkSize: number): Array<Array<T>> {
    let chunkedArrays = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        const embedFieldsSubset = array.slice(i, Math.min(i + chunkSize, array.length));
        chunkedArrays.push(embedFieldsSubset)
    }
    return chunkedArrays;
}

export function getAudioDurationInSeconds(songPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        exec(`ffprobe -i "${songPath}" -show_entries format=duration -v quiet -of csv="p=0"`, (err, stdout, stderr) => {
            if (!stdout || stderr) {
                logger.error(`Error getting audio duration: path = ${songPath}, err = ${stderr}`);
                return resolve(-1);
            }
            resolve(parseInt(stdout));
        })
    })
}
