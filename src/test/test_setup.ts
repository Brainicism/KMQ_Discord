/* eslint-disable node/no-sync */
import * as cp from "child_process";
import { DATABASE_DOWNLOAD_DIR, TEST_DB_CACHED_EXPORT } from "../constants";
import { FileMigrationProvider, Migrator } from "kysely";
import { IPCLogger } from "../logger";
import EnvType from "../enums/env_type";
import dbContext, { getNewConnection } from "../database_context";
import fs, { promises as fsPromises } from "fs";
import kmqKnexConfig from "../config/knexfile_kmq";
import path from "path";
import sinon from "sinon";

const logger = new IPCLogger("test_setup");
const sandbox = sinon.createSandbox();

before(async function () {
    if (process.env.NODE_ENV !== EnvType.TEST) {
        logger.error("Must be running with NODE_ENV=EnvType.TEST");
        process.exit(1);
    }

    this.timeout(20000);
    logger.info("Acquiring database connections");
    const db = getNewConnection();
    await db.agnostic.raw("DROP DATABASE IF EXISTS kmq_test;");
    await db.agnostic.raw("CREATE DATABASE kmq_test;");
    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_test;");
    await db.agnostic.raw("CREATE DATABASE kpop_videos_test;");

    if (fs.existsSync(TEST_DB_CACHED_EXPORT)) {
        logger.info(
            "Re-creating KMQ test database from cached export. Run 'regenerate-test-db-dump' if schema has been updated since."
        );

        cp.execSync(
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test < ${TEST_DB_CACHED_EXPORT}`
        );
    }

    logger.info("Performing migrations on KMQ database");
    const migrator = new Migrator({
        db: db.kmq2,
        provider: new FileMigrationProvider({
            fs: fsPromises,
            path,
            migrationFolder: kmqKnexConfig.migrations.directory,
        }),
    });

    const { error, results } = await migrator.migrateToLatest();

    if (results) {
        for (const result of results) {
            if (result.status === "Success") {
                logger.info(
                    `Migration "${result.migrationName}" was executed successfully`
                );
            } else if (result.status === "Error") {
                logger.error(
                    `Failed to execute migration "${result.migrationName}"`
                );
            }
        }
    }

    if (error) {
        logger.error(`Failed to run migrations. "${error}"`);
        process.exit(1);
    }

    logger.info("Setting up test Daisuki database");
    // import frozen db dump
    const dbSeedFilePath = `${DATABASE_DOWNLOAD_DIR}/bootstrap.sql`;

    logger.info("Importing Daisuki seed file");
    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_test < ${dbSeedFilePath}`
    );

    // simulate cached song duration table, so that available_songs table can be created
    await db.agnostic.raw(
        "INSERT IGNORE INTO kmq_test.cached_song_duration SELECT vlink, 1 FROM kpop_videos_test.app_kpop;"
    );

    // create dedup group name procedure
    const originalDedupGroupNamesSqlPath = path.join(
        __dirname,
        "../../sql/procedures/deduplicate_app_kpop_group_names.sql"
    );

    const testDedupGroupNamesSqlPath = path.join(
        __dirname,
        "../../sql/deduplicate_app_kpop_group_names.validation.sql"
    );

    cp.execSync(
        `sed 's/kpop_videos/kpop_videos_test/g;s/kmq/kmq_test/g' ${originalDedupGroupNamesSqlPath} > ${testDedupGroupNamesSqlPath}`
    );

    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test < ${testDedupGroupNamesSqlPath}`,
        { stdio: "inherit" }
    );

    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test -e "CALL DeduplicateGroupNames()"`
    );

    // create kmq data generation procedure
    const originalCreateKmqTablesProcedureSqlPath = path.join(
        __dirname,
        "../../sql/procedures/create_kmq_data_tables_procedure.sql"
    );

    const testCreateKmqTablesProcedureSqlPath = path.join(
        __dirname,
        "../../sql/create_kmq_data_tables_procedure.test.sql"
    );

    cp.execSync(
        `sed 's/kpop_videos/kpop_videos_test/g;s/kmq/kmq_test/g' ${originalCreateKmqTablesProcedureSqlPath} > ${testCreateKmqTablesProcedureSqlPath}`
    );

    logger.info("Creating KMQ data tables");
    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test < ${testCreateKmqTablesProcedureSqlPath}`,
        { stdio: "inherit" }
    );

    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test -e "CALL CreateKmqDataTables(1)"`
    );

    await db.destroy();
    return false;
});

after(async function () {
    this.timeout(20000);
    sandbox.restore();
    logger.info("Rolling back migrations...");
    await dbContext.kmq.migrate.rollback(
        {
            directory: kmqKnexConfig.migrations.directory,
        },
        true
    );
    logger.info("Test re-applying migrations...");
    await dbContext.kmq.migrate.latest({
        directory: kmqKnexConfig.migrations.directory,
    });
    dbContext.destroy();
});
