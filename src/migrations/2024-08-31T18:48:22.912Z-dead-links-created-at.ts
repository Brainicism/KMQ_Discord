import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { KmqDB } from "../typings/kmq_db";

/**
 *
 */
export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("dead_links")
        .addColumn("created_at", "datetime", (col) =>
            col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .execute();
}

/**
 *
 */
export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema.alterTable("dead_links").dropColumn("created_at").execute();
}
