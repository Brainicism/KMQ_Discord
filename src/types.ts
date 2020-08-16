import * as Knex from "knex";
import * as Eris from "eris";

export interface ParsedMessage {
    action: string;
    argument: string;
    message: string,
    components: Array<string>
}

export interface QueriedSong {
    name: string;
    artist: string;
    youtubeLink: string;
}

export interface Databases {
    kmq: Knex;
    kpopVideos: Knex;
}

export interface SendMessagePayload {
    channel: Eris.GuildTextableChannel;
    authorId?: string
}
