import fs from "fs";
import path from "path";
import { Logger } from "log4js";
import _logger from "../logger";
import dbContext from "../database_context";

const logger: Logger = _logger("remove-redunant-aliases");

export default async function removeRedunantAliases() {
    const songAliasPath = path.resolve(__dirname, "../../data/song_aliases.json");
    logger.info("Checking for redunant aliases...");
    const songAliases: { [songId: string]: Array<string> } = JSON.parse(fs.readFileSync(songAliasPath).toString());
    let changeCount = 0;
    for (const videoId of Object.keys(songAliases)) {
        const result = await dbContext.kpopVideos("app_kpop")
            .select("nome as name")
            .where("vlink", "=", videoId)
            .first();

        if (!result) {
            logger.warn(`vid ${videoId}, doesn't exist anymore, check if deletion is applicable...`);
            continue;
        }
        const songName = result.name;
        const aliases = songAliases[videoId];
        if (aliases.includes(songName)) {
            if (aliases.length === 1) {
                logger.info(`vid ${videoId}, song_name '${songName}' no longer has any aliases`);
                changeCount++;
                delete songAliases[videoId];
                continue;
            } else {
                const index = aliases.indexOf(songName);
                songAliases[videoId].splice(index, 1);
                changeCount++;
                logger.info(`vid ${videoId}, song_name '${songName}', alias identical to title removed`);
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
        await removeRedunantAliases();
        await dbContext.destroy();
    }
})();
