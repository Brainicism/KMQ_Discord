import { createInterface } from "readline";
import dbContext from "../database_context";
import { IPCLogger } from "../logger";

const logger = new IPCLogger("award-badges");

async function getObjects(): Promise<[{ id: string }]> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        logger.info("Enter a stringified JSON array of objects where each object has an \"id\" and \"name\" property, then Ctrl-d:");
        rl.prompt();
        let jsonInput = "";
        rl.on("line", (line) => {
            jsonInput += line;
        }).on("close", () => {
            let badgesObj: [{ id: string }];
            try {
                badgesObj = JSON.parse(jsonInput);
            } catch (err) {
                logger.error(`Error parsing array of object, err: ${err}`);
                reject(err);
            }

            resolve(badgesObj);
        });
    });
}

async function getBadgeName(): Promise<string> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question("Enter badge name: ", (badgeName) => {
            rl.close();
            resolve(badgeName);
        });
    });
}

async function awardBadges() {
    const badgesObj = await getObjects();
    const badgeName = await getBadgeName();

    const playerIDsWithBadgeAlready = new Set((await dbContext.kmq("badges")
        .select("user_id")
        .where("badge_name", "=", badgeName))
        .map((x) => x["user_id"]));

    const playerNamesWithBadgeAlready = badgesObj
        .filter((player) => playerIDsWithBadgeAlready.has(player.id))
        .map((player) => player.id);

    if (playerNamesWithBadgeAlready.length > 0) {
        logger.info(`Players ${playerNamesWithBadgeAlready.join(", ")} already have the badge.`);
    }

    if (badgesObj.every((x) => playerIDsWithBadgeAlready.has(x.id))) {
        logger.info("All players already have this badge.");
        return;
    }

    const playersToGiveBadge = badgesObj
        .filter((player) => !playerIDsWithBadgeAlready.has(player.id))
        .map((player) => ({ user_id: player.id, badge_name: badgeName }));

    await dbContext.kmq.transaction(async (tx) => {
        await dbContext.kmq("badges")
            .insert(playersToGiveBadge)
            .transacting(tx);
    });
    logger.info(`Awarded badge ${badgeName} to ${playersToGiveBadge.length} players.`);
}

(async () => {
    if (require.main === module) {
        await awardBadges();
        process.exit(0);
    }
})();
