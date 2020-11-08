import Knex from "knex";
import kmqKnexConfig from "./config/knexfile_kmq";
import kpopVideosKnexConfig from "./config/knexfile_kpop_videos";
import _logger from "./logger";
import { EnvType } from "./types";

const logger = _logger("database_context");

class DatabaseContext {
    public kmq: Knex;
    public kpopVideos: Knex;

    constructor() {
        if (process.env.NODE_ENV === EnvType.DRY_RUN) return;
        logger.info("Initializing database connections");
        this.kmq = Knex(kmqKnexConfig);
        this.kpopVideos = Knex(kpopVideosKnexConfig);
    }

    async destroy() {
        await this.kmq.destroy();
        await this.kpopVideos.destroy();
    }
}

export default new DatabaseContext();
