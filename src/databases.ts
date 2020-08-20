import * as _kmqKnexConfig from "./config/knexfile_kmq";
import * as _kpopVideosKnexConfig from "./config/knexfile_kpop_videos";
import * as Knex from "knex";
import _logger from "./logger";

const logger = _logger("databases");
const kmqKnexConfig: any = _kmqKnexConfig;
const kpopVideosKnexConfig: any = _kpopVideosKnexConfig;

class DatabaseConnections {
    public kmq: Knex;
    public kpopVideos: Knex

    constructor() {
        logger.info("Initializing database connections");
        this.kmq = Knex(kmqKnexConfig);
        this.kpopVideos = Knex(kpopVideosKnexConfig);
    }

    async destroy() {
        await this.kmq.destroy();
        await this.kpopVideos.destroy();
    }
}

export const db = new DatabaseConnections();
