/* eslint-disable no-await-in-loop */
/* eslint-disable node/no-sync */
import * as cp from "child_process";
import { DATABASE_DOWNLOAD_DIR } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    importCachedDump,
    performMigrationDown,
    performMigrations,
} from "../../seed/bootstrap";
import { sql } from "kysely";
import EnvType from "../../enums/env_type";
import dbContext, { getNewConnection } from "../../database_context";
import fs from "fs";
import path from "path";
import sinon from "sinon";

const logger = new IPCLogger("test_setup");
const sandbox = sinon.createSandbox();

async function loadStoredProceduresForTest(): Promise<void> {
    const storedProcedureDefinitions = (
        await fs.promises.readdir(
            path.join(__dirname, "../../../sql/procedures"),
        )
    )
        .map((x) => path.join(__dirname, "../../../sql/procedures", x))
        .sort();

    for (const storedProcedureDefinition of storedProcedureDefinitions) {
        const testProcedurePath = path.resolve(
            path.dirname(storedProcedureDefinition),
            "..",
            path
                .basename(storedProcedureDefinition)
                .replace(".sql", ".test.sql"),
        );

        cp.execSync(
            `sed 's/kpop_videos/kpop_videos_test/g;s/kmq/kmq_test/g' ${storedProcedureDefinition} > ${testProcedurePath}`,
        );

        logger.info(`Loading procedure for test: ${testProcedurePath}`);

        cp.execSync(
            `mysql --default-character-set=utf8mb4 -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test < ${testProcedurePath}`,
            { stdio: "inherit" },
        );
    }
}

before(async function () {
    if (process.env.NODE_ENV !== EnvType.TEST) {
        logger.error("Must be running with NODE_ENV=EnvType.TEST");
        process.exit(1);
    }

    this.timeout(60000);
    logger.info("Acquiring database connections");
    const db = getNewConnection();
    await sql`DROP DATABASE IF EXISTS kmq_test;`.execute(db.agnostic);
    await sql`CREATE DATABASE kmq_test;`.execute(db.agnostic);
    await sql`DROP DATABASE IF EXISTS kpop_videos_test;`.execute(db.agnostic);
    await sql`CREATE DATABASE kpop_videos_test;`.execute(db.agnostic);

    logger.info(
        "Re-creating KMQ test database from cached export. Run 'regenerate-test-db-dump' if schema has been updated since.",
    );

    importCachedDump("kmq_test");

    logger.info("Performing migrations on KMQ database");
    await performMigrations(db);

    logger.info("Setting up test Daisuki database");
    // import frozen db dump
    const dbSeedFilePath = `${DATABASE_DOWNLOAD_DIR}/bootstrap.sql`;

    logger.info("Importing Daisuki seed file");
    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_test < ${dbSeedFilePath}`,
    );

    await loadStoredProceduresForTest();

    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test -e "CALL PostSeedDataCleaning()"`,
    );

    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test -e "CALL GenerateExpectedAvailableSongs()"`,
    );

    // simulate cached song duration table, so that available_songs table can be created
    await sql`INSERT IGNORE INTO kmq_test.cached_song_duration SELECT link, 1 FROM kmq_test.expected_available_songs;`.execute(
        db.agnostic,
    );

    logger.info("Creating KMQ data tables");

    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test -e "CALL CreateKmqDataTables()"`,
    );

    await db.destroy();
    return false;
});

after(async function () {
    this.timeout(60000);
    sandbox.restore();
    logger.info("Rolling back migrations...");
    await performMigrationDown(dbContext);

    logger.info("Test re-applying migrations...");
    await performMigrations(dbContext);
    await dbContext.destroy();
});
