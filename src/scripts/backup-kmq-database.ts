import fs from "fs";
import { join } from "path";
import { exec, execSync } from "child_process";
import { friendlyFormattedDate } from "../helpers/utils";
import { IPCLogger } from "../logger";

const BACKUP_TTL = 30;

const databaseBackupDir = join(__dirname, "../../sql_dumps/kmq_backup");

const logger = new IPCLogger("backup-kmq");

async function backupKmqDatabase(): Promise<void> {
    if (!fs.existsSync(databaseBackupDir)) {
        fs.mkdirSync(databaseBackupDir);
    }

    execSync(`find ${databaseBackupDir} -mindepth 1 -name "*kmq_backup_*" -mtime +${BACKUP_TTL} -delete`);

    return new Promise((resolve, reject) => {
        exec(`mysqldump --column-statistics=0 -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} --routines kmq > ${databaseBackupDir}/kmq_backup_${friendlyFormattedDate(new Date())}.sql`, (err) => {
            if (err) {
                logger.error(`Error backing up kmq database, err = ${err}`);
                reject(err);
                return;
            }

            resolve();
        });
    });
}

(async () => {
    if (require.main === module) {
        backupKmqDatabase();
    }
})();

export default backupKmqDatabase;
