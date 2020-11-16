import Eris from "eris";
import { ModeType } from "../commands/game_options/mode";
import _logger from "../logger";

// eslint-disable-next-line no-useless-escape
const REMOVED_CHARACTERS_SONG_GUESS = /[\|’\ '?!.-]/g;
const CHARACTER_REPLACEMENTS = [
    { pattern: REMOVED_CHARACTERS_SONG_GUESS, replacement: "" },
    { pattern: /&/g, replacement: "and" },
];
// eslint-disable-next-line no-useless-escape
const REMOVED_CHARACTERS_ARTIST_GUESS = /[:'.\-★*\ \(\)]/g;
const logger = _logger("game_round");

function cleanSongName(name: string): string {
    let cleanName = name.toLowerCase()
        .split("(")[0]
        .trim();
    for (const characterReplacement of CHARACTER_REPLACEMENTS) {
        cleanName = cleanName.replace(characterReplacement.pattern, characterReplacement.replacement);
    }
    return cleanName;
}

function cleanArtistName(name: string): string {
    let cleanName = name.toLowerCase()
        .replace(REMOVED_CHARACTERS_ARTIST_GUESS, "")
        .trim();
    for (const characterReplacement of CHARACTER_REPLACEMENTS) {
        cleanName = cleanName.replace(characterReplacement.pattern, characterReplacement.replacement);
    }
    return cleanName;
}

export default class GameRound {
    public readonly song: string;
    public readonly songAliases: Array<string>;
    public readonly artistAliases: Array<string>;
    public readonly artist: string;
    public readonly videoID: string;
    public readonly startedAt: number;

    public skippers: Set<string>;
    public skipAchieved: boolean;
    public lastActive: number;

    constructor(song: string, artist: string, videoID: string, songAliases: Array<string>, artistAliases: Array<string>) {
        this.song = song;
        this.songAliases = songAliases;
        this.artistAliases = artistAliases;
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
        if (modeType === ModeType.SONG_NAME) {
            return this.checkSongGuess(message.content) ? 1 : 0;
        }
        if (modeType === ModeType.ARTIST) {
            return this.checkArtistGuess(message.content) ? 1 : 0;
        }
        if (modeType === ModeType.BOTH) {
            if (this.checkSongGuess(message.content)) return 1;
            if (this.checkArtistGuess(message.content)) return 0.2;
            return 0;
        }
        logger.error(`Illegal mode type: ${modeType}`);
        return 0;
    }

    private checkSongGuess(message: string): boolean {
        const guess = cleanSongName(message);
        const cleanedSongAliases = this.songAliases.map((x) => cleanSongName(x));
        return this.song && (guess === cleanSongName(this.song) || cleanedSongAliases.includes(guess));
    }

    private checkArtistGuess(message: string): boolean {
        const guess = cleanArtistName(message);
        const cleanedArtistAliases = this.artistAliases.map((x) => cleanArtistName(x));
        return this.song && (guess === cleanArtistName(this.artist) || cleanedArtistAliases.includes(guess));
    }
}
