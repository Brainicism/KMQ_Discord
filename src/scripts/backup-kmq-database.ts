import fs from "fs";
import { Logger } from "log4js";
import { join } from "path";
import mysqldump from "mysqldump";
import _logger from "../logger";
import { friendlyFormattedDate } from "../helpers/utils";
import { getNewConnection } from "../database_context";

const databaseBackupDir = join(__dirname, "../../kpop_db/kmq_backup");

const logger: Logger = _logger("backup-kmq");

async function backupKmqDatabase(): Promise<void> {
    if (!fs.existsSync(databaseBackupDir)) {
        fs.mkdirSync(databaseBackupDir);
    }
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
    const db = getNewConnection();
    try {
        if (require.main === module) {
            backupKmqDatabase();
        }
    } finally {
        await db.destroy();
    }
})();

export default backupKmqDatabase;
