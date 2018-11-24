class GameSession {
    #serverID;
    #currentSong;
    #currentArtist;
    #currentSongLink;
    #gameInSession;
    #scoreboard;

    constructor() {
        currentSong = null;
        currentArtist = null;
        currentSongLink = null;
        gameInSession = null;
    }

    getServerID() {
        return serverID;
    }
}
