import Knex from "knex";
import _logger from "./logger";
import { EnvType } from "./types";

const logger = _logger("database_context");

function generateKnexContext(databaseName: string, minPoolSize = 0, maxPoolSize: number) {
    return {
        client: "mysql",
        connection: {
            user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, host: process.env.DB_HOST, charset: "utf8mb4", port: parseInt(process.env.DB_PORT), multipleStatements: true,
        },
        pool: {
            min: minPoolSize,
            max: maxPoolSize,
        },
    };
}
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
            this.kmq = Knex(generateKnexContext("kmq_test", 0, 1));
        } else {
            this.kmq = Knex(generateKnexContext("kmq", 0, 10));
        }
        this.kpopVideos = Knex(generateKnexContext("kpop_videos", 0, 10));
        this.agnostic = Knex(generateKnexContext(null, 0, 1));
        this.kpopVideosValidation = Knex(generateKnexContext("kpop_videos_validation", 0, 1));
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
