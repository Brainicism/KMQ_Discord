import Knex from "knex";
import kmqKnexConfig from "../config/knexfile_kmq";

const storeDailyStats = async () => {
    const db = Knex(kmqKnexConfig);

    if (!(await db.schema.hasTable("daily_stats"))) {
        await db.schema.createTable("daily_stats", (table) => {
            table.date("date").notNullable();
            table.integer("gameSessions");
            table.integer("roundsPlayed");
            table.integer("players");
            table.integer("newPlayers");
        });
    }

    const dateThreshold = new Date();
    dateThreshold.setHours(dateThreshold.getHours() - 24);
    const recentGameSessions = (await db("game_sessions")
        .where("start_date", ">", dateThreshold)
        .count("* as count"))[0].count;

    const recentGameRounds = (await db("game_sessions")
        .where("start_date", ">", dateThreshold)
        .sum("rounds_played as total"))[0].total;

    const recentPlayers = (await db("player_stats")
        .where("last_active", ">", dateThreshold)
        .count("* as count"))[0].count;

    const newPlayers = (await db("player_stats")
        .where("first_play", "=", dateThreshold)
        .count("* as count"))[0].count;

    await db("daily_stats")
        .insert({
            date: dateThreshold,
            gameSessions: recentGameSessions,
            roundsPlayed: recentGameRounds,
            players: recentPlayers,
            newPlayers,
        });
};

(async () => {
    await storeDailyStats();
})();
