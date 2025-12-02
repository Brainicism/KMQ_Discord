import { IPCLogger } from "../logger.js";
import dbContext from "../database_context.js";

const logger = new IPCLogger("daily_stats");

const storeDailyStats = async (serverCount: number): Promise<void> => {
    const dateThreshold = new Date();
    dateThreshold.setHours(dateThreshold.getHours() - 24);

    const recentGameSessions =
        (await dbContext.kmq
            .selectFrom("game_sessions")
            .where("start_date", ">", dateThreshold)
            .select((eb) => eb.fn.countAll<number>().as("count"))
            .executeTakeFirst())!.count || 0;

    const recentRounds = (await dbContext.kmq
        .selectFrom("game_sessions")
        .where("start_date", ">", dateThreshold)
        .select((eb) => eb.fn.sum<number>("rounds_played").as("total"))
        .executeTakeFirst())!.total;

    const recentPlayers =
        (await dbContext.kmq
            .selectFrom("player_stats")
            .where("last_active", ">", dateThreshold)
            .select((eb) => eb.fn.countAll<number>().as("count"))
            .executeTakeFirst())!.count || 0;

    const newPlayers =
        (await dbContext.kmq
            .selectFrom("player_stats")
            .where("first_play", ">=", dateThreshold)
            .select((eb) => eb.fn.countAll<number>().as("count"))
            .executeTakeFirst())!.count || 0;

    logger.info("Inserting today's stats into db...");

    await dbContext.kmq
        .insertInto("daily_stats")
        .values([
            {
                date: dateThreshold,
                gameSessions: recentGameSessions,
                roundsPlayed: recentRounds,
                players: recentPlayers,
                newPlayers,
                serverCount,
            },
        ])
        .execute();
};

export default storeDailyStats;
