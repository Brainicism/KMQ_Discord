interface ParsedMessage {
    action: string;
    argument: string;
    message: string,
    components: Array<string>
}

interface QueriedSong {
    name: string;
    artist: string;
    youtubeLink: string;
}

export {
    ParsedMessage,
    QueriedSong
}
