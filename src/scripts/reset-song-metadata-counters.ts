import { createInterface } from "readline";
import dbContext from "../database_context";
import { standardDateFormat } from "../helpers/utils";
import backupKmqDatabase from "./backup-kmq-database";
import { IPCLogger } from "../logger";

const logger = new IPCLogger("reset-song-metadata-counters");

async function userConfirm(): Promise<boolean> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(
            "Are you sure you want to reset all song metadata counters to 0? Type 'YES' to continue: ",
            (resp) => {
                rl.close();
                resolve(resp === "YES");
            }
        );
    });
}

async function resetMetadataCounters(): Promise<void> {
    if (!(await userConfirm())) {
        return;
    }

    logger.info("Backing up KMQ database...");
    await backupKmqDatabase(
        `metadata_counters_reset_${standardDateFormat(new Date())}`
    );

    logger.info("Resetting metadata counters...");
    await dbContext.kmq("song_metadata").update({
        correct_guesses: 0,
        skip_count: 0,
        hint_count: 0,
        rounds_played: 0,
    });

    logger.info("Reset metadata counters.");
}

(async () => {
    if (require.main === module) {
        await resetMetadataCounters();
        process.exit(0);
    }
})();
