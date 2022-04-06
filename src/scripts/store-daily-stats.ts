import dbContext from "../database_context";
import { IPCLogger } from "../logger";

const logger = new IPCLogger("daily_stats");

const storeDailyStats = async (serverCount: number): Promise<void> => {
    const dateThreshold = new Date();
    dateThreshold.setHours(dateThreshold.getHours() - 24);

    const recentGameSessions = (
        await dbContext
            .kmq("game_sessions")
            .where("start_date", ">", dateThreshold)
            .count("* as count")
    )[0].count;

    const recentRounds = (
        await dbContext
            .kmq("game_sessions")
            .where("start_date", ">", dateThreshold)
            .sum("rounds_played as total")
    )[0].total;

    const recentPlayers = (
        await dbContext
            .kmq("player_stats")
            .where("last_active", ">", dateThreshold)
            .count("* as count")
    )[0].count;

    const newPlayers = (
        await dbContext
            .kmq("player_stats")
            .where("first_play", ">=", dateThreshold)
            .count("* as count")
    )[0].count;

    logger.info("Inserting today's stats into db...");

    await dbContext.kmq("daily_stats").insert({
        date: dateThreshold,
        gameSessions: recentGameSessions,
        roundsPlayed: recentRounds,
        players: recentPlayers,
        newPlayers,
        serverCount,
    });
};

export { storeDailyStats as default };
