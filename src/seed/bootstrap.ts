import * as cp from "child_process";
import { FileMigrationProvider, Migrator, NO_MIGRATIONS, sql } from "kysely";
import { IPCLogger } from "../logger.js";
import {
    PROMOTED_COOKIE,
    STANDBY_COOKIE,
    STATUS_COOKIE,
    TEST_DB_CACHED_EXPORT,
    YT_DLP_LOCATION,
} from "../constants.js";
import { config } from "dotenv";
import {
    databaseExists,
    generateExpectedAvailableSongs,
    generateKmqDataTables,
    loadStoredProcedures,
    tableExists,
    updateKpopDatabase,
} from "./seed_db.js";
import { getNewConnection } from "../database_context.js";
import { pathExists } from "../helpers/utils.js";
import EnvType from "../enums/env_type.js";
import EnvVariableManager from "../env_variable_manager.js";
import KmqConfiguration from "../kmq_configuration.js";
import KmqSongDownloader from "../helpers/kmq_song_downloader.js";
import fs, { promises as fsp } from "fs";
import path from "path";
import util from "util";
import type { DatabaseContext } from "../database_context.js";

const exec = util.promisify(cp.exec);

const logger = new IPCLogger("bootstrap");

const SONG_DOWNLOAD_THRESHOLD = 6;

config({ path: path.resolve(import.meta.dirname, "../../.env") });

function hasRequiredEnvironmentVariables(): boolean {
    const requiredEnvVariables = [
        "BOT_TOKEN",
        "BOT_CLIENT_ID",
        "DB_USER",
        "DB_PASS",
        "DB_HOST",
        "DB_PORT",
        "SONG_DOWNLOAD_DIR",
        "BOT_PREFIX",
        "NODE_ENV",
        "APP_NAME",
        "DAISUKI_DB_PASSWORD",
    ];

    for (const requiredEnvVariable of requiredEnvVariables) {
        if (!process.env[requiredEnvVariable]) {
            logger.error(
                `Missing required environment variable '${requiredEnvVariable}'`,
            );
            return false;
        }
    }

    return true;
}

async function kmqDatabaseExists(db: DatabaseContext): Promise<boolean> {
    return databaseExists(db, "kmq");
}

async function kpopDataDatabaseExists(db: DatabaseContext): Promise<boolean> {
    const kpopVideosExists = await databaseExists(db, "kpop_videos");
    return kpopVideosExists;
}

async function songThresholdReached(db: DatabaseContext): Promise<boolean> {
    const availableSongsTableExists = await tableExists(
        db,
        "kmq",
        "available_songs",
    );

    if (!availableSongsTableExists) return false;

    return (
        (
            await db.kmq
                .selectFrom("available_songs")
                .select((eb) => eb.fn.countAll<number>().as("count"))
                .executeTakeFirstOrThrow()
        ).count >= SONG_DOWNLOAD_THRESHOLD
    );
}

/**
 * Import cached dump
 * @param databaseName - the database name
 */
export function importCachedDump(databaseName: string): void {
    // eslint-disable-next-line node/no-sync
    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} ${databaseName} < ${TEST_DB_CACHED_EXPORT}`,
    );
}

/**
 * Perform migrations
 * @param db - The database context
 */
export async function performMigrations(db: DatabaseContext): Promise<void> {
    logger.info("Performing migrations (up)...");
    const migrator = new Migrator({
        db: db.kmq,
        provider: new FileMigrationProvider({
            fs: fsp,
            path,
            // This needs to be an absolute path.
            migrationFolder: path.join(import.meta.dirname, "../migrations"),
        }),
    });

    const pendingMigrations = (await migrator.getMigrations()).filter(
        (x) => !x.executedAt,
    );

    if (pendingMigrations.length > 0) {
        logger.info(
            `Pending migrations: [${pendingMigrations.map((x) => x.name)}]`,
        );
        if (KmqConfiguration.Instance.disallowMigrations()) {
            logger.error("Migrations are disallowed.");
            process.exit(1);
        }

        const { error, results } = await migrator.migrateToLatest();
        for (const result of results || []) {
            if (result.status === "Success") {
                logger.info(
                    `Migration (up) "${result.migrationName}" was executed successfully`,
                );
            } else if (result.status === "Error") {
                logger.error(
                    `Failed to execute migration: "${result.migrationName}"`,
                );
            }
        }

        if (error) {
            logger.error(`Failed to migrate, err: ${error}`);
            process.exit(1);
        }
    }
}

/**
 * Perform migrations
 * @param db - The database context
 */
export async function performMigrationDown(db: DatabaseContext): Promise<void> {
    logger.info("Performing migrations (down)...");
    const migrator = new Migrator({
        db: db.kmq,
        provider: new FileMigrationProvider({
            fs: fsp,
            path,
            // This needs to be an absolute path.
            migrationFolder: path.join(import.meta.dirname, "../migrations"),
        }),
    });

    const { error, results } = await migrator.migrateTo(NO_MIGRATIONS);
    for (const result of results || []) {
        if (result.status === "Success") {
            logger.info(
                `Migration (down) "${result.migrationName}" was executed successfully`,
            );
        } else if (result.status === "Error") {
            logger.error(
                `Failed to execute migration: "${result.migrationName}"`,
            );
        }
    }

    if (error) {
        throw new Error(`Failed to migrate, err: ${error}`);
    }
}

async function bootstrapDatabases(): Promise<void> {
    const startTime = Date.now();
    const db = getNewConnection();

    if (!(await kmqDatabaseExists(db))) {
        logger.info("Performing migrations on KMQ database");
        await sql`CREATE DATABASE IF NOT EXISTS kmq;`.execute(db.agnostic);
        importCachedDump("kmq");
    }

    await performMigrations(db);
    await loadStoredProcedures();

    if (!(await kpopDataDatabaseExists(db))) {
        logger.info("Seeding K-pop data database");
        await updateKpopDatabase(db, true);
    }

    await generateExpectedAvailableSongs(db);

    if (!(await songThresholdReached(db))) {
        logger.info(
            `Downloading minimum threshold (${SONG_DOWNLOAD_THRESHOLD}) songs`,
        );

        await new KmqSongDownloader().downloadNewSongs(SONG_DOWNLOAD_THRESHOLD);
        await generateKmqDataTables(db);
    }

    if (process.env.NODE_ENV === EnvType.PROD) {
        if (!KmqConfiguration.Instance.disallowMigrations()) {
            await generateKmqDataTables(db);
        } else {
            logger.info(
                "Skipping generateKmqDataTables due to disabled migrations",
            );
        }
    }

    logger.info("Cleaning up stale data");
    await db.kmq
        .deleteFrom("system_stats")
        .where("date", "<", sql<Date>`DATE(NOW() - INTERVAL 3 MONTH)`)
        .execute();

    logger.info(`Bootstrapped in ${(Date.now() - startTime) / 1000}s`);
    await db.destroy();
}

async function ensureYtDlpBinary(): Promise<void> {
    try {
        await fs.promises.access(YT_DLP_LOCATION, fs.constants.F_OK);
    } catch (_err) {
        logger.warn("yt-dlp binary doesn't exist, downloading...");
        try {
            await exec(
                `curl -L https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp -o ${YT_DLP_LOCATION}`,
            );
            await exec(`chmod u+x ${YT_DLP_LOCATION}`);
        } catch (err) {
            throw new Error(
                `Failed to fetch latest yt-dlp library. err = ${err}`,
            );
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    if (import.meta.main) {
        if (process.env.NODE_ENV === EnvType.CI) return;
        KmqConfiguration.reload();
        if (!hasRequiredEnvironmentVariables()) {
            logger.error("Missing required environment variables, aborting...");
            process.exit(1);
        }

        if (EnvVariableManager.isStandby()) {
            const alreadyPromoted = await pathExists(PROMOTED_COOKIE);
            if (!alreadyPromoted) {
                logger.info("Preparing standby instance");
                await fs.promises.writeFile(STANDBY_COOKIE, "starting");
            }
        }

        await fs.promises.writeFile(STATUS_COOKIE, "starting");

        const dataDir = path.join(import.meta.dirname, "../../data");

        try {
            await fs.promises.mkdir(dataDir);
            logger.info("Data directory doesn't exist, creating...");
        } catch (error) {
            logger.info("Data directory already exists");
        }

        await ensureYtDlpBinary();
        await bootstrapDatabases();
    }
})();
