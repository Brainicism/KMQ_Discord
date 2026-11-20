import { IPCLogger } from "../../logger";
import { pathExists } from "../../helpers/utils";
import { sql } from "kysely";
import fs from "fs";
import path from "path";
import type { DatabaseContext } from "../../database_context";

const logger = new IPCLogger("seed_phase_transform");

/**
 * Get the current better_audio_link mapping from expected_available_songs.
 * Returns empty map if the table doesn't exist.
 */
async function getBetterAudioMapping(
    db: DatabaseContext,
): Promise<Record<string, string | null>> {
    const betterAudioMappings: Record<string, string | null> = {};
    try {
        const rows = await db.kmq
            .selectFrom("expected_available_songs")
            .select(["better_audio_link", "link"])
            .execute();

        for (const entry of rows) {
            betterAudioMappings[entry.link] = entry.better_audio_link;
        }
    } catch {
        // Table might not exist on first run — that's fine
    }

    return betterAudioMappings;
}

/**
 * Phase 4: Transform — Build expected_available_songs from source data.
 *
 * Calls the idempotent BuildExpectedAvailableSongs stored procedure, which:
 * - Reads from kpop_videos.app_kpop + app_kpop_group (never mutates them)
 * - Computes better_audio_link via JOIN
 * - Applies song name cleaning and artist name dedup in SELECT
 * - Atomically swaps the result into expected_available_songs
 *
 * Also handles better_audio_link change detection: if a better_audio_link
 * changes between the old and new expected_available_songs, the old audio
 * file is deleted so it gets re-downloaded.
 *
 * @param db - The database context
 */
export async function transform(db: DatabaseContext): Promise<void> {
    logger.info("Phase 4: Building expected_available_songs...");

    // Snapshot current better_audio_link mappings before rebuild
    const oldBetterAudioMapping = await getBetterAudioMapping(db);

    // Call the idempotent stored procedure (atomic swap inside)
    await sql.raw("CALL BuildExpectedAvailableSongs();").execute(db.kmq);
    logger.info("BuildExpectedAvailableSongs completed");

    // Detect better_audio_link changes
    const newBetterAudioMapping = await getBetterAudioMapping(db);
    const invalidatedSongsToDelete: Array<string> = [];

    for (const primarySongLink in oldBetterAudioMapping) {
        if (primarySongLink in newBetterAudioMapping) {
            const oldBetterAudioLink = oldBetterAudioMapping[primarySongLink];

            const newBetterAudioLink = newBetterAudioMapping[primarySongLink];

            if (oldBetterAudioLink !== newBetterAudioLink) {
                logger.info(
                    `Better audio link change detected for ${primarySongLink}: ${oldBetterAudioLink} => ${newBetterAudioLink}... scheduling for deletion`,
                );

                invalidatedSongsToDelete.push(primarySongLink);
            }
        }
    }

    if (invalidatedSongsToDelete.length > 100) {
        throw new Error(
            `Number of invalidated better audio links is too high (${invalidatedSongsToDelete.length}), this is unexpected. Please inspect the database state, do not re-seed.`,
        );
    }

    // Delete old audio files for changed better_audio_links
    // eslint-disable-next-line no-await-in-loop
    for (const songToDelete of invalidatedSongsToDelete) {
        logger.info(`Deleting old better audio for ${songToDelete}`);
        const songAudioPath = path.resolve(
            process.env.SONG_DOWNLOAD_DIR!,
            `${songToDelete}.ogg`,
        );

        // eslint-disable-next-line no-await-in-loop
        await db.kmq
            .deleteFrom("cached_song_duration")
            .where("vlink", "=", songToDelete)
            .execute();

        if (await pathExists(songAudioPath)) {
            logger.info(`Deleting old better audio file: ${songAudioPath}`);
            // eslint-disable-next-line no-await-in-loop
            await fs.promises.rename(songAudioPath, `${songAudioPath}.old`);
        }
    }

    logger.info("Phase 4 complete: expected_available_songs rebuilt");
}
