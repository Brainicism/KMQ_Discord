import { Kysely, sql } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .createTable("web_sessions")
        .addColumn("token_hash", "char(64)", (col) => col.primaryKey())
        .addColumn("user_id", "varchar(255)", (col) => col.notNull())
        .addColumn("username", "varchar(255)", (col) => col.notNull())
        .addColumn("avatar_url", "varchar(512)")
        .addColumn("locale", "varchar(16)", (col) =>
            col.notNull().defaultTo(""),
        )
        .addColumn("created_at", "datetime", (col) =>
            col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("expires_at", "datetime", (col) => col.notNull())
        .addColumn("last_used_at", "datetime", (col) =>
            col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .execute();

    await db.schema
        .createIndex("web_sessions_user_id")
        .on("web_sessions")
        .column("user_id")
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema.dropTable("web_sessions").execute();
}
