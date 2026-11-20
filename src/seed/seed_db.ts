/* eslint-disable no-await-in-loop */
import * as cp from "child_process";
import { Command } from "@commander-js/extra-typings";
import {
    DATABASE_DOWNLOAD_DIR,
    DataFiles,
    EMBED_DESCRIPTION_MAX_LENGTH,
    EMBED_ERROR_COLOR,
    EMBED_SUCCESS_COLOR,
    KmqImages,
} from "../constants";
import { IPCLogger } from "../logger";
import { config } from "dotenv";
import {
    discordDateFormat,
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
import {
    cleanup,
    importStagingToLive,
    pull,
    publish,
    transform,
    validate,
} from "./seed_pipeline";
import EnvType from "../enums/env_type";
import KmqSongDownloader from "../helpers/kmq_song_downloader";
import Axios from "axios";
import fs from "fs";
import path from "path";
import util from "util";
import type { DatabaseContext } from "../database_context";

const exec = util.promisify(cp.exec);

config({ path: path.resolve(__dirname, "../../.env") });

const logger = new IPCLogger("seed_db");

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

// Use defaults when imported as a module; only parse CLI args when running directly
let options = program.opts();

/**
 * Re-creates the KMQ data tables (available_songs + app_kpop_group_safe).
 * Delegates to the BuildAvailableSongs stored procedure.
 * @param db - The database context
 */
export async function generateKmqDataTables(
    db: DatabaseContext,
): Promise<void> {
    logger.info("Re-creating KMQ data tables...");
    await publish(db);
}

/**
 * Builds expected_available_songs from source data.
 * Delegates to the BuildExpectedAvailableSongs stored procedure.
 * @param db - The database context
 */
export async function generateExpectedAvailableSongs(
    db: DatabaseContext,
): Promise<void> {
    logger.info("Building expected available songs...");
    await sql.raw("CALL BuildExpectedAvailableSongs();").execute(db.kmq);
}

/**
 * Reloads all existing stored procedures from sql/procedures/.
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

/**
 * Update typings for Kysely
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

async function recordDaisukiTableSchema(db: DatabaseContext): Promise<void> {
    const frozenTableColumnNames: { [table: string]: string[] } = {};
    const daisukiTables = (
        await db.infoSchema
            .selectFrom("TABLES")
            .select("TABLE_NAME")
            .where("TABLE_SCHEMA", "=", "kpop_videos")
            .execute()
    ).map((x) => x.TABLE_NAME);

    await Promise.allSettled(
        daisukiTables.map(async (table) => {
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

            const columnNames = commaSeparatedColumnNames.split(",").sort();

            frozenTableColumnNames[table] = columnNames;
        }),
    );

    await fs.promises.writeFile(
        DataFiles.FROZEN_TABLE_SCHEMA,
        JSON.stringify(frozenTableColumnNames),
    );
}

/**
 * Pipeline: Update kpop_videos database from Daisuki.
 *
 * Phases:
 *   1. Pull (download + extract)
 *   2. Validate (import to staging, check counts/overrides/procedures)
 *   3. Import (atomic swap staging → kpop_videos)
 *   4. Transform (build expected_available_songs)
 *
 * @param db - The database context
 * @param bootstrap - Whether or not this is a bootstrap run
 */
export async function updateKpopDatabase(
    db: DatabaseContext,
    bootstrap = false,
): Promise<void> {
    if (!options.skipPull && !bootstrap) {
        // Phase 1: Pull
        await pull();
    } else {
        logger.info("Skipping Daisuki SQL dump pull...");
    }

    if (!options.skipReseed) {
        // Phase 2: Validate
        if (!options.skipValidate) {
            await validate(db, bootstrap);
            // Phase 3: Import (reuses staging DB from validate)
            await importStagingToLive(db);
        } else {
            // Skip validate but still need to import
            // Fall back to legacy import path: import dump into tmp, swap to live
            await legacySeedDb(db, bootstrap);
        }

        // Phase 4: Transform
        await transform(db);
    } else {
        logger.info("Skipping reseed");
    }
}

/**
 * Legacy import path — used when --skip-validate is set but --skip-reseed is not.
 * Imports the dump directly into kpop_videos_tmp then swaps.
 */
async function legacySeedDb(
    db: DatabaseContext,
    bootstrap: boolean,
): Promise<void> {
    try {
        await fs.promises.mkdir(DATABASE_DOWNLOAD_DIR);
        logger.info("Creating database download directory");
    } catch (e) {
        logger.info("Database download directory already exists");
    }

    const sqlFiles = (
        await fs.promises.readdir(`${DATABASE_DOWNLOAD_DIR}`)
    ).filter((x) => x.endsWith(".sql"));

    const dbSeedFile = sqlFiles
        .filter((x) => x.endsWith(".sql") && x.startsWith("mainbackup_"))
        .slice(-1)[0];

    const dbSeedFilePath = bootstrap
        ? `${DATABASE_DOWNLOAD_DIR}/bootstrap.sql`
        : `${DATABASE_DOWNLOAD_DIR}/${dbSeedFile}`;

    logger.info("Dropping K-Pop video temporary database");
    await sql`DROP DATABASE IF EXISTS kpop_videos_tmp;`.execute(db.agnostic);
    logger.info("Creating K-Pop video temporary database");
    await sql`CREATE DATABASE kpop_videos_tmp;`.execute(db.agnostic);
    logger.info("Seeding K-Pop video temporary database");
    await exec(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_tmp < ${dbSeedFilePath}`,
    );

    logger.info("Updating K-pop database from temporary database");
    const tmpTables = (
        await db.infoSchema
            .selectFrom("TABLES")
            .where("TABLE_SCHEMA", "=", "kpop_videos_tmp")
            .select("TABLE_NAME")
            .execute()
    ).map((x) => x["TABLE_NAME"]);

    for (const tableName of tmpTables) {
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

    // Override queries
    logger.info("Performing data overrides");
    const overrideQueries = (
        await db.kmq
            .selectFrom("kpop_videos_sql_overrides")
            .select(["query"])
            .execute()
    ).map((x) => x.query);

    await Promise.all(
        overrideQueries.map(async (overrideQuery) =>
            sql.raw(overrideQuery).execute(db.kpopVideos),
        ),
    );

    logger.info("Imported database dump successfully via legacy path");
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
 * Perform a full seed of the Daisuki database and download any new songs.
 *
 * Pipeline phases:
 *   1. Pull (download + extract Daisuki dump)
 *   2. Validate (import to staging, run checks)
 *   3. Import (atomic swap staging → kpop_videos)
 *   4. Transform (build expected_available_songs, detect better_audio changes)
 *   5. Download (fetch + encode audio files)
 *   6. Publish (build available_songs + app_kpop_group_safe)
 *   7. Cleanup (prune old dumps, drop temp databases)
 *
 * @param db - database context to perform operations against
 * @param limit - optional cap on number of songs to download
 * @param songs - optional explicit list of YouTube IDs to fetch
 * @param checkSongDurations - if true, validate cached duration entries
 * @param skipDownload - if true, skip the download stage
 * @param skipDatabaseUpdate - if true, skip Daisuki DB update/reseed
 */
export async function seedAndDownloadNewSongs(
    db: DatabaseContext,
    limit?: number,
    songs?: string[],
    checkSongDurations?: boolean,
    skipDownload?: boolean,
    skipDatabaseUpdate = false,
): Promise<{ songsDownloaded: number; songsFailed: number }> {
    logger.info("Performing regularly scheduled Daisuki database seed");
    let songsDownloaded = 0;
    let songsFailed = 0;
    try {
        if (!skipDatabaseUpdate) {
            // Phase 7 (cleanup) first — prune old dumps before pulling new ones
            await cleanup(db);
            try {
                // Phases 1-4: Pull, Validate, Import, Transform
                await updateKpopDatabase(db);
            } catch (e) {
                logger.error(`Failed to update kpop_videos database. ${e}`);
                throw e;
            }
        } else {
            logger.info(
                "Skipping kpop_videos database update and reseed; running download stage only",
            );
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

        // Phase 5: Download
        const songDownloader = new KmqSongDownloader();
        const result = await songDownloader.downloadNewSongs(
            limit,
            songs,
            checkSongDurations,
            skipDownload,
        );

        songsDownloaded = result.songsDownloaded;
        const songsDownloadFailures = result.songsFailed;
        songsFailed = songsDownloadFailures;

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

        // Phase 6: Publish
        await generateKmqDataTables(db);
        if (process.env.NODE_ENV === EnvType.PROD) {
            await updateGroupList(db);
        }

        // Freeze table schema
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
            (e as Error).toString(),
            EMBED_ERROR_COLOR,
            KmqImages.NOT_IMPRESSED,
            "Kimiqo",
        );
    }

    return { songsDownloaded, songsFailed };
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
        program.parse();
        options = program.opts();
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
