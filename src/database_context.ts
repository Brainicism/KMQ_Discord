import { Knex, knex } from "knex";
import { resolve } from "path";
import { config } from "dotenv";
import { EnvType } from "./types";

config({ path: resolve(__dirname, "../.env") });

function generateKnexContext(databaseName: string, minPoolSize = 0, maxPoolSize: number) {
    return {
        client: "mysql2",
        connection: {
            user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, host: process.env.DB_HOST, charset: "utf8mb4", port: parseInt(process.env.DB_PORT), decimalNumbers: true,
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
        if ([EnvType.CI].includes(process.env.NODE_ENV as EnvType)) return;
        if (process.env.NODE_ENV === EnvType.TEST) {
            this.kmq = knex(generateKnexContext("kmq_test", 0, 1));
        } else {
            this.kmq = knex(generateKnexContext("kmq", 0, 5));
        }
        this.kpopVideos = knex(generateKnexContext("kpop_videos", 0, 1));
        this.agnostic = knex(generateKnexContext(null, 0, 1));
        this.kpopVideosValidation = knex(generateKnexContext("kpop_videos_validation", 0, 1));
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
