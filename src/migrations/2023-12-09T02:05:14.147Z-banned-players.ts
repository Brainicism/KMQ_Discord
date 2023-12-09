import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .createTable("banned_players")
        .addColumn("id", "varchar(100)", (col) => col.notNull().primaryKey())
        .addColumn("created_at", "timestamp", (col) => col.notNull())
        .addColumn("reason", "varchar(100)", (col) => col.notNull())
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema.dropTable("banned_players").execute();
}
