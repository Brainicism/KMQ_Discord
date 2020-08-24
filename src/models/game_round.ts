import { MODE_TYPE } from "../commands/mode";
import _logger from "../logger";
import * as Eris from "eris";
const REMOVED_CHARACTERS_SONG_GUESS = /[\|’\ '?!]/g
const CHARACTER_REPLACEMENTS = [
    { pattern: /[\|’\ '?!]/g, replacement: "" },
    { pattern: /&/g, replacement: "and" }
]
const REMOVED_CHARACTERS_ARTIST_GUESS = /[:'.\-★*]/g
const logger = _logger("game_round");

export default class GameRound {
    public readonly song: string;
    public readonly songAliases: Array<string>;
    public readonly artist: string;
    public readonly videoID: string;
    public readonly startedAt: number;

    public skippers: Set<string>;
    public skipAchieved: boolean;
    public finished: boolean;
    public lastActive: number;

    constructor(song: string, artist: string, videoID: string, songAliases: Array<string>) {
        this.song = song;
        this.songAliases = songAliases;
        this.artist = artist;
        this.videoID = videoID;
        this.skipAchieved = false;
        this.startedAt = Date.now();
        this.skippers = new Set();
    }

    userSkipped(userId: string) {
        this.skippers.add(userId);
    }

    getNumSkippers(): number {
        return this.skippers.size;
    }

    checkGuess(message: Eris.Message, modeType: string): boolean {
        if (modeType === MODE_TYPE.SONG_NAME) {
            const guess = cleanSongName(message.content);
            const cleanedSongAliases = this.songAliases.map((x) => cleanSongName(x));
            const correctGuess = this.song && (guess === cleanSongName(this.song) || cleanedSongAliases.includes(guess));
            return correctGuess;
        }
        else if (modeType === MODE_TYPE.ARTIST) {
            const guess = cleanArtistName(message.content);
            const artistNames = this.artist.split("+");
            const cleanedArtistNames = artistNames.map(x => cleanArtistName(x));
            let correctGuess = this.song && (guess === cleanArtistName(this.artist) || cleanedArtistNames.includes(guess));
            return correctGuess;
        }
        else {
            logger.error(`Illegal mode type: ${modeType}`);
        }
    }

}

function cleanSongName(name: string): string {
    let cleanName = name.toLowerCase()
        .split("(")[0]
        .trim();
    for (let characterReplacement of CHARACTER_REPLACEMENTS) {
        cleanName = cleanName.replace(characterReplacement.pattern, characterReplacement.replacement);
    }
    return cleanName;
}

function cleanArtistName(name: string): string {
    const cleanName = name.toLowerCase()
        .replace(REMOVED_CHARACTERS_ARTIST_GUESS, "")
        .trim();
    return cleanName;
}
