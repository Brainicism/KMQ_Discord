import * as cp from "child_process";
import { FileMigrationProvider, Migrator, NO_MIGRATIONS, sql } from "kysely";
import { IPCLogger } from "../logger";
import {
    PROMOTED_COOKIE,
    STANDBY_COOKIE,
    STATUS_COOKIE,
    TEST_DB_CACHED_EXPORT,
} from "../constants";
import { config } from "dotenv";
import {
    databaseExists,
    generateKmqDataTables,
    loadStoredProcedures,
    tableExists,
    updateKpopDatabase,
} from "./seed_db";
import { getNewConnection } from "../database_context";
import { pathExists } from "../helpers/utils";
import EnvType from "../enums/env_type";
import KmqConfiguration from "../kmq_configuration";
import downloadAndConvertSongs from "../scripts/download-new-songs";
import fs, { promises as fsp } from "fs";
import path from "path";
import type { DatabaseContext } from "../database_context";

const logger = new IPCLogger("bootstrap");

const SONG_DOWNLOAD_THRESHOLD = 3;

config({ path: path.resolve(__dirname, "../../.env") });

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
        "PREMIUM_AUDIO_SONGS_PER_ARTIST",
        "AUDIO_SONGS_PER_ARTIST",
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
            migrationFolder: path.join(__dirname, "../migrations"),
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
            migrationFolder: path.join(__dirname, "../migrations"),
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

    if (!(await songThresholdReached(db))) {
        logger.info(
            `Downloading minimum threshold (${SONG_DOWNLOAD_THRESHOLD}) songs`,
        );
        await downloadAndConvertSongs(SONG_DOWNLOAD_THRESHOLD);
        await generateKmqDataTables(db);
    }

    if (process.env.NODE_ENV === EnvType.PROD) {
        await generateKmqDataTables(db);
    }

    logger.info("Cleaning up stale data");
    await db.kmq
        .deleteFrom("system_stats")
        .where("date", "<", sql`DATE(NOW() - INTERVAL 3 MONTH)`)
        .execute();

    logger.info(`Bootstrapped in ${(Date.now() - startTime) / 1000}s`);
    await db.destroy();
}

(async () => {
    if (require.main === module) {
        if (process.env.NODE_ENV === EnvType.CI) return;
        await KmqConfiguration.reload();
        if (!hasRequiredEnvironmentVariables()) {
            logger.error("Missing required environment variables, aborting...");
            process.exit(1);
        }

        if (process.env.IS_STANDBY === "true") {
            const alreadyPromoted = await pathExists(PROMOTED_COOKIE);
            if (!alreadyPromoted) {
                logger.info("Preparing standby instance");
                await fs.promises.writeFile(STANDBY_COOKIE, "starting");
            }
        }

        await fs.promises.writeFile(STATUS_COOKIE, "starting");

        const dataDir = path.join(__dirname, "../../data");

        try {
            await fs.promises.mkdir(dataDir);
            logger.info("Data directory doesn't exist, creating...");
        } catch (error) {
            logger.info("Data directory already exists");
        }

        await bootstrapDatabases();
    }
})();
