import type { Kysely } from "kysely";

import type { KmqDB } from "../typings/kmq_db";

/**
 *
 */
export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .addColumn("rank_ineligible", "boolean", (col) =>
            col.notNull().defaultTo(false),
        )
        .execute();
}

/**
 *
 */
export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .dropColumn("rank_ineligible")
        .execute();
}
