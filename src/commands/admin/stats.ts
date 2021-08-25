import Eris from "eris";
import os from "os";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    getDebugLogHeader, sendInfoMessage,
} from "../../helpers/discord_utils";
import dbContext from "../../database_context";
import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq";
import { friendlyFormattedDate, friendlyFormattedNumber, measureExecutionTime } from "../../helpers/utils";

const logger = new IPCLogger("stats");

export default class SkipCommand implements BaseCommand {
    help = {
        name: "stats",
        description: "Various usage/system statistics.",
        usage: ",stats",
        examples: [],
        priority: 1,
    };

    call = async ({ message, channel }: CommandArgs) => {
        const fleetStats = await state.ipc.getStats();

        const activeGameSessions = friendlyFormattedNumber((await dbContext.kmq("cluster_stats")
            .where("stat_name", "=", "active_sessions")
            .sum("stat_value as count")
            .first()).count) ?? "Loading...";

        const activeUsers = friendlyFormattedNumber((await dbContext.kmq("cluster_stats")
            .where("stat_name", "=", "active_players")
            .sum("stat_value as count")
            .first()).count) ?? "Loading...";

        const dateThreshold = new Date();
        dateThreshold.setHours(dateThreshold.getHours() - 24);
        const recentGameSessions = (await dbContext.kmq("game_sessions")
            .where("start_date", ">", dateThreshold)
            .count("* as count")
            .first()).count;

        const totalGameSessions = (await dbContext.kmq("game_sessions")
            .count("* as count")
            .first()).count;

        const recentGameRounds = (await dbContext.kmq("game_sessions")
            .where("start_date", ">", dateThreshold)
            .sum("rounds_played as total")
            .first()).total || 0;

        const totalGameRounds = (await dbContext.kmq("game_sessions")
            .sum("rounds_played as total")
            .first()).total || 0;

        const recentPlayers = (await dbContext.kmq("player_stats")
            .where("last_active", ">", dateThreshold)
            .count("* as count")
            .first()).count;

        const totalPlayers = (await dbContext.kmq("player_stats")
            .count("* as count")
            .where("exp", ">", "0")
            .first()).count;

        const latestAvailableSong = new Date((await dbContext.kmq("available_songs")
            .select("publishedon")
            .orderBy("publishedon", "DESC")
            .first()).publishedon);

        const mysqlLatency = await measureExecutionTime(dbContext.kmq.raw("SELECT 1;"));
        const requestLatency = (await dbContext.kmq("system_stats")
            .select("stat_value")
            .where("stat_name", "=", "request_latency")
            .orderBy("date", "DESC")
            .first())["stat_value"];

        const gameStatistics = {
            "Active Game Sessions": activeGameSessions,
            "Active Players": activeUsers,
            "(Recent) Game Sessions": `${friendlyFormattedNumber(Number(recentGameSessions))} | ${friendlyFormattedNumber(Number(totalGameSessions))}`,
            "(Recent) Game Rounds": `${friendlyFormattedNumber(recentGameRounds)} | ${friendlyFormattedNumber(totalGameRounds)}`,
            "(Recent) Players": `${friendlyFormattedNumber(Number(recentPlayers))} | ${friendlyFormattedNumber(Number(totalPlayers))}`,
            "Latest Song Update": friendlyFormattedDate(latestAvailableSong),
        };

        const systemStatistics = {
            "System Load Average": os.loadavg().map((x) => x.toFixed(2)).toString(),
            "Process Memory Usage": `${(fleetStats.totalRam).toFixed(2)} MB`,
            "API Latency": `${channel.guild.shard.latency} ms`,
            "Request Latency": `${requestLatency} ms`,
            "Database Latency": `${mysqlLatency.toFixed(2)} ms`,
            "Uptime": `${(process.uptime() / (60 * 60)).toFixed(2)} hours`,
        };

        const fields: Array<Eris.EmbedField> = [{
            name: "Game Statistics",
            value: `\`\`\`\n${Object.entries(gameStatistics).map((stat) => `${stat[0]}: ${stat[1]}`).join("\n")}\`\`\``,
        },
        {
            name: "System Statistics",
            value: `\`\`\`\n${Object.entries(systemStatistics).map((stat) => `${stat[0]}: ${stat[1]}`).join("\n")}\`\`\``,
        }];

        logger.info(`${getDebugLogHeader(message)} | Stats retrieved`);
        sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Bot Stats",
            fields,
            footerText: "\"Recent\" statistics represent data from last 24 hours.",
            timestamp: new Date(),
            thumbnailUrl: KmqImages.READING_BOOK,
        });
    };
}
