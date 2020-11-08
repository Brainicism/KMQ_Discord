import Axios from "axios";
import fs from "fs";
import { execSync, spawn } from "child_process";
import unzipper from "unzipper";
import mysql from "promise-mysql";
import prependFile from "prepend-file";
import { Logger } from "log4js";
import { config } from "dotenv";
import path from "path";
import _logger from "../logger";
import removeRedunantAliases from "../scripts/remove-redunant-aliases";

config({ path: path.resolve(__dirname, "../../.env") });
const fileUrl = "http://kpop.aoimirai.net/download.php";
const logger: Logger = _logger("seed_db");
const databaseDownloadDir = "./kpop_db";
let exit = false;

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
            "User-Agent": "PostmanRuntime/7.22.0",
        },
    });

    await fs.promises.writeFile(output, resp.data, { encoding: null });
    logger.info("Downloaded database.zip");
};
function extractDb() {
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
    await db.query(`DROP DATABASE IF EXISTS ${process.env.DB_KPOP_DATA_TABLE_NAME};`);
    logger.info("Creating K-pop video database");
    await db.query(`CREATE DATABASE ${process.env.DB_KPOP_DATA_TABLE_NAME};`);
    logger.info("Seeding K-Pop video database");
    setSqlMode(seedFilePath);
    execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} ${process.env.DB_KPOP_DATA_TABLE_NAME} < ${seedFilePath}`);
    logger.info(`Imported database dump (${seedFile}) successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing`);
    logger.info("Creating K-pop Music Quiz database");
    await db.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_KMQ_SETTINGS_TABLE_NAME}`);
}

async function downloadNewSongs() {
    return new Promise((resolve) => {
        const child = spawn("ts-node", ["src/scripts/download-new-songs"]);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (data) => {
            logger.info(`stdout: ${data}`);
            if (exit) {
                logger.info("Song download ending prematurely...");
                child.kill();
            }
        });

        child.stderr.on("data", (data) => {
            logger.error(`${data}`);
        });

        child.on("close", () => {
            resolve();
        });
    });
}

process.on("SIGINT", () => {
    logger.info("SIGINT received");
    exit = true;
});

(async () => {
    try {
        await fs.promises.mkdir(`${databaseDownloadDir}/sql`, { recursive: true });
        const db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
        });
        await downloadDb();
        await extractDb();
        await seedDb(db);
        await removeRedunantAliases();
        db.destroy();
        logger.info("Downloading new songs");
        await downloadNewSongs();
        logger.info("Re-creating available songs view");
        execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} ${process.env.DB_KPOP_DATA_TABLE_NAME} < ./src/seed/create_available_songs_table.sql`);
    } catch (e) {
        logger.error(`Error: ${e}`);
    }
})();
