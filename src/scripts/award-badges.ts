import { IPCLogger } from "../logger.js";
import { createInterface } from "readline";
import dbContext from "../database_context.js";

const logger = new IPCLogger("award-badges");

async function getObjects(): Promise<[{ id: string }]> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        logger.info(
            "Enter a stringified JSON array of objects where each object has an 'id' and 'name' property, then Ctrl-d:",
        );
        rl.prompt();
        let jsonInput = "";
        rl.on("line", (line) => {
            jsonInput += line;
        }).on("close", () => {
            let badgesObj: [{ id: string }];
            try {
                badgesObj = JSON.parse(jsonInput);
                resolve(badgesObj);
            } catch (err) {
                logger.error(`Error parsing array of object, err: ${err}`);
                reject(err);
            }
        });
    });
}

async function getBadgeID(): Promise<number> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question("Enter badge ID: ", (badgeName) => {
            rl.close();
            resolve(parseInt(badgeName, 10));
        });
    });
}

async function awardBadges(): Promise<void> {
    const badgesObj = await getObjects();
    const badgeID = await getBadgeID();

    const badge = await dbContext.kmq
        .selectFrom("badges")
        .select("name")
        .where("id", "=", badgeID)
        .executeTakeFirst();

    if (!badge) {
        logger.error(`Badge ID ${badgeID} doesn't exist`);
        return;
    }

    const badgeName = badge["name"];
    logger.info(`Attempting to add badge: '${badgeName}'`);

    const playerIDsWithBadgeAlready = new Set(
        (
            await dbContext.kmq
                .selectFrom("badges_players")
                .select("user_id")
                .where("badge_id", "=", badgeID)
                .execute()
        ).map((x) => x["user_id"]),
    );

    const playerNamesWithBadgeAlready = badgesObj
        .filter((player) => playerIDsWithBadgeAlready.has(player.id))
        .map((player) => player.id);

    if (playerNamesWithBadgeAlready.length > 0) {
        logger.info(
            `Players ${playerNamesWithBadgeAlready.join(
                ", ",
            )} already have the badge.`,
        );
    }

    if (badgesObj.every((x) => playerIDsWithBadgeAlready.has(x.id))) {
        logger.info("All players already have this badge.");
        return;
    }

    const playersToGiveBadge = badgesObj
        .filter((player) => !playerIDsWithBadgeAlready.has(player.id))
        .map((player) => ({ user_id: player.id, badge_id: badgeID }));

    await dbContext.kmq.transaction().execute(async (trx) => {
        await trx
            .insertInto("badges_players")
            .values(playersToGiveBadge)
            .execute();
    });

    logger.info(
        `Awarded badge '${badgeName}' to ${playersToGiveBadge.length} players.`,
    );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    if (import.meta.main) {
        await awardBadges();
        process.exit(0);
    }
})();
