import BaseCommand, { CommandArgs } from "./base_command";
import Eris from "eris";
import {
    sendEmbed, getDebugContext
} from "../helpers/discord_utils";
import { db } from "../databases";
import { bold } from "../helpers/utils";
import os from "os";
import _logger from "../logger";
const logger = _logger("stats");

export default class SkipCommand implements BaseCommand {
    async call({ gameSessions, message }: CommandArgs) {
        const activeGameSessions = Object.keys(gameSessions).length;
        const activeUsers = Object.values(gameSessions).reduce((total, curr) => total + curr.participants.size, 0);
        let dateThreshold = new Date();
        dateThreshold.setHours(dateThreshold.getHours() - 24);
        const recentGameSessions = (await db.kmq("game_sessions")
            .where("start_date", ">", dateThreshold)
            .count("* as count"))[0].count

        const recentGameRounds = (await db.kmq("game_sessions")
            .where("start_date", ">", dateThreshold)
            .sum("rounds_played as total"))[0].total;

        const fields: Array<Eris.EmbedField> = [{
            name: "Active Game Sessions",
            value: activeGameSessions.toString(),
            inline: true
        },
        {
            name: "Active Players",
            value: activeUsers.toString(),
            inline: true
        },
        {
            name: "Recent Game Sessions",
            value: recentGameSessions.toString(),
            inline: true
        },
        {
            name: "Recent Rounds Played",
            value: recentGameRounds.toString(),
            inline: true
        },
        {
            name: "System Load Average",
            value: os.loadavg().map(x => x.toFixed(2)).toString(),
            inline: true
        },
        {
            name: "Process Memory Usage",
            value: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
            inline: true
        },
        {
            name: "API Latency",
            value: `${message.channel.guild.shard.latency} ms`,
            inline: true
        },
        {
            name: "Process Uptime",
            value: `${(process.uptime() / (60 * 60)).toFixed(2)} hours`,
            inline: true
        }];

        logger.info(`${getDebugContext(message)} | Stats retrieved`);
        sendEmbed({ channel: message.channel, authorId: message.author.id }, {
            title: bold("Bot Stats"),
            fields,
            footer: {
                text: "'Recent' statistics represent data from last 24 hours."
            },
            timestamp: new Date()
        });

    }
    help = {
        name: "stats",
        description: "Various usage/system statistics.",
        usage: "!stats",
        examples: []
    }
}
