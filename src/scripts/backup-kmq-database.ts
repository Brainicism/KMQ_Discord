import fs from "fs";
import { exec } from "child_process";
import { friendlyFormattedDate } from "../helpers/utils";

const databaseBackupDir = `${process.env.AOIMIRAI_DUMP_DIR}/kmq_backup`;

async function backupKmqDatabase() {
    if (!fs.existsSync(databaseBackupDir)) {
        fs.mkdirSync(databaseBackupDir);
    }
    exec(`mysqldump -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --routines kmq > ${databaseBackupDir}/kmq_backup_${friendlyFormattedDate(new Date())}.sql`);
}

(async () => {
    if (require.main === module) {
        backupKmqDatabase();
    }
})();

export default backupKmqDatabase;
