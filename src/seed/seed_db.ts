import Axios from "axios";
import fs from "fs";
import { execSync } from "child_process";
import { Logger } from "log4js";
import { program } from "commander";
import { config } from "dotenv";
import path from "path";
import _logger from "../logger";
import { downloadAndConvertSongs } from "../scripts/download-new-songs";
import { DatabaseContext, getNewConnection } from "../database_context";
import { generateKmqDataTables } from "./bootstrap";
import { EnvType } from "../types";

config({ path: path.resolve(__dirname, "../../.env") });
const SQL_DUMP_EXPIRY = 10;
const mvFileUrl = "http://kpop.daisuki.com.br/download.php?file=full";
const audioFileUrl = "http://kpop.daisuki.com.br/download.php?file=audio";
const DEFAULT_AUDIO_ONLY_SONGS_PER_ARTIST = 10;
const logger: Logger = _logger("seed_db");
const databaseDownloadDir = path.join(__dirname, "../../sql_dumps/daisuki");
if (!fs.existsSync(databaseDownloadDir)) {
    fs.mkdirSync(databaseDownloadDir);
}

program
    .option("-p, --skip-pull", "Skip re-pull of Daisuki database dump", false)
    .option("-r, --skip-reseed", "Force skip drop/create of kpop_videos database", false)
    .option("-d, --skip-download", "Skip download/encode of videos in database", false)
    .option("--limit <limit>", "Limit the number of songs to download", (x) => parseInt(x))
    .option("--audio-songs-per-artist <songs>", "Maximum number of audio-only songs to download for each artist", (x) => parseInt(x), DEFAULT_AUDIO_ONLY_SONGS_PER_ARTIST);

program.parse();
const options = program.opts();

const downloadDb = async () => {
    const mvOutput = `${databaseDownloadDir}/mv-download.zip`;
    const audioOutput = `${databaseDownloadDir}/audio-download.zip`;
    const mvResp = await Axios.get(mvFileUrl, {
        responseType: "arraybuffer",
        headers: {
            "User-Agent": "KMQ (K-pop Music Quiz)",
        },
    });

    const audioResp = await Axios.get(audioFileUrl, {
        responseType: "arraybuffer",
        headers: {
            "User-Agent": "KMQ (K-pop Music Quiz)",
        },
    });

    await fs.promises.writeFile(mvOutput, mvResp.data, { encoding: null });
    await fs.promises.writeFile(audioOutput, audioResp.data, { encoding: null });
    logger.info("Downloaded Daisuki database archive");
};
async function extractDb(): Promise<void> {
    await fs.promises.mkdir(`${databaseDownloadDir}/`, { recursive: true });
    execSync(`unzip -oq ${databaseDownloadDir}/mv-download.zip -d ${databaseDownloadDir}/`);
    execSync(`unzip -oq ${databaseDownloadDir}/audio-download.zip -d ${databaseDownloadDir}/`);
    logger.info("Extracted Daisuki database");
}

async function validateSqlDump(db: DatabaseContext, mvSeedFilePath: string, audioSeedFilePath: string, bootstrap = false) {
    try {
        await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_validation;");
        await db.agnostic.raw("CREATE DATABASE kpop_videos_validation;");
        execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${mvSeedFilePath}`);
        execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${audioSeedFilePath}`);
        logger.info("Validating MV song count");
        const mvSongCount = (await db.kpopVideosValidation("app_kpop").count("* as count").first()).count;
        logger.info("Validating audio-only song count");
        const audioSongCount = (await db.kpopVideosValidation("app_kpop_audio").count("* as count").first()).count;
        logger.info("Validating group count");
        const artistCount = (await db.kpopVideosValidation("app_kpop_group").count("* as count").first()).count;
        if (mvSongCount < 10000 || audioSongCount < 1000 || artistCount < 1000) {
            throw new Error("SQL dump valid, but potentially missing data.");
        }
        if (!bootstrap) {
            logger.info("Validating creation of data tables");
            const originalCreateKmqTablesProcedureSqlPath = path.join(__dirname, "../../sql/procedures/create_kmq_data_tables_procedure.sql");
            const validationCreateKmqTablesProcedureSqlPath = path.join(__dirname, "../../sql/create_kmq_data_tables_procedure.validation.sql");
            execSync(`sed 's/kpop_videos/kpop_videos_validation/g' ${originalCreateKmqTablesProcedureSqlPath} > ${validationCreateKmqTablesProcedureSqlPath}`);
            execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${validationCreateKmqTablesProcedureSqlPath}`);
            await db.kpopVideosValidation.raw("CALL CreateKmqDataTables;");
        }
        logger.info("SQL dump validated successfully");
    } catch (e) {
        throw new Error(`SQL dump validation failed. ${e.sqlMessage}`);
    } finally {
        await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_validation;");
    }
}

async function seedDb(db: DatabaseContext, bootstrap: boolean) {
    const sqlFiles = (await fs.promises.readdir(`${databaseDownloadDir}`)).filter((x) => x.endsWith(".sql"));
    const mvSeedFile = sqlFiles.filter((x) => x.endsWith(".sql") && x.startsWith("mainbackup_")).slice(-1)[0];
    const audioSeedFile = sqlFiles.filter((x) => x.endsWith(".sql") && x.startsWith("audiobackup_")).slice(-1)[0];
    const mvSeedFilePath = bootstrap ? `${databaseDownloadDir}/bootstrap.sql` : `${databaseDownloadDir}/${mvSeedFile}`;
    const audioSeedFilePath = bootstrap ? `${databaseDownloadDir}/bootstrap-audio.sql` : `${databaseDownloadDir}/${audioSeedFile}`;
    logger.info(`Validating SQL dump (${path.basename(mvSeedFilePath)} and ${path.basename(audioSeedFilePath)})`);
    await validateSqlDump(db, mvSeedFilePath, audioSeedFilePath, bootstrap);
    logger.info("Dropping K-Pop video database");
    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos;");
    logger.info("Creating K-Pop video database");
    await db.agnostic.raw("CREATE DATABASE kpop_videos;");
    logger.info("Seeding K-Pop video database");
    execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos < ${mvSeedFilePath}`);
    execSync(`mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos < ${audioSeedFilePath}`);
    logger.info("Imported database dump successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing");
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
    const seedFileDateString = files[files.length - 1].match(/mainbackup_([0-9]{4}-[0-9]{2}-[0-9]{2}).sql/)[1];
    logger.info(`Most recent seed file has date: ${seedFileDateString}`);
    const daysDiff = ((new Date()).getTime() - Date.parse(seedFileDateString)) / 86400000;
    return daysDiff < 6;
}

async function pruneSqlDumps() {
    try {
        execSync(`find ${databaseDownloadDir} -mindepth 1 -name "*backup_*" -mtime +${SQL_DUMP_EXPIRY} -delete`);
        logger.info("Finished pruning old SQL dumps");
    } catch (err) {
        logger.error("Error attempting to prune SQL dumps directory, ", err);
    }
}

async function updateKpopDatabase(db: DatabaseContext, bootstrap = false) {
    if (!options.skipPull && !bootstrap) {
        await downloadDb();
        await extractDb();
    } else {
        logger.info("Skipping Daisuki SQL dump pull...");
    }

    if (!options.skipReseed) {
        await seedDb(db, bootstrap);
    } else {
        logger.info("Skipping reseed");
    }
}

export async function updateGroupList(db: DatabaseContext) {
    const result = await db.kmq("kpop_groups")
        .select(["name", "members as gender"])
        .where("is_collab", "=", "n")
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

    let songsDownloaded = 0;
    if (!options.skipDownload) {
        songsDownloaded = await downloadAndConvertSongs(options.audioSongsPerArtist, options.limit);
    }

    if (songsDownloaded) {
        await generateKmqDataTables(db);
    }

    await db.kmq.raw("CALL OverridePublishDates();");
    if (process.env.NODE_ENV === EnvType.PROD) {
        await updateGroupList(db);
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
            process.exit(1);
        } finally {
            await db.destroy();
        }
    }
})();

// eslint-disable-next-line import/prefer-default-export
export { seedAndDownloadNewSongs, updateKpopDatabase };
