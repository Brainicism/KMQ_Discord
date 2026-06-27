import { AUTOMATIC_ACHIEVEMENTS } from "../structures/achievements";
import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("player_stats")
        .addColumn("current_play_streak", "integer", (col) =>
            col.notNull().defaultTo(0),
        )
        .addColumn("longest_play_streak", "integer", (col) =>
            col.notNull().defaultTo(0),
        )
        .addColumn("last_streak_date", "date")
        .execute();

    // Seed the badge rows backing the automatic achievements. Fixed ids (1000+)
    // keep them clear of the low, manually-assigned ids used by existing badges.
    await db
        .insertInto("badges")
        .values(
            AUTOMATIC_ACHIEVEMENTS.map((a) => ({
                id: a.badgeId,
                name: a.name,
                priority: a.priority,
            })),
        )
        .ignore()
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db
        .deleteFrom("badges")
        .where(
            "id",
            "in",
            AUTOMATIC_ACHIEVEMENTS.map((a) => a.badgeId),
        )
        .execute();

    await db.schema
        .alterTable("player_stats")
        .dropColumn("current_play_streak")
        .dropColumn("longest_play_streak")
        .dropColumn("last_streak_date")
        .execute();
}
