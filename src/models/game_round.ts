import { cleanSongName, cleanArtistName } from "../helpers/game_utils";
import { Message } from "discord.js";
import { MODE_TYPE } from "../commands/mode";
import _logger from "../logger";
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

    checkGuess(message: Message, modeType: string): boolean {
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
