import { DATABASE_DOWNLOAD_DIR } from "../../constants";
import { IPCLogger } from "../../logger";
import { sql } from "kysely";
import { exec as execCb } from "child_process";
import util from "util";
import type { DatabaseContext } from "../../database_context";

const exec = util.promisify(execCb);
const logger = new IPCLogger("seed_phase_cleanup");

const SQL_DUMP_EXPIRY = 10;

/**
 * Phase 7: Cleanup — Prune old SQL dumps and drop leftover temp databases.
 *
 * @param db - The database context
 */
export async function cleanup(db: DatabaseContext): Promise<void> {
    logger.info("Phase 7: Cleaning up...");

    // Drop any leftover staging/validation databases
    await sql`DROP DATABASE IF EXISTS kpop_videos_staging;`
        .execute(db.agnostic)
        .catch(() => {});

    await sql`DROP DATABASE IF EXISTS kpop_videos_validation;`
        .execute(db.agnostic)
        .catch(() => {});

    await sql`DROP DATABASE IF EXISTS kpop_videos_tmp;`
        .execute(db.agnostic)
        .catch(() => {});

    // Prune old SQL dumps
    try {
        await exec(
            `find ${DATABASE_DOWNLOAD_DIR} -mindepth 1 -name "*backup_*" -mtime +${SQL_DUMP_EXPIRY} -delete`,
        );

        logger.info("Finished pruning old SQL dumps");
    } catch (err) {
        logger.error(`Error attempting to prune SQL dumps directory, ${err}`);
    }

    logger.info("Phase 7 complete: cleanup done");
}
