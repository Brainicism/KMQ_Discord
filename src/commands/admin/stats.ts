import Eris from "eris";
import os from "os";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import dbContext from "../../database_context";
import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq_worker";
import {
    friendlyFormattedDate,
    friendlyFormattedNumber,
    measureExecutionTime,
} from "../../helpers/utils";

const logger = new IPCLogger("stats");

export default class SkipCommand implements BaseCommand {
    help = (guildID: string): Help => ({
            name: "stats",
            description: state.localizer.translate(guildID, "Various usage/system statistics."),
            usage: ",stats",
            examples: [],
        });

    helpPriority = 1;

    call = async ({ message, channel }: CommandArgs): Promise<void> => {
        const fleetStats = await state.ipc.getStats();
        let gameSessionStats;
        try {
            gameSessionStats = Array.from(
                (
                    (await state.ipc.allClustersCommand(
                        "game_session_stats",
                        true,
                        5000
                    )) as Map<number, any>
                ).values()
            );
        } catch (e) {
            logger.error(`Error retrieving stats via IPC. err = ${e}`);
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: "Error Retrieving Stats",
                description: "Please try again later",
            });
            return;
        }

        const activeGameSessions = gameSessionStats.reduce(
            (x, y) => x + y.activeGameSessions,
            0
        );

        const activePlayers = gameSessionStats.reduce(
            (x, y) => x + y.activePlayers,
            0
        );

        const dateThreshold = new Date();
        dateThreshold.setHours(dateThreshold.getHours() - 24);
        const recentGameSessions = (
            await dbContext
                .kmq("game_sessions")
                .where("start_date", ">", dateThreshold)
                .count("* as count")
                .first()
        ).count;

        const totalGameSessions = (
            await dbContext.kmq("game_sessions").count("* as count").first()
        ).count;

        const recentGameRounds =
            (
                await dbContext
                    .kmq("game_sessions")
                    .where("start_date", ">", dateThreshold)
                    .sum("rounds_played as total")
                    .first()
            ).total || 0;

        const totalGameRounds =
            (
                await dbContext
                    .kmq("game_sessions")
                    .sum("rounds_played as total")
                    .first()
            ).total || 0;

        const recentPlayers = (
            await dbContext
                .kmq("player_stats")
                .where("last_active", ">", dateThreshold)
                .count("* as count")
                .first()
        ).count;

        const totalPlayers = (
            await dbContext
                .kmq("player_stats")
                .count("* as count")
                .where("exp", ">", "0")
                .first()
        ).count;

        const latestAvailableSong = new Date(
            (
                await dbContext
                    .kmq("available_songs")
                    .select("publishedon")
                    .orderBy("publishedon", "DESC")
                    .first()
            ).publishedon
        );

        const mysqlLatency = await measureExecutionTime(
            dbContext.kmq.raw("SELECT 1;")
        );

        const requestLatency = (
            await dbContext
                .kmq("system_stats")
                .select("stat_value")
                .where("stat_name", "=", "request_latency")
                .orderBy("date", "DESC")
                .first()
        )["stat_value"];

        const gameStatistics = {
            [state.localizer.translate(message.guildID, "Active Game Sessions")]: activeGameSessions,
            [state.localizer.translate(message.guildID, "Active Players")]: activePlayers,
            [state.localizer.translate(message.guildID,
                "(Recent) Game Sessions"
            )]: `${friendlyFormattedNumber(
                Number(recentGameSessions)
            )} | ${friendlyFormattedNumber(Number(totalGameSessions))}`,
            [state.localizer.translate(message.guildID, "(Recent) Game Rounds")]: `${friendlyFormattedNumber(
                recentGameRounds
            )} | ${friendlyFormattedNumber(totalGameRounds)}`,
            [state.localizer.translate(message.guildID, "(Recent) Players")]: `${friendlyFormattedNumber(
                Number(recentPlayers)
            )} | ${friendlyFormattedNumber(Number(totalPlayers))}`,
            [state.localizer.translate(message.guildID, "Latest Song Update")]:
                friendlyFormattedDate(latestAvailableSong, message.guildID),
        };

        const systemStatistics = {
            [state.localizer.translate(message.guildID, "System Load Average")]: os
                .loadavg()
                .map((x) => x.toFixed(2))
                .toString(),
            [state.localizer.translate(message.guildID,
                "Process Memory Usage"
            )]: `${fleetStats.totalRam.toFixed(2)} MB`,
            [state.localizer.translate(message.guildID, "API Latency")]: `${channel.guild.shard.latency} ms`,
            [state.localizer.translate(message.guildID, "Request Latency")]: `${requestLatency} ms`,
            [state.localizer.translate(message.guildID, "Database Latency")]: `${mysqlLatency.toFixed(2)} ms`,
            [state.localizer.translate(message.guildID, "Uptime")]: `${(process.uptime() / (60 * 60)).toFixed(
                2
            )} hours`,
        };

        const fields: Array<Eris.EmbedField> = [
            {
                name: state.localizer.translate(message.guildID, "Game Statistics"),
                value: `\`\`\`\n${Object.entries(gameStatistics)
                    .map((stat) => `${stat[0]}: ${stat[1]}`)
                    .join("\n")}\`\`\``,
            },
            {
                name: state.localizer.translate(message.guildID, "System Statistics"),
                value: `\`\`\`\n${Object.entries(systemStatistics)
                    .map((stat) => `${stat[0]}: ${stat[1]}`)
                    .join("\n")}\`\`\``,
            },
        ];

        logger.info(`${getDebugLogHeader(message)} | Stats retrieved`);
        sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(message.guildID, "Bot Stats"),
            description: state.localizer.translate(message.guildID, "Detailed bot status: {{{link}}}", {
                link: "https://kmq.kpop.gg/status",
            }),
            fields,
            footerText: state.localizer.translate(message.guildID,
                "'Recent' statistics represent data from last 24 hours."
            ),
            timestamp: new Date(),
            thumbnailUrl: KmqImages.READING_BOOK,
        });
    };
}
