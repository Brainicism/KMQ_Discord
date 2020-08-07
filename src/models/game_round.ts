import * as songAliasesList from "../../data/song_aliases.json";
import { cleanSongName } from "../helpers/game_utils";
import { Message } from "discord.js";

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

    constructor(song: string, artist: string, videoID: string) {
        this.song = song;
        this.songAliases = songAliasesList[videoID] || [];;
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

    checkGuess(message: Message): boolean {
        const guess = cleanSongName(message.content);
        const cleanedSongAliases = this.songAliases.map((x) => cleanSongName(x));
        const correctGuess = this.song && (guess === cleanSongName(this.song) || cleanedSongAliases.includes(guess));
        return correctGuess;
    }

}
