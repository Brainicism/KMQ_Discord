import fs from "fs";
import { join } from "path";
import mysqldump from "mysqldump";
import { execSync } from "child_process";
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

    try {
        await mysqldump({
            connection: {
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASS,
                port: parseInt(process.env.DB_PORT),
                database: "kmq",
            },
            dumpToFile: `${databaseBackupDir}/kmq_backup_${friendlyFormattedDate(new Date())}.sql`,
            dump: {
                schema: {
                    table: {
                        dropIfExist: true,
                    },
                },
            },
        });
    } catch (e) {
        logger.error(`Error backing up kmq database, err = ${e}`);
    }
}

(async () => {
    if (require.main === module) {
        backupKmqDatabase();
    }
})();

export default backupKmqDatabase;
