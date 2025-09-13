/* eslint-disable node/no-sync */
import { Command } from "@commander-js/extra-typings";
import { IPCLogger } from "../logger.js";
import { config } from "dotenv";
import { getNewConnection } from "../database_context.js";
import _ from "lodash";
import fs from "fs";
import path from "path";

const logger = new IPCLogger("remove-dangling-songs");

config({ path: path.resolve(import.meta.dirname, "../../.env") });

const program = new Command().option("--delete", "Delete the songs");
program.parse();

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    const options = program.opts();
    const db = getNewConnection();
    const availableSongs = (
        await db.kmq.selectFrom("available_songs").select("link").execute()
    ).map((x) => x["link"]);

    const downloadedSongs = (
        await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR as string)
    )
        .filter((x) => x.endsWith(".ogg"))
        .map((x) => x.replace(".ogg", ""));

    const danglingSongs = _.difference(downloadedSongs, availableSongs).map(
        (x) => path.join(process.env.SONG_DOWNLOAD_DIR as string, `${x}.ogg`),
    );

    let totalSize = 0;
    for (const danglingSong of danglingSongs) {
        totalSize += fs.statSync(danglingSong).size;
    }

    await db.destroy();

    const shouldDelete = options.delete;
    if (!shouldDelete) {
        logger.info(
            `${danglingSongs.length} songs (${(
                totalSize /
                (1024 * 1024)
            ).toFixed(2)} MB) to be deleted. Re-run with --delete to remove.`,
        );
        return;
    }

    await Promise.all(danglingSongs.map((song) => fs.promises.unlink(song)));
    logger.info(
        `${danglingSongs.length} songs (${(totalSize / (1024 * 1024)).toFixed(
            2,
        )} MB) removed`,
    );
})();
