import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("game_options")
        .addColumn("last_updated", "datetime")
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("game_options")
        .dropColumn("last_updated")
        .execute();
}
