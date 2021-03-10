import Knex from "knex";
import kmqKnexConfig from "./config/knexfile_kmq";
import kpopVideosKnexConfig from "./config/knexfile_kpop_videos";
import agnosticKnexConfig from "./config/knexfile_agnostic";
import kmqTestKnexConfig from "./config/knexfile_kmq_test";
import _logger from "./logger";
import { EnvType } from "./types";

const logger = _logger("database_context");

export class DatabaseContext {
    public kmq: Knex;
    public kpopVideos: Knex;
    public agnostic: Knex;

    constructor(initAgnostic = false) {
        if (process.env.NODE_ENV === EnvType.DRY_RUN) return;
        logger.info(`Initializing database connections ${process.env.NODE_ENV}`);
        if (process.env.NODE_ENV === EnvType.TEST) {
            logger.info("Initializing KMQ test database context");
            this.kmq = Knex(kmqTestKnexConfig);
        } else {
            this.kmq = Knex(kmqKnexConfig);
        }
        this.kpopVideos = Knex(kpopVideosKnexConfig);
        if (initAgnostic) {
            this.agnostic = Knex(agnosticKnexConfig);
        }
    }

    async destroy() {
        await this.kmq.destroy();
        await this.kpopVideos.destroy();
        if (this.agnostic) {
            await this.agnostic.destroy();
        }
    }
}

export function getDatabaseAgnosticContext(): DatabaseContext {
    return new DatabaseContext(true);
}

export default new DatabaseContext();
