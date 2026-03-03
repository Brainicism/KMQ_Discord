/* eslint-disable node/no-sync */
import * as cp from "child_process";
import { IPCLogger } from "../logger.js";
import { TEST_DB_CACHED_EXPORT } from "../constants.js";
import { getNewConnection } from "../database_context.js";
import { importCachedDump, performMigrations } from "../seed/bootstrap.js";
import { sql } from "kysely";
import EnvType from "../enums/env_type.js";

const logger = new IPCLogger("regenerate-test-db-dump");

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    if (import.meta.main) {
        if (process.env.NODE_ENV !== EnvType.TEST) {
            logger.error("Must be running with NODE_ENV=EnvType.TEST");
            process.exit(1);
        }

        logger.info("Regenerating test db dump..");
        const db = getNewConnection();
        await sql`DROP DATABASE IF EXISTS kmq_test;`.execute(db.agnostic);
        await sql`CREATE DATABASE kmq_test;`.execute(db.agnostic);

        importCachedDump("kmq_test");
        logger.info("Performing migrations on KMQ test database");
        await performMigrations(db);

        cp.execSync(
            `mysqldump -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq_test > ${TEST_DB_CACHED_EXPORT}`,
        );

        await db.destroy();
    }
})();
