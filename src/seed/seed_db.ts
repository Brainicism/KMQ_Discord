import { DATABASE_DOWNLOAD_DIR } from "../constants";
import { IPCLogger } from "../logger";
import { config } from "dotenv";
import { downloadAndConvertSongs } from "../scripts/download-new-songs";
import { execSync } from "child_process";
import { getNewConnection } from "../database_context";
import { parseJsonFile } from "../helpers/utils";
import { program } from "commander";
import Axios from "axios";
import EnvType from "../enums/env_type";
import _ from "lodash";
import fs from "fs";
import path from "path";
import type { DatabaseContext } from "../database_context";

config({ path: path.resolve(__dirname, "../../.env") });
const SQL_DUMP_EXPIRY = 10;
const mvFileUrl = "http://kpop.daisuki.com.br/download.php?file=full";
const audioFileUrl = "http://kpop.daisuki.com.br/download.php?file=audio";
const frozenDaisukiColumnNamesPath = path.join(
    __dirname,
    "../../data/frozen_table_schema.json"
);

const logger = new IPCLogger("seed_db");

if (!fs.existsSync(DATABASE_DOWNLOAD_DIR)) {
    fs.mkdirSync(DATABASE_DOWNLOAD_DIR);
}

program
    .option("-p, --skip-pull", "Skip re-pull of Daisuki database dump", false)
    .option(
        "-r, --skip-reseed",
        "Force skip drop/create of kpop_videos database",
        false
    )
    .option(
        "-d, --skip-download",
        "Skip download/encode of videos in database",
        false
    )
    .option("--limit <limit>", "Limit the number of songs to download", (x) =>
        parseInt(x, 10)
    );

program.parse();
const options = program.opts();

async function getOverrideQueries(db: DatabaseContext): Promise<Array<string>> {
    return (await db.kmq("kpop_videos_sql_overrides").select(["query"])).map(
        (x) => x.query
    );
}

// eslint-disable-next-line import/prefer-default-export
/**
 * Re-creates the KMQ data tables
 * @param db - The database context
 */
export async function generateKmqDataTables(
    db: DatabaseContext
): Promise<void> {
    logger.info("Re-creating KMQ data tables view...");
    await db.kmq.raw(
        `CALL CreateKmqDataTables(${process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST});`
    );
}

/**
 * Reloads all existing stored procedures
 */
export function loadStoredProcedures(): void {
    const storedProcedureDefinitions = fs
        .readdirSync(path.join(__dirname, "../../sql/procedures"))
        .map((x) => path.join(__dirname, "../../sql/procedures", x));

    for (const storedProcedureDefinition of storedProcedureDefinitions) {
        execSync(
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq < ${storedProcedureDefinition}`
        );
    }
}

const downloadDb = async (): Promise<void> => {
    const mvOutput = `${DATABASE_DOWNLOAD_DIR}/mv-download.zip`;
    const audioOutput = `${DATABASE_DOWNLOAD_DIR}/audio-download.zip`;
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
    await fs.promises.writeFile(audioOutput, audioResp.data, {
        encoding: null,
    });
    logger.info("Downloaded Daisuki database archive");
};

async function extractDb(): Promise<void> {
    await fs.promises.mkdir(`${DATABASE_DOWNLOAD_DIR}/`, { recursive: true });
    execSync(
        `unzip -oq ${DATABASE_DOWNLOAD_DIR}/mv-download.zip -d ${DATABASE_DOWNLOAD_DIR}/`
    );

    execSync(
        `unzip -oq ${DATABASE_DOWNLOAD_DIR}/audio-download.zip -d ${DATABASE_DOWNLOAD_DIR}/`
    );
    logger.info("Extracted Daisuki database");
}

async function recordDaisukiTableSchema(db: DatabaseContext): Promise<void> {
    const frozenTableColumnNames = {};
    for (const table of ["app_kpop", "app_kpop_audio", "app_kpop_group"]) {
        const commaSeparatedColumnNames = (
            await db.agnostic.raw(
                `SELECT group_concat(COLUMN_NAME) as x FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'kpop_videos' AND TABLE_NAME = '${table}';`
            )
        )[0][0]["x"];

        const columnNames = _.sortBy(commaSeparatedColumnNames.split(","));
        frozenTableColumnNames[table] = columnNames;
    }

    fs.writeFileSync(
        frozenDaisukiColumnNamesPath,
        JSON.stringify(frozenTableColumnNames)
    );
}

async function validateDaisukiTableSchema(
    db: DatabaseContext,
    frozenSchema: any
): Promise<void> {
    const outputMessages = [];
    for (const table of ["app_kpop", "app_kpop_audio", "app_kpop_group"]) {
        const commaSeparatedColumnNames = (
            await db.agnostic.raw(
                `SELECT group_concat(COLUMN_NAME) as x FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'kpop_videos_validation' AND TABLE_NAME = '${table}';`
            )
        )[0][0]["x"];

        const columnNames = _.sortBy(commaSeparatedColumnNames.split(","));
        if (!_.isEqual(frozenSchema[table], columnNames)) {
            const removedColumns = _.difference(
                columnNames,
                frozenSchema[table]
            );

            const addedColumns = _.difference(frozenSchema[table], columnNames);
            if (removedColumns.length > 0) {
                outputMessages.push(
                    `__${table}__\nAdded columns: ${JSON.stringify(
                        addedColumns
                    )}.\nRemoved Columns: ${JSON.stringify(removedColumns)}\n`
                );
            }
        }
    }

    if (outputMessages.length > 0) {
        outputMessages.unshift("Daisuki schema has changed.");
        outputMessages.push(
            "If the Daisuki schema change is acceptable, delete frozen schema file and re-run this script"
        );
        throw new Error(outputMessages.join("\n"));
    }
}

async function validateSqlDump(
    db: DatabaseContext,
    mvSeedFilePath: string,
    audioSeedFilePath: string,
    bootstrap = false
): Promise<void> {
    try {
        await db.agnostic.raw(
            "DROP DATABASE IF EXISTS kpop_videos_validation;"
        );
        await db.agnostic.raw("CREATE DATABASE kpop_videos_validation;");
        execSync(
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${mvSeedFilePath}`
        );

        execSync(
            `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${audioSeedFilePath}`
        );
        logger.info("Validating MV song count");
        const mvSongCount = (
            await db
                .kpopVideosValidation("app_kpop")
                .count("* as count")
                .first()
        ).count;

        logger.info("Validating audio-only song count");
        const audioSongCount = (
            await db
                .kpopVideosValidation("app_kpop_audio")
                .count("* as count")
                .first()
        ).count;

        logger.info("Validating group count");
        const artistCount = (
            await db
                .kpopVideosValidation("app_kpop_group")
                .count("* as count")
                .first()
        ).count;

        if (
            mvSongCount < 10000 ||
            audioSongCount < 1000 ||
            artistCount < 1000
        ) {
            throw new Error("SQL dump valid, but potentially missing data.");
        }

        logger.info("Validating overrides");
        const overrideQueries = await getOverrideQueries(db);

        for (const overrideQuery of overrideQueries) {
            await db.kpopVideosValidation.raw(overrideQuery);
        }

        if (!bootstrap) {
            logger.info("Validating creation of data tables");
            const originalCreateKmqTablesProcedureSqlPath = path.join(
                __dirname,
                "../../sql/procedures/create_kmq_data_tables_procedure.sql"
            );

            const validationCreateKmqTablesProcedureSqlPath = path.join(
                __dirname,
                "../../sql/create_kmq_data_tables_procedure.validation.sql"
            );

            execSync(
                `sed 's/kpop_videos/kpop_videos_validation/g' ${originalCreateKmqTablesProcedureSqlPath} > ${validationCreateKmqTablesProcedureSqlPath}`
            );

            execSync(
                `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos_validation < ${validationCreateKmqTablesProcedureSqlPath}`
            );

            await db.kpopVideosValidation.raw(
                `CALL CreateKmqDataTables(${process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST});`
            );
        }
    } catch (e) {
        throw new Error(`SQL dump validation failed. ${e.sqlMessage}`);
    }

    if (fs.existsSync(frozenDaisukiColumnNamesPath)) {
        logger.info("Daisuki schema exists... checking for changes");
        const frozenSchema = parseJsonFile(frozenDaisukiColumnNamesPath);
        await validateDaisukiTableSchema(db, frozenSchema);
    }

    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos_validation;");
    logger.info("SQL dump validated successfully");
}

async function seedDb(db: DatabaseContext, bootstrap: boolean): Promise<void> {
    const sqlFiles = (
        await fs.promises.readdir(`${DATABASE_DOWNLOAD_DIR}`)
    ).filter((x) => x.endsWith(".sql"));

    const mvSeedFile = sqlFiles
        .filter((x) => x.endsWith(".sql") && x.startsWith("mainbackup_"))
        .slice(-1)[0];

    const audioSeedFile = sqlFiles
        .filter((x) => x.endsWith(".sql") && x.startsWith("audiobackup_"))
        .slice(-1)[0];

    const mvSeedFilePath = bootstrap
        ? `${DATABASE_DOWNLOAD_DIR}/bootstrap.sql`
        : `${DATABASE_DOWNLOAD_DIR}/${mvSeedFile}`;

    const audioSeedFilePath = bootstrap
        ? `${DATABASE_DOWNLOAD_DIR}/bootstrap-audio.sql`
        : `${DATABASE_DOWNLOAD_DIR}/${audioSeedFile}`;

    logger.info(
        `Validating SQL dump (${path.basename(
            mvSeedFilePath
        )} and ${path.basename(audioSeedFilePath)})`
    );
    await validateSqlDump(db, mvSeedFilePath, audioSeedFilePath, bootstrap);
    logger.info("Dropping K-Pop video database");
    await db.agnostic.raw("DROP DATABASE IF EXISTS kpop_videos;");
    logger.info("Creating K-Pop video database");
    await db.agnostic.raw("CREATE DATABASE kpop_videos;");
    logger.info("Seeding K-Pop video database");
    execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos < ${mvSeedFilePath}`
    );

    execSync(
        `mysql -u ${process.env.DB_USER} -p${process.env.DB_PASS} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kpop_videos < ${audioSeedFilePath}`
    );

    if (!fs.existsSync(frozenDaisukiColumnNamesPath)) {
        logger.info("Frozen Daisuki schema doesn't exist... creating");
        await recordDaisukiTableSchema(db);
    }

    logger.info("Performing data overrides");

    const overrideQueries = await getOverrideQueries(db);
    for (const overrideQuery of overrideQueries) {
        await db.kpopVideos.raw(overrideQuery);
    }

    logger.info(
        "Imported database dump successfully. Make sure to run 'get-unclean-song-names' to check for new songs that may need aliasing"
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function hasRecentDump(): Promise<boolean> {
    const dumpPath = `${DATABASE_DOWNLOAD_DIR}/sql`;
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
    const seedFileDateString = files[files.length - 1].match(
        /mainbackup_([0-9]{4}-[0-9]{2}-[0-9]{2}).sql/
    )[1];

    logger.info(`Most recent seed file has date: ${seedFileDateString}`);
    const daysDiff =
        (new Date().getTime() - Date.parse(seedFileDateString)) / 86400000;

    return daysDiff < 6;
}

function pruneSqlDumps(): void {
    try {
        execSync(
            `find ${DATABASE_DOWNLOAD_DIR} -mindepth 1 -name "*backup_*" -mtime +${SQL_DUMP_EXPIRY} -delete`
        );
        logger.info("Finished pruning old SQL dumps");
    } catch (err) {
        logger.error(`Error attempting to prune SQL dumps directory, ${err}`);
    }
}

/**
 * @param db - The database context
 * @param bootstrap - Whether or not this is a bootstrap run
 */
async function updateKpopDatabase(
    db: DatabaseContext,
    bootstrap = false
): Promise<void> {
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

/**
 * Regenerates the available group list
 * @param db - Database context
 */
export async function updateGroupList(db: DatabaseContext): Promise<void> {
    const result = await db
        .kpopVideos("app_kpop_group")
        .select(["name", "members as gender"])
        .where("is_collab", "=", "n")
        .orderBy("name", "ASC");

    fs.writeFileSync(
        path.resolve(__dirname, "../../data/group_list.txt"),
        result.map((x) => x.name).join("\n")
    );
}

/**
 * @param db - The database context
 */
async function seedAndDownloadNewSongs(db: DatabaseContext): Promise<void> {
    pruneSqlDumps();
    try {
        await updateKpopDatabase(db);
    } catch (e) {
        logger.error(`Failed to update kpop_videos database. ${e}`);
        throw e;
    }

    let songsDownloaded = 0;
    if (!options.skipDownload) {
        songsDownloaded = await downloadAndConvertSongs(options.limit);
    }

    await generateKmqDataTables(db);
    if (process.env.NODE_ENV === EnvType.PROD) {
        await updateGroupList(db);
    }

    logger.info(
        `Finishing seeding and downloading ${songsDownloaded} new songs`
    );
}

(async () => {
    if (require.main === module) {
        const db = getNewConnection();
        try {
            loadStoredProcedures();
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
