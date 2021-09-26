// required between 20210925060749_badges_refactor.js and 20210926083508_badges_migrate_table.js
import dbContext from "../database_context";
import { IPCLogger } from "../logger";

const logger = new IPCLogger("convert-badges");

(async () => {
    try {
        const badges = (await dbContext.kmq("badges_players")
            .distinct("badge_name"))
            .map((x) => x["badge_name"]);

        await dbContext.kmq("badges").delete();

        const badgesInsert = badges.map((badge, i) => ({
            id: i,
            name: badge,
            priority: 1,
        }));

        await dbContext.kmq("badges")
            .insert(badgesInsert);
        logger.info(`Converted ${badgesInsert.length} badges from 'badges_players' to 'badges'`);
    } catch (e) {
        logger.error(`Error converting badges: ${e}`);
    } finally {
        await dbContext.destroy();
    }
})();
