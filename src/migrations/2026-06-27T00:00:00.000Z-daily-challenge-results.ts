import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .createTable("daily_challenge_results")
        .addColumn("player_id", "varchar(100)", (col) => col.notNull())
        .addColumn("challenge_date", "date", (col) => col.notNull())
        .addColumn("score", "integer", (col) => col.notNull().defaultTo(0))
        .addColumn("correct_count", "integer", (col) =>
            col.notNull().defaultTo(0),
        )
        .addColumn("total_count", "integer", (col) =>
            col.notNull().defaultTo(0),
        )
        .addColumn("best_streak", "integer", (col) =>
            col.notNull().defaultTo(0),
        )
        .addColumn("completed_at", "datetime", (col) => col.notNull())
        // One result per player per day enforces single-play-per-day.
        .addUniqueConstraint("daily_challenge_results_player_date", [
            "player_id",
            "challenge_date",
        ])
        .execute();

    // Leaderboard reads filter by date and order by score — index the date.
    await db.schema
        .createIndex("daily_challenge_results_date_score")
        .on("daily_challenge_results")
        .columns(["challenge_date", "score"])
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema.dropTable("daily_challenge_results").execute();
}
