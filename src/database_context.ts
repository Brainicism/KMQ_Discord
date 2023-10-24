import { Kysely, MysqlDialect } from "kysely";
import { config } from "dotenv";
import { createPool } from "mysql2";
import { resolve } from "path";
import EmptyWhereInPlugin from "./kysely/plugins/empty-where-in-plugin/plugin";
import EnvType from "./enums/env_type";
import type { InfoSchemaDB } from "./typings/info_schema_db";
import type { KmqDB } from "./typings/kmq_db";
import type { KpopVideosDB } from "./typings/kpop_videos_db";

config({ path: resolve(__dirname, "../.env") });

function generateKysleyContext<T>(
    databaseName: string | undefined,
    maxPoolSize: number,
): Kysely<T> {
    return new Kysely<T>({
        dialect: new MysqlDialect({
            pool: createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASS,
                database: databaseName,
                connectionLimit: maxPoolSize,
                charset: "utf8mb4",
                port: parseInt(process.env.DB_PORT as string, 10),
                decimalNumbers: true,
                multipleStatements: true,
            }),
        }),
        plugins: [new EmptyWhereInPlugin()],
    });
}

export class DatabaseContext {
    public kmq: Kysely<KmqDB>;
    public kpopVideos: Kysely<KpopVideosDB>;
    public infoSchema: Kysely<InfoSchemaDB>;
    public kpopVideosValidation: Kysely<KpopVideosDB>;
    public agnostic: Kysely<null>;

    constructor() {
        if (process.env.NODE_ENV === EnvType.TEST) {
            this.kmq = generateKysleyContext<KmqDB>("kmq_test", 1);

            this.kpopVideos = generateKysleyContext<KpopVideosDB>(
                "kpop_videos_test",
                1,
            );
        } else {
            this.kmq = generateKysleyContext<KmqDB>("kmq", 20);
            this.kpopVideos = generateKysleyContext<KpopVideosDB>(
                "kpop_videos",
                5,
            );
        }

        this.infoSchema = generateKysleyContext("information_schema", 1);
        this.agnostic = generateKysleyContext(undefined, 1);
        this.kpopVideosValidation = generateKysleyContext(
            "kpop_videos_validation",
            1,
        );
    }

    async destroy(): Promise<void> {
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
