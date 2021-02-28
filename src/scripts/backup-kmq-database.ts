import fs from "fs";
import { exec, execSync } from "child_process";
import { program } from "commander";
import { Logger } from "log4js";
import _logger from "../logger";
import { friendlyFormattedDate } from "../helpers/utils";

const databaseBackupDir = `${process.env.AOIMIRAI_DUMP_DIR}/kmq_backup`;
const logger: Logger = _logger("backup-kmq");

program
    .option("-i, --import <file>", "The dump file to import");

program.parse();
const options = program.opts();

async function backupKmqDatabase(): Promise<void> {
    if (!fs.existsSync(databaseBackupDir)) {
        fs.mkdirSync(databaseBackupDir);
    }
    return new Promise((resolve, reject) => {
        exec(`mysqldump -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --routines kmq > ${databaseBackupDir}/kmq_backup_${friendlyFormattedDate(new Date())}.sql`, (err) => {
            if (err) {
                logger.error(`Error backing up kmq database, err = ${err}`);
                reject(err);
                return;
            }
            resolve();
        });
    });
}

function importKmqDatabase(fileWithPath: string) {
    if (!fs.existsSync(fileWithPath)) {
        logger.error(`Dump file ${fileWithPath} doesn't exist.`);
        return;
    }
    execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} kmq < ${fileWithPath}`);
}

(async () => {
    if (require.main === module) {
        if (options.import) {
            importKmqDatabase(options.import);
        } else {
            backupKmqDatabase();
        }
    }
})();

export default backupKmqDatabase;
