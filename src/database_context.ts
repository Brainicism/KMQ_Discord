import Knex from "knex";
import kmqKnexConfig from "./config/knexfile_kmq";
import kpopVideosKnexConfig from "./config/knexfile_kpop_videos";
import agnosticKnexConfig from "./config/knexfile_agnostic";
import kmqTestKnexConfig from "./config/knexfile_kmq_test";
import kpopVideosKnexValidationConfig from "./config/knexfile_kpop_videos_validation";
import _logger from "./logger";
import { EnvType } from "./types";

const logger = _logger("database_context");

export class DatabaseContext {
    public kmq: Knex;
    public kpopVideos: Knex;
    public kpopVideosValidation: Knex;
    public agnostic: Knex;

    constructor() {
        if ([EnvType.DRY_RUN].includes(process.env.NODE_ENV as EnvType)) return;
        logger.info(`Initializing database connections ${process.env.NODE_ENV || ""}`);
        if (process.env.NODE_ENV === EnvType.TEST) {
            logger.info("Initializing KMQ test database context");
            this.kmq = Knex(kmqTestKnexConfig);
        } else {
            this.kmq = Knex(kmqKnexConfig);
        }
        this.kpopVideos = Knex(kpopVideosKnexConfig);
        this.agnostic = Knex(agnosticKnexConfig);
        this.kpopVideosValidation = Knex(kpopVideosKnexValidationConfig);
    }

    async destroy() {
        if (this.kmq) {
            await this.kmq.destroy();
        }
        if (this.kpopVideos) {
            await this.kpopVideos.destroy();
        }
        if (this.agnostic) {
            await this.agnostic.destroy();
        }
        if (this.kpopVideosValidation) {
            await this.kpopVideosValidation.destroy();
        }
    }
}

export function getNewConnection(): DatabaseContext {
    return new DatabaseContext();
}

export default new DatabaseContext();
