/* eslint-disable no-await-in-loop */
import * as cp from "child_process";
import { Command } from "@commander-js/extra-typings";
import {
    DATABASE_DOWNLOAD_DIR,
    DataFiles,
    EMBED_DESCRIPTION_MAX_LENGTH,
    EMBED_ERROR_COLOR,
    EMBED_SUCCESS_COLOR,
    KMQ_USER_AGENT,
    KmqImages,
    LATEST_DAISUKI_DUMP,
} from "../constants";
import { IPCLogger } from "../logger";
import { config } from "dotenv";
import {
    discordDateFormat,
    parseJsonFile,
    pathExists,
    standardDateFormat,
    truncatedString,
} from "../helpers/utils";
import { getNewConnection } from "../database_context";
import {
    sendDebugAlertFileWebhook,
    sendInfoWebhook,
} from "../helpers/discord_utils";
import { sql } from "kysely";
import Axios from "axios";
import EnvType from "../enums/env_type";
import KmqSongDownloader from "../helpers/kmq_song_downloader";
import _ from "lodash";
import fs from "fs";
import path from "path";
import util from "util";
import type { DatabaseContext } from "../database_context";

const exec = util.promisify(cp.exec);

config({ path: path.resolve(__dirname, "../../.env") });
const SQL_DUMP_EXPIRY = 10;
const daisukiDbDownloadUrl = "https://soridata.com/download.php?pass=$PASSWORD";

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

async function getBetterAudioMapping(
    db: DatabaseContext,
): Promise<Record<string, string | null>> {
    let betterAudioMappings: Record<string, string | null> = {};
    if (await tableExists(db, "kmq", "expected_available_songs")) {
        betterAudioMappings = (
            await db.kmq
                .selectFrom("expected_available_songs")
                .select(["better_audio_link", "link"])
                .execute()
        ).reduce((acc: Record<string, string | null>, entry) => {
            acc[entry.link] = entry.better_audio_link;

            return acc;
        }, {});
    }

    return betterAudioMappings;
}

const program = new Command()
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
    )
    .option(
        "--check-song-durations",
        "Check if downloaded songs have a cached song duration",
        false,
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
async function postSeedDataCleaning(db: DatabaseContext): Promise<void> {
    logger.info("Performing post seed data cleaning...");
    await sql`CALL PostSeedDataCleaning();`.execute(db.kmq);
}

/**
 * Re-creates the KMQ data tables
 * @param db - The database context
 */
export async function generateExpectedAvailableSongs(
    db: DatabaseContext,
): Promise<void> {
    logger.info("Performing generate expected available songs...");
    await sql.raw("CALL GenerateExpectedAvailableSongs();").execute(db.kmq);
}

/**
 * Reloads all existing stored procedures
 */
export async function loadStoredProcedures(): Promise<void> {
    const storedProcedureDefinitions = (
        await fs.promises.readdir(path.join(__dirname, "../../sql/procedures"))
    )
        .map((x) => path.join(__dirname, "../../sql/procedures", x))
        .sort();

    for (const storedProcedureDefinition of storedProcedureDefinitions) {
        logger.info(`Loading procedure: ${storedProcedureDefinition}`);
        await exec(
            `mysql --default-character-set=utf8mb4 -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq < ${storedProcedureDefinition}`,
        );
    }
}

async function loadStoredProceduresForValidation(): Promise<void> {
    const storedProcedureDefinitions = (
        await fs.promises.readdir(path.join(__dirname, "../../sql/procedures"))
    )
        .map((x) => path.join(__dirname, "../../sql/procedures", x))
        .sort();

    for (const storedProcedureDefinition of storedProcedureDefinitions) {
        const testProcedurePath = path.resolve(
            path.dirname(storedProcedureDefinition),
            "..",
            path
                .basename(storedProcedureDefinition)
                .replace(".sql", ".validation.sql"),
        );

        await exec(
            `sed 's/kpop_videos/kpop_videos_validation/g' ${storedProcedureDefinition} > ${testProcedurePath}`,
        );

        logger.info(`Loading procedure for validation: ${testProcedurePath}`);

        await exec(
            `mysql --default-character-set=utf8mb4 -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${testProcedurePath}`,
        );
    }
}

/**
 * Update typings for Kyseley
 * @param db - The database context
 */
async function updateDaisukiSchemaTypings(db: DatabaseContext): Promise<void> {
    await db.kpopVideos.schema
        .alterTable("app_kpop_group_safe")
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

    await fs.promises.writeFile(LATEST_DAISUKI_DUMP, daisukiDownloadResp.data, {
        encoding: null,
    });
    logger.info("Downloaded Daisuki database archive");
};

async function extractDb(): Promise<void> {
    await fs.promises.mkdir(`${DATABASE_DOWNLOAD_DIR}/`, { recursive: true });
    await exec(`unzip -oq ${LATEST_DAISUKI_DUMP} -d ${DATABASE_DOWNLOAD_DIR}/`);

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
            await loadStoredProceduresForValidation();
            logger.info("Validating post-seed data cleaning");
            await sql
                .raw("CALL PostSeedDataCleaning();")
                .execute(db.kpopVideosValidation);

            logger.info("Validating generate expected available songs");
            await sql
                .raw("CALL GenerateExpectedAvailableSongs();")
                .execute(db.kpopVideosValidation);

            logger.info("Validating creation of data tables");
            await sql
                .raw("CALL CreateKmqDataTables();")
                .execute(db.kpopVideosValidation);
        }
    } catch (e) {
        throw new Error(
            `SQL dump validation failed. ${e.sqlMessage || e.stderr || e}. stack = ${new Error().stack}`,
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

    await Promise.all(
        overrideQueries.map(async (overrideQuery) =>
            sql.raw(overrideQuery).execute(db.kpopVideos),
        ),
    );

    logger.info(
        "Imported database dump successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing",
    );
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
 * Checks if the better audio links have been modified
 * @param db - The database context
 */
async function checkModifiedBetterAudioLinks(
    db: DatabaseContext,
): Promise<void> {
    logger.info("Checking if better audio links have been modified...");
    if (!(await tableExists(db, "kmq", "expected_available_songs"))) {
        logger.info(
            "Table 'expected_available_songs' doesn't exist (likely an initial seed), skipping better audio link check",
        );
        return;
    }

    const oldBetterAudioMapping = await getBetterAudioMapping(db);
    await generateExpectedAvailableSongs(db);
    const newBetterAudioMapping = await getBetterAudioMapping(db);

    const invalidatedBetterAudioToDelete: Array<string> = [];
    for (const primarySongLink in oldBetterAudioMapping) {
        if (primarySongLink in newBetterAudioMapping) {
            const oldBetterAudioLink = oldBetterAudioMapping[primarySongLink];

            const newBetterAudioLink = newBetterAudioMapping[primarySongLink];

            if (oldBetterAudioLink !== newBetterAudioLink) {
                logger.info(
                    `Better audio link change detected for ${primarySongLink}: ${oldBetterAudioLink} => ${newBetterAudioLink}... scheduling for deletion`,
                );

                invalidatedBetterAudioToDelete.push(primarySongLink);
            }
        }
    }

    if (invalidatedBetterAudioToDelete.length > 100) {
        throw new Error(
            `Number of invalidated better audio links is too high (${invalidatedBetterAudioToDelete.length}), this is unexpected. Please inspect the database state, do not re-seed.`,
        );
    }

    for (const songToDelete of invalidatedBetterAudioToDelete) {
        logger.info(`Deleting old better audio for ${songToDelete}`);
        const songAudioPath = path.resolve(
            process.env.SONG_DOWNLOAD_DIR!,
            `${songToDelete}.ogg`,
        );

        await db.kmq
            .deleteFrom("cached_song_duration")
            .where("vlink", "=", songToDelete)
            .execute();

        if (await pathExists(songAudioPath)) {
            logger.info(`Deleting old better audio file: ${songAudioPath}`);

            await fs.promises.rename(songAudioPath, `${songAudioPath}.old`);
        }
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
        await checkModifiedBetterAudioLinks(db);
    } else {
        logger.info("Skipping reseed");
    }
}

/**
 * Regenerates the available group list
 * @param db - Database context
 */
async function updateGroupList(db: DatabaseContext): Promise<void> {
    const result = await db.kpopVideos
        .selectFrom("app_kpop_group_safe")
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
/**
 * Perform a full seed of the Daisuki database and download any new songs.
 *
 * @param db - database context to perform operations against
 * @param limit - optional cap on number of songs to download (undefined for
 *   no limit)
 * @param songs - optional explicit list of YouTube IDs to fetch; when provided
 *   the limit is ignored
 * @param checkSongDurations - if true, downloaded tracks will be validated
 *   against any cached duration entries
 * @param skipDownload - if true, the seed steps will run but the download
 *   stage will be skipped (used for testing)
 */
export async function seedAndDownloadNewSongs(
    db: DatabaseContext,
    limit?: number,
    songs?: string[],
    checkSongDurations?: boolean,
    skipDownload?: boolean,
): Promise<void> {
    logger.info("Performing regularly scheduled Daisuki database seed");
    try {
        await pruneSqlDumps();
        try {
            await updateKpopDatabase(db);
        } catch (e) {
            logger.error(`Failed to update kpop_videos database. ${e}`);
            throw e;
        }

        const timer = setTimeout(
            async () => {
                logger.error(
                    "Timed out during download and seed after 30 minutes",
                );

                await sendInfoWebhook(
                    process.env.ALERT_WEBHOOK_URL!,
                    "Download and seed failure",
                    "Timed out while downloading new songs after 30 minutes",
                    EMBED_ERROR_COLOR,
                    KmqImages.NOT_IMPRESSED,
                    "Kimiqo",
                );
            },
            30 * 60 * 1000,
        );

        const songDownloader = new KmqSongDownloader();
        const result = await songDownloader.downloadNewSongs(
            limit,
            songs,
            checkSongDurations,
            skipDownload,
        );

        const songsDownloaded = result.songsDownloaded;
        const songsDownloadFailures = result.songsFailed;

        if (songsDownloadFailures > 0) {
            await sendInfoWebhook(
                process.env.ALERT_WEBHOOK_URL!,
                "Download and seed failure",
                `${songsDownloadFailures}/${songsDownloadFailures + songsDownloaded} song downloads failed.`,
                EMBED_ERROR_COLOR,
                KmqImages.NOT_IMPRESSED,
                "Kimiqo",
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

        clearTimeout(timer);

        logger.info(
            `Finishing seeding and downloading ${songsDownloaded} new songs`,
        );
    } catch (e) {
        logger.error(`Download/seed failure: ${e}`);
        await sendInfoWebhook(
            process.env.ALERT_WEBHOOK_URL!,
            "Download and seed failure",
            e.toString(),
            EMBED_ERROR_COLOR,
            KmqImages.NOT_IMPRESSED,
            "Kimiqo",
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
        const availableSongsBefore = await db.kmq
            .selectFrom("available_songs")
            .select([
                "song_name_en",
                "artist_name_en",
                "link",
                "publishedon",
                "daisuki_id",
            ])
            .orderBy("publishedon", "desc")
            .execute();

        try {
            await loadStoredProcedures();
            await seedAndDownloadNewSongs(
                db,
                options.limit,
                options.songs,
                options.checkSongDurations,
                options.skipDownload,
            );
            try {
                await reloadAutocompleteData();
            } catch (e) {
                logger.warn(`reloadAutocompleteData failed with: ${e}`);
            }

            if (process.env.NODE_ENV !== EnvType.PROD) {
                await updateDaisukiSchemaTypings(db);
            }

            interface AvailableSongDeltaData {
                song_name_en: string;
                artist_name_en: string;
                link: string;
                publishedon: Date;
                daisuki_id: number;
            }

            const availableSongsAfter: AvailableSongDeltaData[] = await db.kmq
                .selectFrom("available_songs")
                .select([
                    "song_name_en",
                    "artist_name_en",
                    "link",
                    "publishedon",
                    "daisuki_id",
                ])
                .orderBy("publishedon", "desc")
                .execute();

            const availableSongsAfterSet = new Set(
                availableSongsAfter.map((x) => x.daisuki_id),
            );

            const availableSongsBeforeSet = new Set(
                availableSongsBefore.map((x) => x.daisuki_id),
            );

            logger.info("Calculating songs removed...");
            let songsRemoved = availableSongsBefore.filter(
                (before) => !availableSongsAfterSet.has(before.daisuki_id),
            );

            logger.info("Calculating songs added...");
            let songsAdded = availableSongsAfter.filter(
                (after) => !availableSongsBeforeSet.has(after.daisuki_id),
            );

            logger.info("Calculating songs both added and removed");
            const songsAddedLinks = songsAdded.map((x) => x.link);
            const songNameHash = function (a: AvailableSongDeltaData): string {
                return `${a.song_name_en}|${a.artist_name_en}`.toLowerCase();
            };

            const songAddedNameHashes = songsAdded.map((x) => songNameHash(x));

            const addedAndRemovedLinks = new Set(
                songsRemoved
                    .filter(
                        (removed) =>
                            songsAddedLinks.includes(removed.link) ||
                            songAddedNameHashes.includes(songNameHash(removed)),
                    )
                    .map((x) => x.link),
            );

            logger.info(
                `Added and removed count: ${addedAndRemovedLinks.size}`,
            );

            // remove songs that were both added and deleted
            // i.e: we were using an AV initially, but AV gets added as a better audio for a new MV
            songsRemoved = songsRemoved.filter(
                (x) => !addedAndRemovedLinks.has(x.link),
            );

            songsAdded = songsAdded.filter(
                (x) => !addedAndRemovedLinks.has(x.link),
            );

            logger.info(
                `Songs changed: ${songsAdded.length + songsRemoved.length}...`,
            );

            const currentDate = new Date();
            if (songsRemoved.length) {
                logger.info(`${songsRemoved.length} songs removed.`);
                const description = `**${songsRemoved.length} songs removed**:\n${songsRemoved
                    .map(
                        (x) =>
                            `- '${x.song_name_en}' - ${x.artist_name_en} (${standardDateFormat(x.publishedon)}) | ${x.link}`,
                    )
                    .join("\n")}`;

                await sendInfoWebhook(
                    process.env.SONG_UPDATES_WEBHOOK_URL!,
                    discordDateFormat(currentDate, "f"),
                    truncatedString(
                        description,
                        EMBED_DESCRIPTION_MAX_LENGTH - 1,
                    ),
                    EMBED_ERROR_COLOR,
                    KmqImages.NOT_IMPRESSED,
                    undefined,
                );

                if (description.length >= EMBED_DESCRIPTION_MAX_LENGTH) {
                    // if description was too long, send full file
                    await sendDebugAlertFileWebhook(
                        `${discordDateFormat(currentDate, "f")}\nFull List:`,
                        process.env.SONG_UPDATES_WEBHOOK_URL!,
                        description,
                        "removed_songs.txt",
                    );
                }
            }

            if (songsAdded.length) {
                logger.info(`${songsAdded.length} songs added.`);
                const description = `**${songsAdded.length} songs added**:\n${songsAdded
                    .map(
                        (x) =>
                            `- '${x.song_name_en}' - ${x.artist_name_en} (${standardDateFormat(x.publishedon)}) | ${x.link}`,
                    )
                    .join("\n")}`;

                await sendInfoWebhook(
                    process.env.SONG_UPDATES_WEBHOOK_URL!,
                    discordDateFormat(currentDate, "f"),
                    truncatedString(
                        description,
                        EMBED_DESCRIPTION_MAX_LENGTH - 1,
                    ),
                    EMBED_SUCCESS_COLOR,
                    KmqImages.HAPPY,
                    undefined,
                );

                if (description.length >= EMBED_DESCRIPTION_MAX_LENGTH) {
                    // if description was too long, send full file
                    await sendDebugAlertFileWebhook(
                        `${discordDateFormat(currentDate, "f")}\nFull List:`,
                        process.env.SONG_UPDATES_WEBHOOK_URL!,
                        description,
                        "added_songs.txt",
                    );
                }
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
