import type { Kysely } from "kysely";

import type { KmqDB } from "../typings/kmq_db";

/**
 *
 */
export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .createTable("news")
        .addColumn("identifier", "varchar(100)", (col) =>
            col.notNull().primaryKey(),
        )
        .addColumn("content", "text", (col) => col.notNull())
        .addColumn("generated_at", "datetime", (col) => col.notNull())
        .execute();
}

/**
 *
 */
export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema.dropTable("news").execute();
}
