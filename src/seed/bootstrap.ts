import path from "path";
import { config } from "dotenv";
import { execSync } from "child_process";
import { updateKpopDatabase } from "./seed_db";
import _logger from "../logger";
import { downloadAndConvertSongs } from "../scripts/download-new-songs";
import { DatabaseContext, getDatabaseAgnosticContext } from "../database_context";

const logger = _logger("bootstrap");

const SONG_DOWNLOAD_THRESHOLD = 5;

config({ path: path.resolve(__dirname, "../../.env") });

async function kmqDatabaseExists(db: DatabaseContext): Promise<boolean> {
    const kmqExists = (await db.agnostic("information_schema.schemata").where("schema_name", "=", "kmq")).length === 1;
    const kmqTestExists = (await db.agnostic("information_schema.schemata").where("schema_name", "=", "kmq_test")).length === 1;
    return kmqExists && kmqTestExists;
}

async function kpopDataDatabaseExists(db: DatabaseContext): Promise<boolean> {
    return (await db.agnostic("information_schema.schemata").where("schema_name", "=", "kpop_videos")).length === 1;
}

async function songThresholdReached(db: DatabaseContext): Promise<boolean> {
    const availableSongsTableExists = (await db.agnostic("information_schema.tables")
        .where("table_schema", "=", "kmq")
        .where("table_name", "=", "available_songs")
        .count("* as count")
        .first()).count === 1;

    if (!availableSongsTableExists) return false;

    return (await db.kmq("available_songs")
        .count("* as count")
        .first()).count >= SONG_DOWNLOAD_THRESHOLD;
}

async function needsBootstrap(db: DatabaseContext) {
    return (await Promise.all([kmqDatabaseExists(db), kpopDataDatabaseExists(db), songThresholdReached(db)])).some((x) => x === false);
}

// eslint-disable-next-line import/prefer-default-export
export function generateKmqDataTables() {
    const createKmqTablesProcedureSqlPath = path.join(__dirname, "../../sql/create_kmq_data_tables_procedure.sql");
    execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} kmq < ${createKmqTablesProcedureSqlPath}`);
    logger.info("Re-creating KMQ data tables view...");
    execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} kmq -e "CALL CreateKmqDataTables;"`);
}

function performMigrations() {
    logger.info("Performing migrations...");
    execSync("npx knex migrate:latest --knexfile src/config/knexfile_kmq.js");
}

async function bootstrapDatabases() {
    const startTime = Date.now();
    const db = getDatabaseAgnosticContext();

    if (await needsBootstrap(db)) {
        logger.info("Bootstrapping databases...");

        if (!(await kpopDataDatabaseExists(db))) {
            logger.info("Seeding K-pop data database");
            await updateKpopDatabase();
        }

        if (!(await kmqDatabaseExists(db))) {
            logger.info("Performing migrations on KMQ database");
            await db.agnostic.raw("CREATE DATABASE IF NOT EXISTS kmq");
            await db.agnostic.raw("CREATE DATABASE IF NOT EXISTS kmq_test");
            performMigrations();
        }
        if (!(await songThresholdReached(db))) {
            logger.info(`Downloading minimum threshold (${SONG_DOWNLOAD_THRESHOLD}) songs`);
            await downloadAndConvertSongs(SONG_DOWNLOAD_THRESHOLD);
        }
    } else {
        performMigrations();
        generateKmqDataTables();
    }
    logger.info(`Bootstrapped in ${(Date.now() - startTime) / 1000}s`);
    await db.destroy();
}

(async () => {
    if (require.main === module) {
        await bootstrapDatabases();
    }
})();
