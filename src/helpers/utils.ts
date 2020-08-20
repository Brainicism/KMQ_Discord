import * as fs from "fs";

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
