import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("song_metadata")
        .dropColumn("correct_guesses_legacy")
        .dropColumn("rounds_played_legacy")
        .execute();
}
export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("song_metadata")
        .addColumn("correct_guesses_legacy", "integer")
        .addColumn("rounds_played_legacy", "integer")
        .execute();
}
