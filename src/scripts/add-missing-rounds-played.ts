import dbContext from "../database_context";
import { IPCLogger } from "../logger";

const logger = new IPCLogger("add-missing-rounds-played");

async function addMissingEntries(): Promise<void> {
    const missingCount = await dbContext
        .kmq("song_metadata")
        .count("* AS count")
        .where("rounds_played", "=", 0)
        .andWhere("correct_guesses", ">", 0)
        .andWhere("skip_count", ">", 0)
        .first();

    logger.info(`Updating ${missingCount["count"]} entries...`);

    await dbContext
        .kmq("song_metadata")
        .update({
            rounds_played: dbContext.kmq.raw("?? + ??", [
                "correct_guesses",
                "skip_count",
            ]),
        })
        .where("rounds_played", "=", 0);

    logger.info("Updated missing entries.");
}

(async () => {
    if (require.main === module) {
        await addMissingEntries();
        process.exit(0);
    }
})();
