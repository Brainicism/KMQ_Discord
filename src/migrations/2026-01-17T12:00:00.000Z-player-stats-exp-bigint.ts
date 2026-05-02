import type { Kysely } from "kysely";

import type { KmqDB } from "../typings/kmq_db";

/**
 *
 */
export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .modifyColumn("exp", "bigint")
        .execute();
}

/**
 *
 */
export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .modifyColumn("exp", "integer")
        .execute();
}
