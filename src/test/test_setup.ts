import { DATABASE_DOWNLOAD_DIR } from "../constants";
import { IPCLogger } from "../logger";
import { execSync } from "child_process";
import EnvType from "../enums/env_type";
import Session from "../structures/session";
import dbContext, { getNewConnection } from "../database_context";
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
    const db = getNewConnection();
    logger.info("Performing migrations on KMQ database");
    await db.agnostic.raw("DROP DATABASE IF EXISTS kmq_test;");
    await db.agnostic.raw("CREATE DATABASE kmq_test;");
    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_test;");
    await db.agnostic.raw("CREATE DATABASE kpop_videos_test;");

    // perform KMQ database migrations
    await db.kmq.migrate.latest({
        directory: kmqKnexConfig.migrations.directory,
    });

    logger.info("Setting up test Daisuki database");
    // import frozen db dump
    const mvSeedFilePath = `${DATABASE_DOWNLOAD_DIR}/bootstrap.sql`;
    const mvAudioSeedFilePath = `${DATABASE_DOWNLOAD_DIR}/bootstrap-audio.sql`;
    execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_test < ${mvSeedFilePath}`
    );

    execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_test < ${mvAudioSeedFilePath}`
    );

    // simulate cached song duration table, so that available_songs table can be created
    await db.agnostic.raw(
        "INSERT IGNORE INTO kmq_test.cached_song_duration SELECT vlink, 1 FROM kpop_videos_test.app_kpop;"
    );

    await db.agnostic.raw(
        "INSERT IGNORE INTO kmq_test.cached_song_duration SELECT vlink, 1 FROM kpop_videos_test.app_kpop_audio;"
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

    execSync(
        `sed 's/kpop_videos/kpop_videos_test/g;s/kmq/kmq_test/g' ${originalCreateKmqTablesProcedureSqlPath} > ${testCreateKmqTablesProcedureSqlPath}`
    );

    execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test < ${testCreateKmqTablesProcedureSqlPath}`,
        { stdio: "inherit" }
    );

    // create available_songs table
    execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test -e "CALL CreateKmqDataTables(1)"`
    );

    sandbox
        .stub(Session.prototype, "isPremium")
        .callsFake(() => Promise.resolve(false));

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
