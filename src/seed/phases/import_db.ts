import { IPCLogger } from "../../logger";
import { databaseExists } from "../seed_db";
import { sql } from "kysely";
import { exec as execCb } from "child_process";
import util from "util";
import type { DatabaseContext } from "../../database_context";

const exec = util.promisify(execCb);
const logger = new IPCLogger("seed_phase_import");

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

async function tableExists(
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

async function getOverrideQueries(db: DatabaseContext): Promise<Array<string>> {
    return (
        await db.kmq
            .selectFrom("kpop_videos_sql_overrides")
            .select(["query"])
            .execute()
    ).map((x) => x.query);
}

/**
 * Phase 3: Import — Atomically swap staging DB tables into kpop_videos.
 *
 * Reuses the staging DB from Phase 2 (validate) to avoid re-importing the dump.
 * Swaps tables one by one using RENAME TABLE for zero-downtime updates.
 *
 * @param db - The database context
 */
export async function importStagingToLive(db: DatabaseContext): Promise<void> {
    logger.info("Phase 3: Importing staging DB into kpop_videos...");

    if (!(await databaseExists(db, "kpop_videos"))) {
        logger.info("Database 'kpop_videos' doesn't exist, creating...");
        await sql`CREATE DATABASE kpop_videos;`.execute(db.agnostic);
    }

    // Swap each table from staging to live
    // eslint-disable-next-line no-await-in-loop
    for (const tableName of await listTables(db, "kpop_videos_staging")) {
        const kpopVideoTableExists = await tableExists(
            db,
            "kpop_videos",
            tableName,
        );

        if (kpopVideoTableExists) {
            logger.info(`Table '${tableName}' exists, swapping...`);
            await sql`DROP TABLE IF EXISTS kpop_videos.old`.execute(
                db.agnostic,
            );

            // Atomic rename: live → old, staging → live
            await sql`RENAME TABLE kpop_videos.${sql.raw(
                tableName,
            )} TO kpop_videos.old, kpop_videos_staging.${sql.raw(
                tableName,
            )} TO kpop_videos.${sql.raw(tableName)};`.execute(db.kpopVideos);
        } else {
            logger.info(`Table '${tableName}' doesn't exist, creating...`);
            await sql
                .raw(
                    `ALTER TABLE kpop_videos_staging.${tableName} RENAME kpop_videos.${tableName}`,
                )
                .execute(db.agnostic);
        }
    }

    await sql`DROP TABLE IF EXISTS kpop_videos.old;`.execute(db.agnostic);
    await sql`DROP DATABASE IF EXISTS kpop_videos_staging;`.execute(
        db.agnostic,
    );

    // Apply SQL overrides
    logger.info("Applying data overrides...");
    const overrideQueries = await getOverrideQueries(db);
    await Promise.all(
        overrideQueries.map(async (overrideQuery) =>
            sql.raw(overrideQuery).execute(db.kpopVideos),
        ),
    );

    logger.info("Phase 3 complete: kpop_videos updated from staging");
}
