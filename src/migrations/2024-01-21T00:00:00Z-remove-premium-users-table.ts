import { Kysely, sql } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema.dropTable("premium_users").execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .createTable("premium_users")
        .addColumn("user_id", "varchar(255)", (col) => col.primaryKey())
        .addColumn("active", sql`tinyint(1)`, (col) => col.notNull())
        .addColumn("first_subscribed", "datetime", (col) => col.notNull())
        .addColumn("source", sql`enum('patreon', 'loyalty')`, (col) =>
            col.notNull(),
        )
        .execute();
}
