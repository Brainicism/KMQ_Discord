import { Kysely, MysqlDialect } from "kysely";
import { config } from "dotenv";
import { createPool } from "mysql2";
import { resolve } from "path";
import EnvType from "./enums/env_type";
import type { InfoSchemaDB, KmqDB, KpopVideosDB } from "kysely-codegen";

config({ path: resolve(__dirname, "../.env") });

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
    public kmq2: Kysely<KmqDB>;
    public kpopVideos: Kysely<KpopVideosDB>;
    public infoSchema: Kysely<InfoSchemaDB>;
    public kpopVideosValidation: Kysely<KpopVideosDB>;
    public agnostic: Kysely<null>;

    constructor() {
        if (process.env.NODE_ENV === EnvType.TEST) {
            this.kmq2 = generateKysleyContext<KmqDB>("kmq_test", 1);

            this.kpopVideos = generateKysleyContext<KpopVideosDB>(
                "kpop_videos_test",
                1
            );
        } else {
            this.kmq2 = generateKysleyContext<KmqDB>("kmq", 20);
            this.kpopVideos = generateKysleyContext<KpopVideosDB>(
                "kpop_videos",
                5
            );
        }

        this.infoSchema = generateKysleyContext("information_schema", 1);
        this.agnostic = generateKysleyContext(undefined, 1);
        this.kpopVideosValidation = generateKysleyContext(
            "kpop_videos_validation",
            1
        );
    }

    async destroy(): Promise<void> {
        if (this.kmq2) {
            await this.kmq2.destroy();
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
