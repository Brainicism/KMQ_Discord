import { Kysely, MysqlDialect } from "kysely";
import { config } from "dotenv";
import { createPool } from "mysql2";
import { knex } from "knex";
import { resolve } from "path";
import EnvType from "./enums/env_type";
import type { InfoSchemaDB, KmqDB, KpopVideosDB } from "kysely-codegen";
import type { Knex } from "knex";

config({ path: resolve(__dirname, "../.env") });

function generateKnexContext(
    databaseName: string | null,
    minPoolSize: number,
    maxPoolSize: number
): any {
    return {
        client: "mysql2",
        connection: {
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: databaseName,
            host: process.env.DB_HOST,
            charset: "utf8mb4",
            port: parseInt(process.env.DB_PORT as string, 10),
            decimalNumbers: true,
            multipleStatements: true,
        },
        pool: {
            min: minPoolSize,
            max: maxPoolSize,
        },
    };
}

function generateKysleyContext<T>(
    databaseName: string | undefined,
    maxPoolSize: number
): Kysely<T> {
    return new Kysely<T>({
        dialect: new MysqlDialect({
            pool: createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASS,
                database: databaseName,
                connectionLimit: maxPoolSize,
            }),
        }),
    });
}

export class DatabaseContext {
    public kmq: Knex;
    public kmq2: Kysely<KmqDB>;
    public kpopVideos: Knex;
    public kpopVideos2: Kysely<KpopVideosDB>;
    public infoSchema: Kysely<InfoSchemaDB>;
    public kpopVideosValidation: Knex;
    public agnostic: Kysely<null>;

    constructor() {
        if (process.env.NODE_ENV === EnvType.TEST) {
            this.kmq = knex(generateKnexContext("kmq_test", 0, 1));
            this.kmq2 = generateKysleyContext<KmqDB>("kmq_test", 1);
            this.kpopVideos = knex(
                generateKnexContext("kpop_videos_test", 0, 1)
            );

            this.kpopVideos2 = generateKysleyContext<KpopVideosDB>(
                "kpop_videos_test",
                1
            );
        } else {
            this.kmq = knex(generateKnexContext("kmq", 0, 20));
            this.kmq2 = generateKysleyContext<KmqDB>("kmq", 20);
            this.kpopVideos = knex(generateKnexContext("kpop_videos", 0, 5));
            this.kpopVideos2 = generateKysleyContext<KpopVideosDB>(
                "kpop_videos",
                5
            );
        }

        this.infoSchema = generateKysleyContext("information_schema", 1);
        this.agnostic = generateKysleyContext(undefined, 1);
        this.kpopVideosValidation = knex(
            generateKnexContext("kpop_videos_validation", 0, 1)
        );
    }

    async destroy(): Promise<void> {
        if (this.kmq) {
            await this.kmq.destroy();
        }

        if (this.kmq2) {
            await this.kmq2.destroy();
        }

        if (this.kpopVideos) {
            await this.kpopVideos.destroy();
        }

        if (this.kpopVideos2) {
            await this.kpopVideos2.destroy();
        }

        if (this.agnostic) {
            await this.agnostic.destroy();
        }

        if (this.kpopVideosValidation) {
            await this.kpopVideosValidation.destroy();
        }

        await this.infoSchema.destroy();
    }
}

/**
 * @returns a new database connection
 */
export function getNewConnection(): DatabaseContext {
    return new DatabaseContext();
}

export default new DatabaseContext();
