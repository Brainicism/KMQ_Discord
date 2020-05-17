const request = require("request-promise");
const fs = require("fs");
const mkdirp = require("mkdirp");
const { execSync } = require("child_process");
const unzipper = require("unzipper")
const mysql = require("promise-mysql");
const config = require("../app_config.json");
const rmfr = require('rmfr');
const fileUrl = "http://kpop.aoimirai.net/download.php";
const logger = require("../logger")("seed_db");
const prependFile = require('prepend-file');

//TODO: this is probably not how you use promises fix later

let options = {
    url: fileUrl,
    encoding: null,
    headers: {
        "Host": "kpop.aoimirai.net",
        "User-Agent": "PostmanRuntime/7.22.0"
    }
}
const kmqTempDir = "/tmp/kmq";

let setSqlMode = (sqlFile) => {
    prependFile.sync(sqlFile, `SET @@sql_mode="";\n`);
}

let main = async function () {
    await rmfr(kmqTempDir);
    await mkdirp(kmqTempDir);
    await mkdirp(`${kmqTempDir}/sql`)
    const output = `${kmqTempDir}/bootstrap.zip`
    db = await mysql.createConnection({
        host: "localhost",
        user: config.dbUser,
        password: config.dbPassword
    });

    request(options)
        .then((resp, body) => {
            return new Promise((resolve, reject) => {
                fs.writeFile(output, resp, function (err) {
                    logger.info("Downloaded database.zip");
                    resolve();
                });
            })
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                fs.createReadStream(`${kmqTempDir}/bootstrap.zip`)
                    .pipe(unzipper.Extract({ path: `${kmqTempDir}/sql/` }))
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
        })
        .then(async () => {
            return new Promise((resolve, reject) => {
                fs.readdir(`${kmqTempDir}/sql`, async (err, files) => {
                    let seedFile = `${kmqTempDir}/sql/${files[0]}`;
                    logger.info("Dropping K-Pop video database");
                    await db.query("DROP DATABASE IF EXISTS kpop_videos;");
                    logger.info("Creating K-pop video database")
                    await db.query("CREATE DATABASE kpop_videos;");
                    logger.info("Seeding K-Pop video database");
                    setSqlMode(seedFile);
                    execSync(`mysql kpop_videos < ${seedFile}`)
                    logger.info(`Imported database dump (${files[0]}) successfully`);
                    logger.info("Creating K-pop Music Quiz database");
                    await db.query("CREATE DATABASE IF NOT EXISTS kmq");
                    //this is awful but idk why it won't end
                    process.exit();
                })
            })
        })
        .catch(e => logger.info(e))
};

main()
