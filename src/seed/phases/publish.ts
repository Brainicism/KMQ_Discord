import { IPCLogger } from "../../logger";
import { sql } from "kysely";
import type { DatabaseContext } from "../../database_context";

const logger = new IPCLogger("seed_phase_publish");

/**
 * Phase 6: Publish — Build available_songs and app_kpop_group_safe.
 *
 * Calls the idempotent BuildAvailableSongs stored procedure, which:
 * - Builds available_songs from expected_available_songs filtered by
 *   cached_song_duration (downloaded), not_downloaded, and dead_links
 * - Builds app_kpop_group_safe with has_songs flag
 * - Both use atomic RENAME swaps
 *
 * @param db - The database context
 */
export async function publish(db: DatabaseContext): Promise<void> {
    logger.info("Phase 6: Building available_songs...");
    await sql.raw("CALL BuildAvailableSongs();").execute(db.kmq);
    logger.info(
        "Phase 6 complete: available_songs and app_kpop_group_safe rebuilt",
    );
}
