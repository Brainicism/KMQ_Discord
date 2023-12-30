import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .addColumn("last_game_played_errored", "boolean", (col) =>
            col.notNull().defaultTo(false),
        )
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .dropColumn("last_game_played_errored")
        .execute();
}
