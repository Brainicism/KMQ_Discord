import { DATABASE_DOWNLOAD_DIR, DataFiles } from "../../constants";
import { IPCLogger } from "../../logger";
import { parseJsonFile, pathExists } from "../../helpers/utils";
import { sql } from "kysely";
import { exec as execCb } from "child_process";
import _ from "lodash";
import fs from "fs";
import path from "path";
import util from "util";
import type { DatabaseContext } from "../../database_context";

const exec = util.promisify(execCb);
const logger = new IPCLogger("seed_phase_validate");

async function getDaisukiTableNames(
    db: DatabaseContext,
    schemaName: string,
): Promise<string[]> {
    return (
        await db.infoSchema
            .selectFrom("TABLES")
            .select("TABLE_NAME")
            .where("TABLE_SCHEMA", "=", schemaName)
            .execute()
    ).map((x) => x.TABLE_NAME);
}

async function getOverrideQueries(db: DatabaseContext): Promise<Array<string>> {
    return (
        await db.kmq
            .selectFrom("kpop_videos_sql_overrides")
            .select(["query"])
            .execute()
    ).map((x) => x.query);
}

async function validateDaisukiTableSchema(
    db: DatabaseContext,
    frozenSchema: any,
): Promise<void> {
    const outputMessages: Array<string> = [];
    await Promise.allSettled(
        (await getDaisukiTableNames(db, "kpop_videos_staging")).map(
            async (table) => {
                const commaSeparatedColumnNames = (
                    await db.infoSchema
                        .selectFrom("COLUMNS")
                        .select((eb) =>
                            eb
                                .fn<string>("group_concat", ["COLUMN_NAME"])
                                .as("x"),
                        )
                        .where("TABLE_SCHEMA", "=", "kpop_videos_staging")
                        .where("TABLE_NAME", "=", table)
                        .executeTakeFirstOrThrow()
                ).x;

                const columnNames = _.sortBy(
                    commaSeparatedColumnNames.split(","),
                );

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
                            `__${table}__\nAdded columns: ${JSON.stringify(addedColumns)}.\nRemoved Columns: ${JSON.stringify(removedColumns)}\n`,
                        );
                    }
                }
            },
        ),
    );

    if (outputMessages.length > 0) {
        outputMessages.unshift("Daisuki schema has changed.");
        outputMessages.push(
            "If the Daisuki schema change is acceptable, delete frozen schema file and re-run this script",
        );
        throw new Error(outputMessages.join("\n"));
    }
}

async function loadStoredProceduresForStaging(): Promise<void> {
    const storedProcedureDefinitions = (
        await fs.promises.readdir(
            path.join(__dirname, "../../../sql/procedures"),
        )
    )
        .map((x) => path.join(__dirname, "../../../sql/procedures", x))
        .sort();

    // eslint-disable-next-line no-await-in-loop
    for (const storedProcedureDefinition of storedProcedureDefinitions) {
        const testProcedurePath = path.resolve(
            path.dirname(storedProcedureDefinition),
            "..",
            path
                .basename(storedProcedureDefinition)
                .replace(".sql", ".staging.sql"),
        );

        // eslint-disable-next-line no-await-in-loop
        await exec(
            `sed 's/kpop_videos\\./kpop_videos_staging./g' ${storedProcedureDefinition} > ${testProcedurePath}`,
        );

        logger.info(`Loading procedure for staging: ${testProcedurePath}`);
        // eslint-disable-next-line no-await-in-loop
        await exec(
            `mysql --default-character-set=utf8mb4 -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_staging < ${testProcedurePath}`,
        );
    }
}

/**
 * Phase 2: Validate — Import dump into staging DB and validate it.
 *
 * Loads the dump into `kpop_videos_staging` and runs count checks, overrides,
 * stored procedures, and schema diff validation. The staging DB is left intact
 * for Phase 3 (Import) to reuse, eliminating the double-import of the old pipeline.
 *
 * @param db - The database context
 * @param bootstrap - Whether this is a bootstrap (first-time) run
 */
export async function validate(
    db: DatabaseContext,
    bootstrap = false,
): Promise<void> {
    const sqlFiles = (
        await fs.promises.readdir(`${DATABASE_DOWNLOAD_DIR}`)
    ).filter((x) => x.endsWith(".sql"));

    const dbSeedFile = sqlFiles
        .filter((x) => x.endsWith(".sql") && x.startsWith("mainbackup_"))
        .slice(-1)[0];

    const dbSeedFilePath = bootstrap
        ? `${DATABASE_DOWNLOAD_DIR}/bootstrap.sql`
        : `${DATABASE_DOWNLOAD_DIR}/${dbSeedFile}`;

    logger.info(
        `Phase 2: Validating SQL dump (${path.basename(dbSeedFilePath)})...`,
    );

    try {
        await sql`DROP DATABASE IF EXISTS kpop_videos_staging;`.execute(
            db.agnostic,
        );

        await sql`CREATE DATABASE kpop_videos_staging;`.execute(db.agnostic);

        await exec(
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_staging < ${dbSeedFilePath}`,
        );

        logger.info("Validating MV song count");
        const mvSongCount = (
            await sql<{ count: number }>`
            SELECT COUNT(*) as count FROM kpop_videos_staging.app_kpop WHERE is_audio = 'n'
        `.execute(db.agnostic)
        ).rows[0]!.count;

        logger.info(`Found ${mvSongCount} music videos`);

        logger.info("Validating audio-only song count");
        const audioSongCount = (
            await sql<{ count: number }>`
            SELECT COUNT(*) as count FROM kpop_videos_staging.app_kpop WHERE is_audio = 'y'
        `.execute(db.agnostic)
        ).rows[0]!.count;

        logger.info(`Found ${audioSongCount} audio-only videos`);

        logger.info("Validating group count");
        const artistCount = (
            await sql<{ count: number }>`
            SELECT COUNT(*) as count FROM kpop_videos_staging.app_kpop_group
        `.execute(db.agnostic)
        ).rows[0]!.count;

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
                const rewritten = overrideQuery.replace(
                    /kpop_videos\./g,
                    "kpop_videos_staging.",
                );

                await sql.raw(rewritten).execute(db.agnostic);
            }),
        );

        if (!bootstrap) {
            // Load stored procedures rewritten for staging
            await loadStoredProceduresForStaging();

            logger.info("Validating BuildExpectedAvailableSongs on staging");

            await sql
                .raw("CALL BuildExpectedAvailableSongs();")
                .execute(db.agnostic);

            logger.info("Validating BuildAvailableSongs on staging");
            await sql.raw("CALL BuildAvailableSongs();").execute(db.agnostic);
        }
    } catch (e) {
        // If validation fails, clean up staging DB
        await sql`DROP DATABASE IF EXISTS kpop_videos_staging;`
            .execute(db.agnostic)
            .catch(() => {});
        throw new Error(
            `SQL dump validation failed. ${(e as any).sqlMessage || (e as any).stderr || e}. stack = ${new Error().stack}`,
        );
    }

    if (await pathExists(DataFiles.FROZEN_TABLE_SCHEMA)) {
        logger.info("Daisuki schema exists... checking for changes");
        const frozenSchema = await parseJsonFile(DataFiles.FROZEN_TABLE_SCHEMA);
        await validateDaisukiTableSchema(db, frozenSchema);
    }

    logger.info(
        "SQL dump validated successfully (staging DB preserved for import)",
    );
}
