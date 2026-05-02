import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { KmqDB } from "../typings/kmq_db";

/**
 *
 */
export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .addColumn("last_game_started_at", "datetime")
        .execute();

    await db
        .updateTable("player_stats")
        .set({
            last_game_started_at: sql`last_active`,
        })
        .execute();
}

/**
 *
 */
export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .dropColumn("last_game_started_at")
        .execute();
}
