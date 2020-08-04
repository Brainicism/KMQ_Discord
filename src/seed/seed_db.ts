import * as request from "request-promise";
import * as fs from "fs";
import { execSync } from "child_process";
import * as unzipper from "unzipper";
import * as mysql from "promise-mysql";
import * as _config from "../../config/app_config.json";
import * as prependFile from 'prepend-file';
import _logger from "../logger";
import { Logger } from "log4js";
import { downloadNewSongs } from "../scripts/download-new-songs"
const config: any = _config;
const fileUrl = "http://kpop.aoimirai.net/download.php";
const logger: Logger = _logger("seed_db");




const databaseDownloadDir = "./kpop_db";

const setSqlMode = (sqlFile: string) => {
    prependFile.sync(sqlFile, `SET @@sql_mode="";\n`);
}

const downloadDb = async () => {
    const output = `${databaseDownloadDir}/bootstrap.zip`
    const options = {
        url: fileUrl,
        encoding: null,
        headers: {
            "Host": "kpop.aoimirai.net",
            "User-Agent": "PostmanRuntime/7.22.0"
        }
    }
    const resp = await request(options);
    await fs.promises.writeFile(output, resp);
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
        await db.query("DROP DATABASE IF EXISTS kpop_videos;");
        logger.info("Creating K-pop video database")
        await db.query("CREATE DATABASE kpop_videos;");
        logger.info("Seeding K-Pop video database");
        setSqlMode(seedFilePath);
        execSync(`mysql -u ${config.dbUser} -p${config.dbPassword} kpop_videos < ${seedFilePath}`)
        logger.info(`Imported database dump (${seedFile}) successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing`);
        logger.info("Creating K-pop Music Quiz database");
        await db.query("CREATE DATABASE IF NOT EXISTS kmq");
        resolve();
    })

}
(async () => {
    try {
        await fs.promises.mkdir(`${databaseDownloadDir}/sql`, { recursive: true })
        const db = await mysql.createConnection({
            host: "localhost",
            user: config.dbUser,
            password: config.dbPassword
        });
        await downloadDb();
        await extractDb();
        await seedDb(db);
        db.destroy();
        console.log("Downloading new songs")
        await downloadNewSongs();
    } catch (e) {
        logger.error("Error: " + e);
    }
})();

