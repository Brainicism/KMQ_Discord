/* eslint-disable no-console */

import * as readline from "readline";
import { FileMigrationProvider, Migrator } from "kysely";
import { IPCLogger } from "../logger.js";
import { promises as fsp } from "fs";
import { getNewConnection } from "../database_context.js";
import path from "path";
import type { DatabaseContext } from "../database_context.js";

const logger = new IPCLogger("migrate_down");

function getChoice(): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question("Select a choice:\n", (ans) => {
            rl.close();
            resolve(ans);
        });
    });
}

async function performMigrationDown(db: DatabaseContext): Promise<void> {
    logger.info("Performing migrations (down)...");
    const migrator = new Migrator({
        db: db.kmq,
        provider: new FileMigrationProvider({
            fs: fsp,
            path,
            // This needs to be an absolute path.
            migrationFolder: path.join(import.meta.dirname, "../migrations"),
        }),
    });

    const currentMigrations = (await migrator.getMigrations()).filter(
        (x) => x.executedAt,
    );

    console.log(
        `Select a migration to migrate down to (0 - ${
            currentMigrations.length - 2
        }): `,
    );

    console.log(
        currentMigrations
            .map(
                (x, i) =>
                    `(${
                        i === currentMigrations.length - 1 ? "CURRENT" : i
                    }) | ${x.executedAt!.toISOString()} | ${x.name} `,
            )
            .join("\n"),
    );

    const choice = Number(await getChoice());
    if (
        Number.isNaN(choice) ||
        choice < 0 ||
        choice > currentMigrations.length - 2
    ) {
        console.error("Invalid choice");
        process.exit(1);
    }

    const selectedRollbackMigration = currentMigrations[choice]!;
    console.log(
        `Selected migration rollback: ${selectedRollbackMigration.name}`,
    );

    const { error, results } = await migrator.migrateTo(
        selectedRollbackMigration.name,
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

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    if (import.meta.main) {
        const db = getNewConnection();
        await performMigrationDown(db);
        await db.destroy();
    }
})();
