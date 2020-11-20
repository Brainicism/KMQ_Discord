import mysql from "promise-mysql";
import path from "path";
import { config } from "dotenv";
import { execSync } from "child_process";
import { seedKpopDataDatabase } from "./seed_db";
import _logger from "../logger";
import { downloadAndConvertSongs } from "../scripts/download-new-songs";

const logger = _logger("bootstrap");

const SONG_DOWNLOAD_THRESHOLD = 5;

config({ path: path.resolve(__dirname, "../../.env") });

async function kmqDatabaseExists(db: mysql.Connection): Promise<boolean> {
    return (await db.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'kmq';")).length === 1;
}

async function kpopDataDatabaseExists(db: mysql.Connection): Promise<boolean> {
    return (await db.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'kpop_videos';")).length === 1;
}

async function songThresholdReached(db: mysql.Connection): Promise<boolean> {
    const availableSongsTableExists = (await db.query(`SELECT EXISTS(
        SELECT * FROM information_schema.tables 
        WHERE table_schema = 'kmq' 
        AND table_name = 'available_songs'
    ) as count;`))[0].count === 1;
    if (!availableSongsTableExists) return false;

    return (await db.query("SELECT count(*) as count FROM kmq.available_songs"))[0].count >= SONG_DOWNLOAD_THRESHOLD;
}

async function needsBootstrap(db: mysql.Connection) {
    return (await Promise.all([kmqDatabaseExists(db), kpopDataDatabaseExists(db), songThresholdReached(db)])).some((x) => x === false);
}

function generateAvailableSongsView() {
    logger.info("Re-creating available songs view...");
    execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} kmq -e "CALL CreateAvailableSongsTable;"`);
}

function performMigrations() {
    logger.info("Performing migrations...");
    execSync("npx knex migrate:latest --knexfile src/config/knexfile_kmq.js");
}

async function bootstrapDatabases() {
    let db: mysql.Connection;
    try {
        db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
        });
    } catch (e) {
        logger.error(`Failed to connect to database: ${e}`);
        process.exit(1);
    }
    if (await needsBootstrap(db)) {
        logger.info("Bootstrapping databases...");

        if (!(await kpopDataDatabaseExists(db))) {
            logger.info("Seeding K-pop data database");
            await seedKpopDataDatabase();
        }

        if (!(await kmqDatabaseExists(db))) {
            logger.info("Performing migrations on KMQ database");
            await db.query("CREATE DATABASE IF NOT EXISTS kmq");
            logger.info("Creating CreateAvailableSongsTable procedure");
            execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} kmq < ./src/seed/create_available_songs_table_procedure.sql`);
            performMigrations();
        }

        if (!(await songThresholdReached(db))) {
            logger.info(`Downloading minimum threshold (${SONG_DOWNLOAD_THRESHOLD}) songs`);
            await downloadAndConvertSongs(SONG_DOWNLOAD_THRESHOLD);
        }
    } else {
        performMigrations();
    }

    await db.end();
}

(async () => {
    if (require.main === module) {
        bootstrapDatabases();
    }
})();

export { bootstrapDatabases, generateAvailableSongsView };
