/* eslint-disable no-await-in-loop */
import * as cp from "child_process";
import { DATABASE_DOWNLOAD_DIR, DataFiles } from "../constants";
import { IPCLogger } from "../logger";
import { config } from "dotenv";
import { getNewConnection } from "../database_context";
import { parseJsonFile, pathExists } from "../helpers/utils";
import { program } from "commander";
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
    "http://kpop.daisuki.com.br/download.php?file=full";

const logger = new IPCLogger("seed_db");

const MONITORED_DAISUKI_TABLES = [
    "app_kpop",
    "app_kpop_group",
    "app_kpop_gaondigi",
    "app_kpop_ms",
    "app_kpop_agrelation",
];

/**
 * @param db - The database context
 * @param databaseName - The database name
 * @returns whether the database exists
 */
export async function databaseExists(
    db: DatabaseContext,
    databaseName: string
): Promise<boolean> {
    return (
        (
            await db
                .agnostic("information_schema.schemata")
                .where("schema_name", "=", databaseName)
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
    tableName: string
): Promise<boolean> {
    return (
        (
            (await db
                .agnostic("information_schema.tables")
                .where("table_schema", "=", databaseName)
                .where("table_name", "=", tableName)
                .count("* as count")
                .first()) as any
        ).count === 1
    );
}

async function listTables(
    db: DatabaseContext,
    databaseName: string
): Promise<Array<string>> {
    return (
        await db
            .agnostic("information_schema.tables")
            .where("table_schema", "=", databaseName)
            .select("table_name")
    ).map((x) => x["table_name"]);
}

program
    .option("-p, --skip-pull", "Skip re-pull of Daisuki database dump", false)
    .option(
        "-r, --skip-reseed",
        "Force skip drop/create of kpop_videos database",
        false
    )
    .option(
        "-d, --skip-download",
        "Skip download/encode of videos in database",
        false
    )
    .option("--limit <limit>", "Limit the number of songs to download", (x) =>
        parseInt(x, 10)
    );

program.parse();
const options = program.opts();

async function getOverrideQueries(db: DatabaseContext): Promise<Array<string>> {
    return (await db.kmq("kpop_videos_sql_overrides").select(["query"])).map(
        (x) => x.query
    );
}

/**
 * Re-creates the KMQ data tables
 * @param db - The database context
 */
export async function generateKmqDataTables(
    db: DatabaseContext
): Promise<void> {
    logger.info("Re-creating KMQ data tables view...");
    await db.kmq.raw(
        `CALL CreateKmqDataTables(${process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST});`
    );
}

/**
 * Re-creates the KMQ data tables
 * @param db - The database context
 */
export async function deduplicateGroupNames(
    db: DatabaseContext
): Promise<void> {
    logger.info("Deduplicating group names...");
    await db.kmq.raw("CALL DeduplicateGroupNames();");
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
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq < ${storedProcedureDefinition}`
        );
    }
}

const downloadDb = async (): Promise<void> => {
    const mvOutput = `${DATABASE_DOWNLOAD_DIR}/mv-download.zip`;
    const daisukiDownloadResp = await Axios.get(daisukiDbDownloadUrl, {
        responseType: "arraybuffer",
        headers: {
            "User-Agent": "KMQ (K-pop Music Quiz)",
        },
    });

    await fs.promises.writeFile(mvOutput, daisukiDownloadResp.data, {
        encoding: null,
    });
    logger.info("Downloaded Daisuki database archive");
};

async function extractDb(): Promise<void> {
    await fs.promises.mkdir(`${DATABASE_DOWNLOAD_DIR}/`, { recursive: true });
    await exec(
        `unzip -oq ${DATABASE_DOWNLOAD_DIR}/mv-download.zip -d ${DATABASE_DOWNLOAD_DIR}/`
    );

    logger.info("Extracted Daisuki database");
}

async function recordDaisukiTableSchema(db: DatabaseContext): Promise<void> {
    const frozenTableColumnNames = {};
    await Promise.allSettled(
        MONITORED_DAISUKI_TABLES.map(async (table) => {
            const commaSeparatedColumnNames = (
                await db.agnostic.raw(
                    `SELECT group_concat(COLUMN_NAME) as x FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'kpop_videos' AND TABLE_NAME = '${table}';`
                )
            )[0][0]["x"];

            const columnNames = _.sortBy(commaSeparatedColumnNames.split(","));
            frozenTableColumnNames[table] = columnNames;
        })
    );

    await fs.promises.writeFile(
        DataFiles.FROZEN_TABLE_SCHEMA,
        JSON.stringify(frozenTableColumnNames)
    );
}

async function validateDaisukiTableSchema(
    db: DatabaseContext,
    frozenSchema: any
): Promise<void> {
    const outputMessages: Array<string> = [];
    await Promise.allSettled(
        MONITORED_DAISUKI_TABLES.map(async (table) => {
            const commaSeparatedColumnNames = (
                await db.agnostic.raw(
                    `SELECT group_concat(COLUMN_NAME) as x FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'kpop_videos_validation' AND TABLE_NAME = '${table}';`
                )
            )[0][0]["x"];

            const columnNames = _.sortBy(commaSeparatedColumnNames.split(","));
            if (!_.isEqual(frozenSchema[table], columnNames)) {
                const addedColumns = _.difference(
                    columnNames,
                    frozenSchema[table]
                );

                const removedColumns = _.difference(
                    frozenSchema[table],
                    columnNames
                );

                if (addedColumns.length > 0 || removedColumns.length > 0) {
                    outputMessages.push(
                        `__${table}__\nAdded columns: ${JSON.stringify(
                            addedColumns
                        )}.\nRemoved Columns: ${JSON.stringify(
                            removedColumns
                        )}\n`
                    );
                }
            }
        })
    );

    if (outputMessages.length > 0) {
        outputMessages.unshift("Daisuki schema has changed.");
        outputMessages.push(
            "If the Daisuki schema change is acceptable, delete frozen schema file and re-run this script"
        );
        throw new Error(outputMessages.join("\n"));
    }
}

async function validateSqlDump(
    db: DatabaseContext,
    mvSeedFilePath: string,
    bootstrap = false
): Promise<void> {
    try {
        await db.agnostic.raw(
            "DROP DATABASE IF EXISTS kpop_videos_validation;"
        );
        await db.agnostic.raw("CREATE DATABASE kpop_videos_validation;");
        await exec(
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${mvSeedFilePath}`
        );

        logger.info("Validating MV song count");
        const mvSongCount = (
            (await db
                .kpopVideosValidation("app_kpop")
                .count("* as count")
                .where("is_audio", "=", "n")
                .first()) as any
        ).count;

        logger.info(`Found ${mvSongCount} music videos`);

        logger.info("Validating audio-only song count");
        const audioSongCount = (
            (await db
                .kpopVideosValidation("app_kpop")
                .count("* as count")
                .where("is_audio", "=", "y")
                .first()) as any
        ).count;

        logger.info(`Found ${audioSongCount} audio-only videos`);

        logger.info("Validating group count");
        const artistCount = (
            (await db
                .kpopVideosValidation("app_kpop_group")
                .count("* as count")
                .first()) as any
        ).count;

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

        await Promise.allSettled(
            overrideQueries.map(async (overrideQuery) => {
                await db.kpopVideosValidation.raw(overrideQuery);
            })
        );

        if (!bootstrap) {
            logger.info("Validating deduplication of group names");
            const originalDedupGroupNamesSqlPath = path.join(
                __dirname,
                "../../sql/procedures/deduplicate_app_kpop_group_names.sql"
            );

            const validationDedupGroupNamesSqlPath = path.join(
                __dirname,
                "../../sql/deduplicate_app_kpop_group_names.validation.sql"
            );

            await exec(
                `sed 's/kpop_videos/kpop_videos_validation/g' ${originalDedupGroupNamesSqlPath} > ${validationDedupGroupNamesSqlPath}`
            );

            await exec(
                `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${validationDedupGroupNamesSqlPath}`
            );

            await db.kpopVideosValidation.raw("CALL DeduplicateGroupNames();");

            logger.info("Validating creation of data tables");
            const originalCreateKmqTablesProcedureSqlPath = path.join(
                __dirname,
                "../../sql/procedures/create_kmq_data_tables_procedure.sql"
            );

            const validationCreateKmqTablesProcedureSqlPath = path.join(
                __dirname,
                "../../sql/create_kmq_data_tables_procedure.validation.sql"
            );

            await exec(
                `sed 's/kpop_videos/kpop_videos_validation/g' ${originalCreateKmqTablesProcedureSqlPath} > ${validationCreateKmqTablesProcedureSqlPath}`
            );

            await exec(
                `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${validationCreateKmqTablesProcedureSqlPath}`
            );

            await db.kpopVideosValidation.raw(
                `CALL CreateKmqDataTables(${process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST});`
            );
        }
    } catch (e) {
        throw new Error(
            `SQL dump validation failed. ${e.sqlMessage || e.stderr || e}`
        );
    }

    if (await pathExists(DataFiles.FROZEN_TABLE_SCHEMA)) {
        logger.info("Daisuki schema exists... checking for changes");
        const frozenSchema = await parseJsonFile(DataFiles.FROZEN_TABLE_SCHEMA);
        await validateDaisukiTableSchema(db, frozenSchema);
    }

    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_validation;");
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

    await validateSqlDump(db, dbSeedFilePath, bootstrap);

    // importing dump into temporary database
    logger.info("Dropping K-Pop video temporary database");
    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_tmp;");
    logger.info("Creating K-Pop video temporary database");
    await db.agnostic.raw("CREATE DATABASE kpop_videos_tmp;");
    logger.info("Seeding K-Pop video temporary database");
    await exec(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_tmp < ${dbSeedFilePath}`
    );

    // update table using data from temporary database, without downtime
    logger.info("Updating K-pop database from temporary database");
    for (const tableName of await listTables(db, "kpop_videos_tmp")) {
        const kpopVideoTableExists = await tableExists(
            db,
            "kpop_videos",
            tableName
        );

        if (!(await databaseExists(db, "kpop_videos"))) {
            logger.info("Database 'kpop_videos' doesn't exist, creating...");
            await db.agnostic.raw("CREATE DATABASE kpop_videos;");
        }

        if (kpopVideoTableExists) {
            logger.info(`Table '${tableName}' exists, updating...`);
            await db.kpopVideos.raw("DROP TABLE IF EXISTS kpop_videos.old;");
            await db.kpopVideos.raw(
                `RENAME TABLE kpop_videos.${tableName} TO old, kpop_videos_tmp.${tableName} TO kpop_videos.${tableName};`
            );
        } else {
            logger.info(`Table '${tableName} doesn't exist, creating...`);

            await db.agnostic.raw(
                `ALTER TABLE kpop_videos_tmp.${tableName} RENAME kpop_videos.${tableName}`
            );
        }
    }

    await db.kpopVideos.raw("DROP TABLE IF EXISTS kpop_videos.old;");
    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_tmp;");

    // override queries
    logger.info("Performing data overrides");
    const overrideQueries = await getOverrideQueries(db);

    // update collations of columns that have user-inputted queries
    logger.info("Updating collation overrides");
    await db.kpopVideos.raw(
        "ALTER TABLE app_kpop_group MODIFY name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    );

    await db.kpopVideos.raw(
        "ALTER TABLE app_kpop_group MODIFY kname VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    );

    await Promise.allSettled(
        overrideQueries.map(async (overrideQuery) => {
            await db.kpopVideos.raw(overrideQuery);
        })
    );

    logger.info(
        "Imported database dump successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing"
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
        /mainbackup_([0-9]{4}-[0-9]{2}-[0-9]{2}).sql/
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
            `find ${DATABASE_DOWNLOAD_DIR} -mindepth 1 -name "*backup_*" -mtime +${SQL_DUMP_EXPIRY} -delete`
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
    bootstrap = false
): Promise<void> {
    if (!options.skipPull && !bootstrap) {
        await downloadDb();
        await extractDb();
    } else {
        logger.info("Skipping Daisuki SQL dump pull...");
    }

    if (!options.skipReseed) {
        await seedDb(db, bootstrap);
    } else {
        logger.info("Skipping reseed");
    }
}

/**
 * Regenerates the available group list
 * @param db - Database context
 */
export async function updateGroupList(db: DatabaseContext): Promise<void> {
    const result = await db
        .kpopVideos("app_kpop_group")
        .select(["name", "members as gender"])
        .where("is_collab", "=", "n")
        .orderBy("name", "ASC");

    await fs.promises.writeFile(
        DataFiles.GROUP_LIST,
        result.map((x) => x.name).join("\n")
    );
}

/**
 * @param db - The database context
 */
async function seedAndDownloadNewSongs(db: DatabaseContext): Promise<void> {
    await pruneSqlDumps();
    try {
        await updateKpopDatabase(db);
    } catch (e) {
        logger.error(`Failed to update kpop_videos database. ${e}`);
        throw e;
    }

    let songsDownloaded = 0;
    if (!options.skipDownload) {
        songsDownloaded = await downloadAndConvertSongs(options.limit);
    }

    await deduplicateGroupNames(db);
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
        `Finishing seeding and downloading ${songsDownloaded} new songs`
    );
}

(async () => {
    if (require.main === module) {
        const db = getNewConnection();
        try {
            await loadStoredProcedures();
            await seedAndDownloadNewSongs(db);
        } catch (e) {
            logger.error(e);
            process.exit(1);
        } finally {
            await db.destroy();
        }
    }
})();

export { seedAndDownloadNewSongs, updateKpopDatabase };
