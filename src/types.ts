import * as Knex from "knex";

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

interface Databases {
    kmq: Knex,
    kpopVideos: Knex
}
export {
    ParsedMessage,
    QueriedSong,
    Databases
}
