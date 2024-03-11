/* eslint-disable node/no-sync */
import * as cp from "child_process";
import { IPCLogger } from "../logger";
import { TEST_DB_CACHED_EXPORT } from "../constants";
import { getNewConnection } from "../database_context";
import { importCachedDump, performMigrations } from "../seed/bootstrap";
import { sql } from "kysely";
import EnvType from "../enums/env_type";

const logger = new IPCLogger("regenerate-test-db-dump");

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    if (require.main === module) {
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
