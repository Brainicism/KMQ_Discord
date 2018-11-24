const Scoreboard = require("./scoreboard.js");

module.exports = class GameSession {
    constructor() {
        this.song = null;
        this.artist = null;
        this.link = null;
        this.inSession = false;
        this.scoreboard = new Scoreboard();
    }

    startRound(song, artist, link) {
        this.song = song;
        this.artist = artist;
        this.link = link;
        this.inSession = true;
    }

    endRound() {
        this.song = null;
        this.artist = null;
        this.link = null;
        this.inSession = false;
    }

    endGame() {
        this.endRound();
        this.scoreboard = new Scoreboard();
    }

    getSong() {
        return this.song;
    }

    getArtist() {
        return this.currentArtist;
    }

    getLink() {
        return this.currentSongLink;
    }
};
