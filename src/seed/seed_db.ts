import Axios from "axios";
import fs from "fs";
import { execSync } from "child_process";
import StreamZip from "node-stream-zip";
import { Logger } from "log4js";
import { program } from "commander";
import { config } from "dotenv";
import path from "path";
import _logger from "../logger";
import removeRedunantAliases from "../scripts/remove-redunant-aliases";
import { downloadAndConvertSongs } from "../scripts/download-new-songs";
import { DatabaseContext, getNewConnection } from "../database_context";

config({ path: path.resolve(__dirname, "../../.env") });
const SQL_DUMP_EXPIRY = 10;
const fileUrl = "http://kpop.daisuki.com.br/download.php";
const logger: Logger = _logger("seed_db");
const overridesFilePath = path.join(__dirname, "../../sql/kpop_videos_overrides.sql");

const databaseDownloadDir = path.join(__dirname, "../../kpop_db");
if (!fs.existsSync(databaseDownloadDir)) {
    fs.mkdirSync(databaseDownloadDir);
}

program
    .option("-p, --skip-pull", "Skip re-pull of Daisuki database dump", false)
    .option("-r, --skip-reseed", "Force skip drop/create of kpop_videos database", false)
    .option("-d, --skip-download", "Skip download/encode of videos in database", false)
    .option("--limit <limit>", "Limit the number of songs to download", (x) => parseInt(x));

program.parse();
const options = program.opts();

const downloadDb = async () => {
    const output = `${databaseDownloadDir}/bootstrap.zip`;
    const resp = await Axios.get(fileUrl, {
        responseType: "arraybuffer",
        headers: {
            "User-Agent": "KMQ (K-pop Music Quiz)",
        },
    });

    await fs.promises.writeFile(output, resp.data, { encoding: null });
    logger.info("Downloaded Daisuki database archive");
};
async function extractDb(): Promise<void> {
    await fs.promises.mkdir(`${databaseDownloadDir}/sql`, { recursive: true });
    // eslint-disable-next-line new-cap
    const zip = new StreamZip.async({ file: `${databaseDownloadDir}/bootstrap.zip` });
    await zip.extract(null, `${databaseDownloadDir}/sql/`);
    logger.info("Extracted Daisuki database");
}

async function validateSqlDump(db: DatabaseContext, seedFilePath: string) {
    try {
        await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_validation;");
        await db.agnostic.raw("CREATE DATABASE kpop_videos_validation;");
        await db.kpopVideosValidation.raw(fs.readFileSync(seedFilePath).toString());
        const songCount = (await db.kpopVideosValidation("app_kpop").count("* as count").first()).count;
        const artistCount = (await db.kpopVideosValidation("app_kpop_group").count("* as count").first()).count;
        if (songCount < 1000 || artistCount < 100) {
            throw new Error("SQL dump valid, but potentially missing data.");
        }
        logger.info("SQL dump validated successfully");
    } catch (e) {
        throw new Error(`SQL dump validation failed. ${e.sqlMessage}`);
    } finally {
        await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_validation;");
    }
}

async function seedDb(db: DatabaseContext) {
    const files = await fs.promises.readdir(`${databaseDownloadDir}/sql`);
    const seedFile = files[files.length - 1];
    const seedFilePath = `${databaseDownloadDir}/sql/${seedFile}`;
    logger.info("Validating SQL dump");
    await validateSqlDump(db, seedFilePath);
    logger.info("Dropping K-Pop video database");
    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos;");
    logger.info("Creating K-Pop video database");
    await db.agnostic.raw("CREATE DATABASE kpop_videos;");
    logger.info("Seeding K-Pop video database");
    await db.kpopVideos.raw(fs.readFileSync(seedFilePath).toString());
    logger.info("Performing data overrides");
    await db.kpopVideos.raw(fs.readFileSync(overridesFilePath).toString());
    logger.info(`Imported database dump (${seedFile}) successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function hasRecentDump(): Promise<boolean> {
    const dumpPath = `${databaseDownloadDir}/sql`;
    let files: string[];
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

async function pruneSqlDumps() {
    try {
        execSync(`find ${databaseDownloadDir}/sql -mindepth 1 -mtime +${SQL_DUMP_EXPIRY} -delete`);
        logger.info("Finished pruning old SQL dumps");
    } catch (err) {
        logger.error("Error attempting to prune SQL dumps directory, ", err);
    }
}

async function updateKpopDatabase(db: DatabaseContext) {
    if (!options.skipPull) {
        await downloadDb();
        await extractDb();
    } else {
        logger.info("Skipping Daisuki SQL dump pull...");
    }

    if (!options.skipReseed) {
        await seedDb(db);
    } else {
        logger.info("Skipping reseed");
    }
}

export async function updateGroupList(db: DatabaseContext) {
    const result = await db.kmq("kpop_groups")
        .select(["name", "members as gender"])
        .where("name", "NOT LIKE", "%+%")
        .orderBy("name", "ASC");
    fs.writeFileSync(path.resolve(__dirname, "../../data/group_list.txt"), result.map((x) => x.name).join("\n"));
}

async function seedAndDownloadNewSongs(db: DatabaseContext) {
    pruneSqlDumps();
    try {
        await updateKpopDatabase(db);
    } catch (e) {
        logger.error(`Failed to update kpop_videos database. ${e}`);
        return;
    }

    await updateGroupList(db);
    await removeRedunantAliases(db);
    if (!options.skipDownload) {
        await downloadAndConvertSongs(options.limit);
    }
    logger.info("Finishing seeding and downloading new songs");
}

(async () => {
    if (require.main === module) {
        const db = getNewConnection();
        try {
            await seedAndDownloadNewSongs(db);
        } catch (e) {
            logger.error(e);
        } finally {
            await db.destroy();
        }
    }
})();

// eslint-disable-next-line import/prefer-default-export
export { seedAndDownloadNewSongs, updateKpopDatabase };
