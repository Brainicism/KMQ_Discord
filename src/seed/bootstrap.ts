import { IPCLogger } from "../logger";
import { config } from "dotenv";
import {
    databaseExists,
    generateKmqDataTables,
    loadStoredProcedures,
    tableExists,
    updateKpopDatabase,
} from "./seed_db";
import { execSync } from "child_process";
import { getNewConnection } from "../database_context";
import EnvType from "../enums/env_type";
import downloadAndConvertSongs from "../scripts/download-new-songs";
import fs from "fs";
import path from "path";
import type { DatabaseContext } from "../database_context";

const logger = new IPCLogger("bootstrap");

const SONG_DOWNLOAD_THRESHOLD = 5;

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
    ];

    for (const requiredEnvVariable of requiredEnvVariables) {
        if (!process.env[requiredEnvVariable]) {
            logger.error(
                `Missing required environment variable '${requiredEnvVariable}'`
            );
            return false;
        }
    }

    return true;
}

async function kmqDatabaseExists(db: DatabaseContext): Promise<boolean> {
    const kmqExists = await databaseExists(db, "kmq");
    const kmqTestExists = await databaseExists(db, "kmq_test");
    return kmqExists && kmqTestExists;
}

async function kpopDataDatabaseExists(db: DatabaseContext): Promise<boolean> {
    const kpopVideosExists = await databaseExists(db, "kpop_videos");
    return kpopVideosExists;
}

async function songThresholdReached(db: DatabaseContext): Promise<boolean> {
    const availableSongsTableExists = await tableExists(
        db,
        "kmq",
        "available_songs"
    );

    if (!availableSongsTableExists) return false;

    return (
        (await db.kmq("available_songs").count("* as count").first()).count >=
        SONG_DOWNLOAD_THRESHOLD
    );
}

function performMigrations(): void {
    logger.info("Performing migrations...");
    const migrationsPath = path.join(__dirname, "../config/knexfile_kmq.js");
    try {
        execSync(`npx knex migrate:latest --knexfile ${migrationsPath}`);
    } catch (e) {
        logger.error(`Migration failed: ${e}`);
        process.exit(1);
    }
}

async function bootstrapDatabases(): Promise<void> {
    const startTime = Date.now();
    const db = getNewConnection();

    if (!(await kmqDatabaseExists(db))) {
        logger.info("Performing migrations on KMQ database");
        await db.agnostic.raw("CREATE DATABASE IF NOT EXISTS kmq");
        await db.agnostic.raw("CREATE DATABASE IF NOT EXISTS kmq_test");
    }

    performMigrations();

    if (!(await kpopDataDatabaseExists(db))) {
        logger.info("Seeding K-pop data database");
        await updateKpopDatabase(db, true);
    }

    loadStoredProcedures();

    if (!(await songThresholdReached(db))) {
        logger.info(
            `Downloading minimum threshold (${SONG_DOWNLOAD_THRESHOLD}) songs`
        );
        await downloadAndConvertSongs(SONG_DOWNLOAD_THRESHOLD);
        await generateKmqDataTables(db);
    }

    if (process.env.NODE_ENV === EnvType.PROD) {
        await generateKmqDataTables(db);
    }

    logger.info(`Bootstrapped in ${(Date.now() - startTime) / 1000}s`);
    await db.destroy();
}

(async () => {
    if (require.main === module) {
        if (process.env.NODE_ENV === EnvType.CI) return;
        if (!hasRequiredEnvironmentVariables()) {
            logger.error("Missing required environment variables, aborting...");
            process.exit(1);
        }

        const dataDir = path.join(__dirname, "../../data");
        if (!fs.existsSync(dataDir)) {
            logger.info("Data directory doesn't exist, creating...");
            fs.mkdirSync(dataDir);
        }

        await bootstrapDatabases();
    }
})();
