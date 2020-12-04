import Axios from "axios";
import fs from "fs";
import { execSync } from "child_process";
import unzipper from "unzipper";
import mysql from "promise-mysql";
import prependFile from "prepend-file";
import { Logger } from "log4js";
import { config } from "dotenv";
import path from "path";
import _logger from "../logger";
import removeRedunantAliases from "../scripts/remove-redunant-aliases";
import { downloadAndConvertSongs } from "../scripts/download-new-songs";

config({ path: path.resolve(__dirname, "../../.env") });
const fileUrl = "http://kpop.aoimirai.net/download.php";
const logger: Logger = _logger("seed_db");
const databaseDownloadDir = process.env.AOIMIRAI_DUMP_DIR;

const setSqlMode = (sqlFile: string) => {
    prependFile.sync(sqlFile, "SET @@sql_mode=\"\";\n");
};

const downloadDb = async () => {
    const output = `${databaseDownloadDir}/bootstrap.zip`;
    const resp = await Axios.get(fileUrl, {
        responseType: "arraybuffer",
        headers: {
            // eslint-disable-next-line quote-props
            "Host": "kpop.aoimirai.net",
            "User-Agent": "KMQ (K-pop Music Quiz)",
        },
    });

    await fs.promises.writeFile(output, resp.data, { encoding: null });
    logger.info("Downloaded database.zip");
};
async function extractDb(): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.createReadStream(`${databaseDownloadDir}/bootstrap.zip`)
            .pipe(unzipper.Extract({ path: `${databaseDownloadDir}/sql/` }))
            .on("error", (err) => {
                // this throws an error even though it finished successfully
                if (!err.toString().includes("invalid signature")) {
                    reject(err);
                }
                logger.info("Extracted database.zip");
                resolve();
            })
            .on("finish", () => resolve());
    });
}

async function seedDb(db: mysql.Connection) {
    const files = await fs.promises.readdir(`${databaseDownloadDir}/sql`);
    const seedFile = files[files.length - 1];
    const seedFilePath = `${databaseDownloadDir}/sql/${seedFile}`;
    logger.info("Dropping K-Pop video database");
    await db.query("DROP DATABASE IF EXISTS kpop_videos;");
    logger.info("Creating K-pop video database");
    await db.query("CREATE DATABASE kpop_videos;");
    logger.info("Seeding K-Pop video database");
    setSqlMode(seedFilePath);
    execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} kpop_videos < ${seedFilePath}`);
    logger.info(`Imported database dump (${seedFile}) successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing`);
    logger.info("Creating K-pop Music Quiz database");
}

async function hasRecentDump(): Promise<boolean> {
    const dumpPath = `${databaseDownloadDir}/sql`;
    let files : string[];
    try {
        files = await fs.promises.readdir(dumpPath);
    } catch (err) {
        // If the directory doesn't exist, we don't have a recent dump.
        if (err.code === "ENOENT") return false;
        // Otherwise just throw.
        throw err;
    }
    if (files.length === 0) return false;
    const seedFileDateString = files[files.length - 1].match(/backup_([0-9]{4}-[0-9]{2}-[0-9]{2}).sql/)[1];
    logger.info(`Most recent seed file has date: ${seedFileDateString}`);
    const daysDiff = ((new Date()).getTime() - Date.parse(seedFileDateString)) / 86400000;
    return daysDiff < 6;
}

async function seedKpopDataDatabase() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
    });

    if (await hasRecentDump()) {
        logger.info("Recent dump detected, skipping download...");
    } else {
        await downloadDb();
        await extractDb();
    }

    await seedDb(db);
    await db.end();
}

(async () => {
    if (require.main === module) {
        try {
            await fs.promises.mkdir(`${databaseDownloadDir}/sql`, { recursive: true });
            await seedKpopDataDatabase();
            await removeRedunantAliases();
            await downloadAndConvertSongs();
        } catch (e) {
            logger.error(`Error: ${e}`);
        }
    }
})();

// eslint-disable-next-line import/prefer-default-export
export { seedKpopDataDatabase };
