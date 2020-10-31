import Axios from "axios";
import fs from "fs";
import { execSync } from "child_process";
import unzipper from "unzipper";
import mysql from "promise-mysql";
import prependFile from 'prepend-file';
import _logger from "../logger";
import { Logger } from "log4js";
import { removeRedunantAliases } from "../scripts/remove-redunant-aliases";
import { downloadAndConvertSongs } from "../scripts/download-new-songs";
const fileUrl = "http://kpop.aoimirai.net/download.php";
const logger: Logger = _logger("seed_db");
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../.env") })

const databaseDownloadDir = "./kpop_db";

const setSqlMode = (sqlFile: string) => {
    prependFile.sync(sqlFile, `SET @@sql_mode="";\n`);
}

const downloadDb = async () => {
    const output = `${databaseDownloadDir}/bootstrap.zip`
    const resp = await Axios.get(fileUrl, {
        responseType: "arraybuffer",
        headers: {
            "Host": "kpop.aoimirai.net",
            "User-Agent": "PostmanRuntime/7.22.0"
        }
    });

    await fs.promises.writeFile(output, resp.data, { encoding: null });
    logger.info("Downloaded database.zip");
}
const extractDb = async () => {
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
            .on("finish", () => resolve())
    })
}

const seedDb = async (db: mysql.Connection) => {
    return new Promise(async (resolve, reject) => {
        const files = await fs.promises.readdir(`${databaseDownloadDir}/sql`);
        const seedFile = files[files.length - 1];
        const seedFilePath = `${databaseDownloadDir}/sql/${seedFile}`;
        logger.info("Dropping K-Pop video database");
        await db.query(`DROP DATABASE IF EXISTS ${process.env.DB_KPOP_DATA_TABLE_NAME};`);
        logger.info("Creating K-pop video database")
        await db.query(`CREATE DATABASE ${process.env.DB_KPOP_DATA_TABLE_NAME};`);
        logger.info("Seeding K-Pop video database");
        setSqlMode(seedFilePath);
        execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} ${process.env.DB_KPOP_DATA_TABLE_NAME} < ${seedFilePath}`)
        logger.info(`Imported database dump (${seedFile}) successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing`);
        logger.info("Creating K-pop Music Quiz database");
        await db.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_KMQ_SETTINGS_TABLE_NAME}`);
        resolve();
    })

}
(async () => {
    try {
        await fs.promises.mkdir(`${databaseDownloadDir}/sql`, { recursive: true })
        const db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS
        });
        await downloadDb();
        await extractDb();
        await seedDb(db);
        await removeRedunantAliases();
        db.destroy();
        logger.info("Downloading new songs")
        await downloadAndConvertSongs();
        logger.info("Re-creating available songs view");
        execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} ${process.env.DB_KPOP_DATA_TABLE_NAME} < ./src/seed/create_available_songs_table.sql`);
    } catch (e) {
        logger.error("Error: " + e);
    }
})();

