import { Kysely, sql } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .addColumn("last_game_started_at", "timestamp")
        .execute();

    await db
        .updateTable("player_stats")
        .set({
            last_game_started_at: sql`last_active`,
        })
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .dropColumn("last_game_started_at")
        .execute();
}
