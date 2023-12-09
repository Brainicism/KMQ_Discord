import { FileMigrationProvider, Migrator, NO_MIGRATIONS } from "kysely";
import { IPCLogger } from "../logger";
import { promises as fsp } from "fs";
import { getNewConnection } from "../database_context";
import path from "path";
import type { DatabaseContext } from "../database_context";

const logger = new IPCLogger("messageCreate");

async function performMigrationDown(
    db: DatabaseContext,
    migrationName: string | undefined,
): Promise<void> {
    logger.info("Performing migrations (down)...");
    const migrator = new Migrator({
        db: db.kmq,
        provider: new FileMigrationProvider({
            fs: fsp,
            path,
            // This needs to be an absolute path.
            migrationFolder: path.join(__dirname, "../migrations"),
        }),
    });

    const { error, results } = await migrator.migrateTo(
        migrationName === undefined ? NO_MIGRATIONS : migrationName,
    );

    for (const result of results || []) {
        if (result.status === "Success") {
            logger.info(
                `Migration (down) "${result.migrationName}" was executed successfully`,
            );
        } else if (result.status === "Error") {
            logger.error(
                `Failed to execute migration: "${result.migrationName}"`,
            );
        }
    }

    if (error) {
        throw new Error(`Failed to migrate, err: ${error}`);
    }
}

(async () => {
    if (require.main === module) {
        const args = process.argv.slice(2);
        const migrationName = args[0];
        if (!migrationName) {
            logger.error("Target migration not specified");
            process.exit(1);
        }

        const db = getNewConnection();
        await performMigrationDown(
            db,
            migrationName === "EMPTY" ? undefined : migrationName,
        );
        await db.destroy();
    }
})();
