import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { execSync } from "child_process";
import { updateKpopDatabase } from "./seed_db";
import { IPCLogger } from "../logger";
import { downloadAndConvertSongs } from "../scripts/download-new-songs";
import { DatabaseContext, getNewConnection } from "../database_context";
import { EnvType } from "../types";

const logger = new IPCLogger("bootstrap");

const SONG_DOWNLOAD_THRESHOLD = 5;

config({ path: path.resolve(__dirname, "../../.env") });

async function tableExists(db: DatabaseContext, tableName: string) {
    return (await db.agnostic("information_schema.schemata").where("schema_name", "=", tableName)).length === 1;
}
async function kmqDatabaseExists(db: DatabaseContext): Promise<boolean> {
    const kmqExists = await tableExists(db, "kmq");
    const kmqTestExists = await tableExists(db, "kmq_test");
    return kmqExists && kmqTestExists;
}

async function kpopDataDatabaseExists(db: DatabaseContext): Promise<boolean> {
    const kpopVideosExists = await tableExists(db, "kpop_videos");
    return kpopVideosExists;
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

function loadStoredProcedures() {
    const storedProcedureDefinitions = fs.readdirSync(path.join(__dirname, "../../sql/procedures"))
        .map((x) => path.join(__dirname, "../../sql/procedures", x));
    for (const storedProcedureDefinition of storedProcedureDefinitions) {
        execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq < ${storedProcedureDefinition}`);
    }
}

// eslint-disable-next-line import/prefer-default-export
export async function generateKmqDataTables(db: DatabaseContext) {
    logger.info("Re-creating KMQ data tables view...");
    await db.kmq.raw("CALL CreateKmqDataTables;");
}

function performMigrations() {
    logger.info("Performing migrations...");
    const migrationsPath = path.join(__dirname, "../config/knexfile_kmq.js");
    try {
        execSync(`npx knex migrate:latest --knexfile ${migrationsPath}`);
    } catch (e) {
        logger.error(`Migration failed: ${e}`);
        process.exit(1);
    }
}

async function bootstrapDatabases() {
    const startTime = Date.now();
    const db = getNewConnection();

    if (!(await kpopDataDatabaseExists(db))) {
        logger.info("Seeding K-pop data database");
        await updateKpopDatabase(db, true);
    }

    if (!(await kmqDatabaseExists(db))) {
        logger.info("Performing migrations on KMQ database");
        await db.agnostic.raw("CREATE DATABASE IF NOT EXISTS kmq");
        await db.agnostic.raw("CREATE DATABASE IF NOT EXISTS kmq_test");
    }

    performMigrations();
    loadStoredProcedures();

    if (!(await songThresholdReached(db))) {
        logger.info(`Downloading minimum threshold (${SONG_DOWNLOAD_THRESHOLD}) songs`);
        await downloadAndConvertSongs(1, SONG_DOWNLOAD_THRESHOLD);
        await generateKmqDataTables(db);
    }

    logger.info(`Bootstrapped in ${(Date.now() - startTime) / 1000}s`);
    await db.destroy();
}

(async () => {
    if (require.main === module) {
        if (process.env.NODE_ENV === EnvType.CI) return;
        await bootstrapDatabases();
    }
})();
