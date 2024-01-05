import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .createTable("news_subscriptions")
        .addColumn("guild_id", "varchar(100)", (col) => col.notNull())
        .addColumn("range", "varchar(100)", (col) => col.notNull())
        .addColumn("text_channel_id", "varchar(100)", (col) => col.notNull())
        .addColumn("created_at", "timestamp", (col) => col.notNull())
        .addPrimaryKeyConstraint("pk_news_subscriptions", ["guild_id", "range"])
        .addUniqueConstraint("single_subscription_range_per_guild", [
            "guild_id",
            "range",
        ])
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema.dropTable("news_subscriptions").execute();
}
