/* eslint-disable node/no-sync */
import * as cp from "child_process";
import { Command } from "@commander-js/extra-typings";
import { IPCLogger } from "../logger.js";
import { join } from "path";
import fs from "fs";
import util from "util";

const exec = util.promisify(cp.exec);

const BACKUP_TTL = 30;

const databaseBackupDir = join(
    import.meta.dirname,
    "../../sql_dumps/kmq_backup",
);

const logger = new IPCLogger("backup-kmq");
const program = new Command().option(
    "-i, --import <file>",
    "The dump file to import",
);

program.parse();
const options = program.opts();

/**
 * Backups the current KMQ database
 */
async function backupKmqDatabase(): Promise<void> {
    if (!fs.existsSync(databaseBackupDir)) {
        fs.mkdirSync(databaseBackupDir);
    }

    await exec(
        `find ${databaseBackupDir} -mindepth 1 -name "*kmq_backup_*" -mtime +${BACKUP_TTL} -delete`,
    );

    const backupSqlFileName = `kmq_backup_${new Date().toISOString()}.sql`;
    const backupGzipFileName = backupSqlFileName.replace(".sql", ".tar.gz");

    try {
        logger.info("Dumping database...");
        await exec(
            `mysqldump -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} --routines kmq > ${databaseBackupDir}/${backupSqlFileName}`,
        );

        logger.info("Compressing output...");
        await exec(
            `tar -C ${databaseBackupDir} -czvf ${databaseBackupDir}/${backupGzipFileName} ${backupSqlFileName}`,
        );

        if (process.env.AZURE_STORAGE_SAS_TOKEN) {
            await exec(
                `azcopy copy "${databaseBackupDir}/${backupGzipFileName}" "${process.env.AZURE_STORAGE_SAS_TOKEN}"`,
            );
        }

        logger.info("Cleaning up...");
        await fs.promises.unlink(`${databaseBackupDir}/${backupSqlFileName}`);
    } catch (err) {
        logger.error(`Error backing up kmq database, err = ${err}`);
    }
}

function importKmqDatabase(fileWithPath: string): void {
    if (!fs.existsSync(fileWithPath)) {
        logger.error(`Dump file ${fileWithPath} doesn't exist.`);
        return;
    }

    logger.info(`Beginning import of ${fileWithPath}`);
    cp.execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT}  kmq < ${fileWithPath}`,
    );
    logger.info("Finished import");
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    if (import.meta.main) {
        if (options.import) {
            importKmqDatabase(options.import);
        } else {
            await backupKmqDatabase();
        }
    }
})();

export default backupKmqDatabase;
