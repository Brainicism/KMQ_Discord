import { MODE_TYPE } from "../commands/mode";
import _logger from "../logger";
import Eris from "eris";
const REMOVED_CHARACTERS_SONG_GUESS = /[\|’\ '?!.-]/g
const CHARACTER_REPLACEMENTS = [
    { pattern: REMOVED_CHARACTERS_SONG_GUESS, replacement: "" },
    { pattern: /&/g, replacement: "and" }
]
const REMOVED_CHARACTERS_ARTIST_GUESS = /[:'.\-★*\ \(\)]/g
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

    checkGuess(message: Eris.Message, modeType: string): number {
        if (modeType === MODE_TYPE.SONG_NAME) {
            return this.checkSongGuess(message.content) ? 1 : 0;
        }
        else if (modeType === MODE_TYPE.ARTIST) {
            return this.checkArtistGuess(message.content) ? 1 : 0;
        }
        else if (modeType === MODE_TYPE.BOTH) {
            if (this.checkSongGuess(message.content)) return 1;
            if (this.checkArtistGuess(message.content)) return 0.2;
            return 0;
        }
        else {
            logger.error(`Illegal mode type: ${modeType}`);
        }
    }

    private checkSongGuess(message: string): boolean {
        const guess = cleanSongName(message);
        const cleanedSongAliases = this.songAliases.map((x) => cleanSongName(x));
        return this.song && (guess === cleanSongName(this.song) || cleanedSongAliases.includes(guess));
    }

    private checkArtistGuess(message: string): boolean {
        const guess = cleanArtistName(message);
        const artistNames = this.artist.split("+");
        const cleanedArtistNames = artistNames.map(x => cleanArtistName(x));
        return this.song && (guess === cleanArtistName(this.artist) || cleanedArtistNames.includes(guess));
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
