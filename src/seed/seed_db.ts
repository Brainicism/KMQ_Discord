/* eslint-disable no-await-in-loop */
import * as cp from "child_process";
import {
    DATABASE_DOWNLOAD_DIR,
    DataFiles,
    EMBED_ERROR_COLOR,
    KMQ_USER_AGENT,
    KmqImages,
} from "../constants";
import { IPCLogger } from "../logger";
import { config } from "dotenv";
import { getNewConnection } from "../database_context";
import { parseJsonFile, pathExists } from "../helpers/utils";
import { program } from "commander";
import { sendDebugAlertWebhook } from "../helpers/discord_utils";
import { sql } from "kysely";
import Axios from "axios";
import EnvType from "../enums/env_type";
import _ from "lodash";
import downloadAndConvertSongs from "../scripts/download-new-songs";
import fs from "fs";
import path from "path";
import util from "util";
import type { DatabaseContext } from "../database_context";

const exec = util.promisify(cp.exec);

config({ path: path.resolve(__dirname, "../../.env") });
const SQL_DUMP_EXPIRY = 10;
const daisukiDbDownloadUrl =
    "http://kpop.daisuki.com.br/download.php?pass=$PASSWORD";

const logger = new IPCLogger("seed_db");

async function getDaisukiTableNames(db: DatabaseContext): Promise<string[]> {
    return (
        await db.infoSchema
            .selectFrom("TABLES")
            .select("TABLE_NAME")
            .where("TABLE_SCHEMA", "=", "kpop_videos")
            .execute()
    ).map((x) => x.TABLE_NAME);
}

/**
 * @param db - The database context
 * @param databaseName - The database name
 * @returns whether the database exists
 */
export async function databaseExists(
    db: DatabaseContext,
    databaseName: string,
): Promise<boolean> {
    return (
        (
            await db.infoSchema
                .selectFrom("SCHEMATA")
                .selectAll()
                .where("SCHEMA_NAME", "=", databaseName)
                .execute()
        ).length === 1
    );
}

/**
 * @param db - The database context
 * @param databaseName - The database name
 * @param tableName - The table name
 * @returns whether the table exists
 */
export async function tableExists(
    db: DatabaseContext,
    databaseName: string,
    tableName: string,
): Promise<boolean> {
    return (
        (
            await db.infoSchema
                .selectFrom("TABLES")
                .where("TABLE_SCHEMA", "=", databaseName)
                .where("TABLE_NAME", "=", tableName)
                .select((eb) => eb.fn.countAll<number>().as("count"))
                .executeTakeFirstOrThrow()
        ).count === 1
    );
}

async function listTables(
    db: DatabaseContext,
    databaseName: string,
): Promise<Array<string>> {
    return (
        await db.infoSchema
            .selectFrom("TABLES")
            .where("TABLE_SCHEMA", "=", databaseName)
            .select("TABLE_NAME")
            .execute()
    ).map((x) => x["TABLE_NAME"]);
}

program
    .option("-p, --skip-pull", "Skip re-pull of Daisuki database dump", false)
    .option(
        "-r, --skip-reseed",
        "Force skip drop/create of kpop_videos database",
        false,
    )
    .option("-v, --skip-validate", "Skip test database validation", false)
    .option(
        "-d, --skip-download",
        "Skip download/encode of videos in database",
        false,
    )
    .option("--limit <limit>", "Limit the number of songs to download", (x) =>
        parseInt(x, 10),
    )
    .option("--songs <songs>", "Comma seperated youtube IDs to download", (x) =>
        x.split(",").map((y) => y.trim()),
    );

program.parse();
const options = program.opts();

async function getOverrideQueries(db: DatabaseContext): Promise<Array<string>> {
    return (
        await db.kmq
            .selectFrom("kpop_videos_sql_overrides")
            .select(["query"])
            .execute()
    ).map((x) => x.query);
}

/**
 * Re-creates the KMQ data tables
 * @param db - The database context
 */
export async function generateKmqDataTables(
    db: DatabaseContext,
): Promise<void> {
    logger.info("Re-creating KMQ data tables view...");
    await sql`CALL CreateKmqDataTables();`.execute(db.kmq);
}

/**
 * Re-creates the KMQ data tables
 * @param db - The database context
 */
export async function postSeedDataCleaning(db: DatabaseContext): Promise<void> {
    logger.info("Performing post seed data cleaning...");
    await sql`CALL PostSeedDataCleaning();`.execute(db.kmq);
}

/**
 * Reloads all existing stored procedures
 */
export async function loadStoredProcedures(): Promise<void> {
    const storedProcedureDefinitions = (
        await fs.promises.readdir(path.join(__dirname, "../../sql/procedures"))
    ).map((x) => path.join(__dirname, "../../sql/procedures", x));

    for (const storedProcedureDefinition of storedProcedureDefinitions) {
        await exec(
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq < ${storedProcedureDefinition}`,
        );
    }
}

/**
 * Update typings for Kyseley
 * @param db - The database context
 */
export async function updateDaisukiSchemaTypings(
    db: DatabaseContext,
): Promise<void> {
    await db.kpopVideos.schema
        .alterTable("app_kpop_group")
        .modifyColumn("name", "varchar(255)", (cb) => cb.notNull())
        .execute();

    await exec(
        `bash ${path.resolve(
            __dirname,
            "../scripts/prepare-kysely-schema.sh",
        )}`,
    );
}

const downloadDb = async (): Promise<void> => {
    const mvOutput = `${DATABASE_DOWNLOAD_DIR}/mv-download.zip`;
    const daisukiDownloadResp = await Axios.get(
        daisukiDbDownloadUrl.replace(
            "$PASSWORD",
            process.env.DAISUKI_DB_PASSWORD as string,
        ),
        {
            responseType: "arraybuffer",
            headers: {
                "User-Agent": KMQ_USER_AGENT,
            },
        },
    );

    await fs.promises.writeFile(mvOutput, daisukiDownloadResp.data, {
        encoding: null,
    });
    logger.info("Downloaded Daisuki database archive");
};

async function extractDb(): Promise<void> {
    await fs.promises.mkdir(`${DATABASE_DOWNLOAD_DIR}/`, { recursive: true });
    await exec(
        `unzip -oq ${DATABASE_DOWNLOAD_DIR}/mv-download.zip -d ${DATABASE_DOWNLOAD_DIR}/`,
    );

    logger.info("Extracted Daisuki database");
}

async function recordDaisukiTableSchema(db: DatabaseContext): Promise<void> {
    const frozenTableColumnNames: { [table: string]: string[] } = {};
    await Promise.allSettled(
        (await getDaisukiTableNames(db)).map(async (table) => {
            const commaSeparatedColumnNames = (
                await db.infoSchema
                    .selectFrom("COLUMNS")
                    .select((eb) =>
                        eb.fn<string>("group_concat", ["COLUMN_NAME"]).as("x"),
                    )
                    .where("TABLE_SCHEMA", "=", "kpop_videos")
                    .where("TABLE_NAME", "=", table)
                    .executeTakeFirstOrThrow()
            ).x;

            const columnNames = _.sortBy(commaSeparatedColumnNames.split(","));
            frozenTableColumnNames[table] = columnNames;
        }),
    );

    await fs.promises.writeFile(
        DataFiles.FROZEN_TABLE_SCHEMA,
        JSON.stringify(frozenTableColumnNames),
    );
}

async function validateDaisukiTableSchema(
    db: DatabaseContext,
    frozenSchema: any,
): Promise<void> {
    const outputMessages: Array<string> = [];
    await Promise.allSettled(
        (await getDaisukiTableNames(db)).map(async (table) => {
            const commaSeparatedColumnNames = (
                await db.infoSchema
                    .selectFrom("COLUMNS")
                    .select((eb) =>
                        eb.fn<string>("group_concat", ["COLUMN_NAME"]).as("x"),
                    )
                    .where("TABLE_SCHEMA", "=", "kpop_videos_validation")
                    .where("TABLE_NAME", "=", table)
                    .executeTakeFirstOrThrow()
            ).x;

            const columnNames = _.sortBy(commaSeparatedColumnNames.split(","));
            if (!_.isEqual(frozenSchema[table], columnNames)) {
                const addedColumns = _.difference(
                    columnNames,
                    frozenSchema[table],
                );

                const removedColumns = _.difference(
                    frozenSchema[table],
                    columnNames,
                );

                if (addedColumns.length > 0 || removedColumns.length > 0) {
                    outputMessages.push(
                        `__${table}__\nAdded columns: ${JSON.stringify(
                            addedColumns,
                        )}.\nRemoved Columns: ${JSON.stringify(
                            removedColumns,
                        )}\n`,
                    );
                }
            }
        }),
    );

    if (outputMessages.length > 0) {
        outputMessages.unshift("Daisuki schema has changed.");
        outputMessages.push(
            "If the Daisuki schema change is acceptable, delete frozen schema file and re-run this script",
        );
        throw new Error(outputMessages.join("\n"));
    }
}

async function validateSqlDump(
    db: DatabaseContext,
    mvSeedFilePath: string,
    bootstrap = false,
): Promise<void> {
    try {
        await sql`DROP DATABASE IF EXISTS kpop_videos_validation;`.execute(
            db.agnostic,
        );

        await sql`CREATE DATABASE kpop_videos_validation;`.execute(db.agnostic);

        await exec(
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${mvSeedFilePath}`,
        );

        logger.info("Validating MV song count");
        const mvSongCount = (await db.kpopVideosValidation
            .selectFrom("app_kpop")
            .select((eb) => eb.fn.countAll<number>().as("count"))
            .where("is_audio", "=", "n")
            .executeTakeFirst())!.count;

        logger.info(`Found ${mvSongCount} music videos`);

        logger.info("Validating audio-only song count");
        const audioSongCount = (await db.kpopVideosValidation
            .selectFrom("app_kpop")
            .select((eb) => eb.fn.countAll<number>().as("count"))
            .where("is_audio", "=", "y")
            .executeTakeFirst())!.count;

        logger.info(`Found ${audioSongCount} audio-only videos`);

        logger.info("Validating group count");
        const artistCount = (await db.kpopVideosValidation
            .selectFrom("app_kpop_group")
            .select((eb) => eb.fn.countAll<number>().as("count"))
            .executeTakeFirst())!.count;

        logger.info(`Found ${artistCount} artists`);

        if (
            mvSongCount < 10000 ||
            audioSongCount < 1000 ||
            artistCount < 1000
        ) {
            throw new Error("SQL dump valid, but potentially missing data.");
        }

        logger.info("Validating overrides");
        const overrideQueries = await getOverrideQueries(db);

        await Promise.all(
            overrideQueries.map(async (overrideQuery) => {
                await sql.raw(overrideQuery).execute(db.kpopVideosValidation);
            }),
        );

        if (!bootstrap) {
            logger.info("Validating post-seed data cleaning");
            const originalDedupGroupNamesSqlPath = path.join(
                __dirname,
                "../../sql/procedures/post_seed_data_cleaning_procedure.sql",
            );

            const validationDedupGroupNamesSqlPath = path.join(
                __dirname,
                "../../sql/post_seed_data_cleaning_procedure.validation.sql",
            );

            await exec(
                `sed 's/kpop_videos/kpop_videos_validation/g' ${originalDedupGroupNamesSqlPath} > ${validationDedupGroupNamesSqlPath}`,
            );

            await exec(
                `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${validationDedupGroupNamesSqlPath}`,
            );

            await sql
                .raw("CALL PostSeedDataCleaning();")
                .execute(db.kpopVideosValidation);

            logger.info("Validating creation of data tables");
            const originalCreateKmqTablesProcedureSqlPath = path.join(
                __dirname,
                "../../sql/procedures/create_kmq_data_tables_procedure.sql",
            );

            const validationCreateKmqTablesProcedureSqlPath = path.join(
                __dirname,
                "../../sql/create_kmq_data_tables_procedure.validation.sql",
            );

            await exec(
                `sed 's/kpop_videos/kpop_videos_validation/g' ${originalCreateKmqTablesProcedureSqlPath} > ${validationCreateKmqTablesProcedureSqlPath}`,
            );

            await exec(
                `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${validationCreateKmqTablesProcedureSqlPath}`,
            );

            await sql
                .raw("CALL CreateKmqDataTables();")
                .execute(db.kpopVideosValidation);
        }
    } catch (e) {
        throw new Error(
            `SQL dump validation failed. ${e.sqlMessage || e.stderr || e}`,
        );
    }

    if (await pathExists(DataFiles.FROZEN_TABLE_SCHEMA)) {
        logger.info("Daisuki schema exists... checking for changes");
        const frozenSchema = await parseJsonFile(DataFiles.FROZEN_TABLE_SCHEMA);
        await validateDaisukiTableSchema(db, frozenSchema);
    }

    logger.info("SQL dump validated successfully");
}

async function seedDb(db: DatabaseContext, bootstrap: boolean): Promise<void> {
    try {
        await fs.promises.mkdir(DATABASE_DOWNLOAD_DIR);
        logger.info("Creating database download");
    } catch (e) {
        logger.info("Database download directory already exists");
    }

    // validating SQL dump
    const sqlFiles = (
        await fs.promises.readdir(`${DATABASE_DOWNLOAD_DIR}`)
    ).filter((x) => x.endsWith(".sql"));

    const dbSeedFile = sqlFiles
        .filter((x) => x.endsWith(".sql") && x.startsWith("mainbackup_"))
        .slice(-1)[0];

    const dbSeedFilePath = bootstrap
        ? `${DATABASE_DOWNLOAD_DIR}/bootstrap.sql`
        : `${DATABASE_DOWNLOAD_DIR}/${dbSeedFile}`;

    logger.info(`Validating SQL dump (${path.basename(dbSeedFilePath)})`);

    if (!options.skipValidate) {
        await validateSqlDump(db, dbSeedFilePath, bootstrap);
    }

    // importing dump into temporary database
    logger.info("Dropping K-Pop video temporary database");
    await sql`DROP DATABASE IF EXISTS kpop_videos_tmp;`.execute(db.agnostic);
    logger.info("Creating K-Pop video temporary database");
    await sql`CREATE DATABASE kpop_videos_tmp;`.execute(db.agnostic);
    logger.info("Seeding K-Pop video temporary database");
    await exec(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_tmp < ${dbSeedFilePath}`,
    );

    // update table using data from temporary database, without downtime
    logger.info("Updating K-pop database from temporary database");
    for (const tableName of await listTables(db, "kpop_videos_tmp")) {
        const kpopVideoTableExists = await tableExists(
            db,
            "kpop_videos",
            tableName,
        );

        if (!(await databaseExists(db, "kpop_videos"))) {
            logger.info("Database 'kpop_videos' doesn't exist, creating...");
            await sql`CREATE DATABASE kpop_videos;`.execute(db.agnostic);
        }

        if (kpopVideoTableExists) {
            logger.info(`Table '${tableName}' exists, updating...`);
            await sql`DROP TABLE IF EXISTS kpop_videos.old`.execute(
                db.agnostic,
            );

            await sql`RENAME TABLE kpop_videos.${sql.raw(
                tableName,
            )} TO old, kpop_videos_tmp.${sql.raw(
                tableName,
            )} TO kpop_videos.${sql.raw(tableName)};`.execute(db.kpopVideos);
        } else {
            logger.info(`Table '${tableName}' doesn't exist, creating...`);
            await sql
                .raw(
                    `ALTER TABLE kpop_videos_tmp.${tableName} RENAME kpop_videos.${tableName}`,
                )
                .execute(db.agnostic);
        }
    }

    await sql`DROP TABLE IF EXISTS kpop_videos.old;`.execute(db.agnostic);
    await sql`DROP DATABASE IF EXISTS kpop_videos_tmp;`.execute(db.agnostic);

    // override queries
    logger.info("Performing data overrides");
    const overrideQueries = await getOverrideQueries(db);

    // update collations of columns that have user-inputted queries
    logger.info("Updating collation overrides");
    await sql`ALTER TABLE app_kpop_group MODIFY name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`.execute(
        db.kpopVideos,
    );

    await sql`ALTER TABLE app_kpop_group MODIFY kname VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`.execute(
        db.kpopVideos,
    );

    await Promise.all(
        overrideQueries.map(async (overrideQuery) =>
            sql.raw(overrideQuery).execute(db.kpopVideos),
        ),
    );

    logger.info(
        "Imported database dump successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing",
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function hasRecentDump(): Promise<boolean> {
    const dumpPath = `${DATABASE_DOWNLOAD_DIR}/sql`;
    let files: string[];
    try {
        files = await fs.promises.readdir(dumpPath);
    } catch (err) {
        // If the directory doesn't exist, we don't have a recent dump.
        if (err.code === "ENOENT") return false;
        // Otherwise just throw.
        throw err;
    }

    if (files.length === 0) return false;

    const seedFiles = files[files.length - 1].match(
        /mainbackup_([0-9]{4}-[0-9]{2}-[0-9]{2}).sql/,
    );

    if (!seedFiles) {
        logger.error("No matching seed files found");
        return false;
    }

    const seedFileDateString = seedFiles[1];
    logger.info(`Most recent seed file has date: ${seedFileDateString}`);
    const daysDiff =
        (new Date().getTime() - Date.parse(seedFileDateString)) / 86400000;

    return daysDiff < 6;
}

async function pruneSqlDumps(): Promise<void> {
    try {
        await exec(
            `find ${DATABASE_DOWNLOAD_DIR} -mindepth 1 -name "*backup_*" -mtime +${SQL_DUMP_EXPIRY} -delete`,
        );
        logger.info("Finished pruning old SQL dumps");
    } catch (err) {
        logger.error(`Error attempting to prune SQL dumps directory, ${err}`);
    }
}

/**
 * @param db - The database context
 * @param bootstrap - Whether or not this is a bootstrap run
 */
async function updateKpopDatabase(
    db: DatabaseContext,
    bootstrap = false,
): Promise<void> {
    if (!options.skipPull && !bootstrap) {
        await downloadDb();
        await extractDb();
    } else {
        logger.info("Skipping Daisuki SQL dump pull...");
    }

    if (!options.skipReseed) {
        await seedDb(db, bootstrap);
        await postSeedDataCleaning(db);
    } else {
        logger.info("Skipping reseed");
    }
}

/**
 * Regenerates the available group list
 * @param db - Database context
 */
export async function updateGroupList(db: DatabaseContext): Promise<void> {
    const result = await db.kpopVideos
        .selectFrom("app_kpop_group")
        .select(["name", "members as gender"])
        .where("is_collab", "=", "n")
        .where("has_songs", "=", 1)
        .orderBy("name", "asc")
        .execute();

    await fs.promises.writeFile(
        DataFiles.GROUP_LIST,
        result.map((x) => x.name).join("\n"),
    );
}

/**
 * @param db - The database context
 */
async function seedAndDownloadNewSongs(db: DatabaseContext): Promise<void> {
    logger.info("Performing regularly scheduled Daisuki database seed");
    try {
        await pruneSqlDumps();
        try {
            await updateKpopDatabase(db);
        } catch (e) {
            logger.error(`Failed to update kpop_videos database. ${e}`);
            throw e;
        }

        let songsDownloaded = 0;
        if (!options.skipDownload) {
            songsDownloaded = await downloadAndConvertSongs(
                options.limit,
                options.songs,
            );
        }

        await generateKmqDataTables(db);
        if (process.env.NODE_ENV === EnvType.PROD) {
            await updateGroupList(db);
        }

        // freeze table schema
        if (!(await pathExists(DataFiles.FROZEN_TABLE_SCHEMA))) {
            logger.info("Frozen Daisuki schema doesn't exist... creating");
            await recordDaisukiTableSchema(db);
        }

        logger.info(
            `Finishing seeding and downloading ${songsDownloaded} new songs`,
        );
    } catch (e) {
        logger.error(`Download/seed failure: ${e}`);
        await sendDebugAlertWebhook(
            "Download and seed failure",
            e.toString(),
            EMBED_ERROR_COLOR,
            KmqImages.NOT_IMPRESSED,
        );
    }
}

async function reloadAutocompleteData(): Promise<void> {
    logger.info("Requesting autocomplete data reload");
    await Axios.post(
        `http://127.0.0.1:${process.env.WEB_SERVER_PORT}/reload_autocomplete`,
        {},
        {
            headers: {
                "Content-Type": "application/json",
            },
        },
    );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    if (require.main === module) {
        logger.info(JSON.stringify(options));
        const db = getNewConnection();
        try {
            await loadStoredProcedures();
            await seedAndDownloadNewSongs(db);
            try {
                await reloadAutocompleteData();
            } catch (e) {
                logger.warn(`reloadAutocompleteData failed with: ${e}`);
            }

            if (process.env.NODE_ENV !== EnvType.PROD) {
                await updateDaisukiSchemaTypings(db);
            }
        } catch (e) {
            logger.error(e);
            process.exit(1);
        } finally {
            await db.destroy();
        }
    }
})();

export { updateKpopDatabase };
