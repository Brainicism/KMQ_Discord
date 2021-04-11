import fs from "fs";
import path from "path";
import { Logger } from "log4js";
import _logger from "../logger";
import { DatabaseContext, getNewConnection } from "../database_context";

const logger: Logger = _logger("remove-redunant-aliases");

export default async function removeRedunantAliases(db: DatabaseContext) {
    const songAliasPath = path.resolve(__dirname, "../../data/song_aliases.json");
    logger.info("Checking for redunant aliases...");
    const songAliases: { [songID: string]: Array<string> } = JSON.parse(fs.readFileSync(songAliasPath).toString());
    let changeCount = 0;
    for (const videoID of Object.keys(songAliases)) {
        const result = await db.kmq("available_songs")
            .select("song_name as name")
            .where("link", "=", videoID)
            .first();

        if (!result) {
            logger.warn(`vid ${videoID}, doesn't exist anymore, check if deletion is applicable...`);
            continue;
        }
        const songName = result.name;
        const aliases = songAliases[videoID];
        if (aliases.includes(songName)) {
            if (aliases.length === 1) {
                logger.info(`vid ${videoID}, song_name '${songName}' no longer has any aliases`);
                changeCount++;
                delete songAliases[videoID];
                continue;
            } else {
                const index = aliases.indexOf(songName);
                songAliases[videoID].splice(index, 1);
                changeCount++;
                logger.info(`vid ${videoID}, song_name '${songName}', alias identical to title removed`);
            }
        }
    }
    if (changeCount) {
        fs.writeFileSync(songAliasPath, JSON.stringify(songAliases, (k, v) => {
            if (v instanceof Array) {
                return JSON.stringify(v);
            }
            return v;
        }, 4)
            .replace(/"\[/g, "[")
            .replace(/\]"/g, "]")
            .replace(/\\"/g, "\"")
            .replace(/""/g, "\""));
        logger.info(`${changeCount} redunant aliases removed.`);
    } else {
        logger.info("No redunant aliases found.");
    }
}

(async () => {
    if (require.main === module) {
        const db = getNewConnection();
        try {
            await removeRedunantAliases(db);
        } finally {
            await db.destroy();
        }
    }
})();
