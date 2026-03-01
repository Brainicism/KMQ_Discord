import * as Eris from "eris";
import { IPCLogger } from "../../logger.js";
import { KmqImages, LATEST_DAISUKI_DUMP } from "../../constants.js";
import {
    friendlyFormattedDate,
    friendlyFormattedNumber,
    measureExecutionTime,
    pathExists,
} from "../../helpers/utils.js";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils.js";
import { sql } from "kysely";
import { userIsAdmin } from "../../helpers/game_utils.js";
import MessageContext from "../../structures/message_context.js";
import State from "../../state.js";
import dbContext from "../../database_context.js";
import fs from "fs";
import i18n from "../../helpers/localization_manager.js";
import os from "os";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "stats";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class StatsCommand implements BaseCommand {
    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.stats.help.description"),
        examples: [],
        priority: 1,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    static sendStatsMessage = async (
        messageContext: MessageContext,
        guildID: string,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> => {
        const fleetStats = await State.ipc.getStats();
        let gameSessionStats;
        try {
            gameSessionStats = Array.from(
                (
                    (await State.ipc.allClustersCommand(
                        "game_session_stats",
                        true,
                        5000,
                    )) as Map<number, any>
                ).values(),
            );
        } catch (e) {
            logger.error(`Error retrieving stats via IPC. err = ${e}`);
            await sendErrorMessage(messageContext, {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.stats.failure.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.stats.failure.description",
                ),
            });
            return;
        }

        const activeGameSessions = gameSessionStats.reduce(
            (x, y) => x + y.activeGameSessions,
            0,
        );

        const activePlayers = gameSessionStats.reduce(
            (x, y) => x + y.activePlayers,
            0,
        );

        const dateThreshold = new Date();
        dateThreshold.setHours(dateThreshold.getHours() - 24);
        const recentGameSessions =
            (
                await dbContext.kmq
                    .selectFrom("game_sessions")
                    .select((eb) => eb.fn.countAll<number>().as("count"))
                    .where("start_date", ">", dateThreshold)
                    .executeTakeFirst()
            )?.count || 0;

        const totalGameSessions =
            (
                await dbContext.kmq
                    .selectFrom("game_sessions")
                    .select((eb) => eb.fn.countAll<number>().as("count"))
                    .executeTakeFirst()
            )?.count || 0;

        const recentGameRounds =
            (
                await dbContext.kmq
                    .selectFrom("game_sessions")
                    .where("start_date", ">", dateThreshold)
                    .select((eb) =>
                        eb.fn.sum<number>("rounds_played").as("total"),
                    )
                    .executeTakeFirst()
            )?.total || 0;

        const totalGameRounds =
            (
                await dbContext.kmq
                    .selectFrom("game_sessions")
                    .select((eb) =>
                        eb.fn.sum<number>("rounds_played").as("total"),
                    )
                    .executeTakeFirst()
            )?.total || 0;

        const recentPlayers =
            (
                await dbContext.kmq
                    .selectFrom("player_stats")
                    .where("last_active", ">", dateThreshold)
                    .select((eb) => eb.fn.countAll<number>().as("count"))
                    .executeTakeFirst()
            )?.count || 0;

        const totalPlayers =
            (
                await dbContext.kmq
                    .selectFrom("player_stats")
                    .select((eb) => eb.fn.countAll<number>().as("count"))
                    .where("exp", ">", 0)
                    .executeTakeFirst()
            )?.count || 0;

        const latestAvailableSongDate = (await pathExists(LATEST_DAISUKI_DUMP))
            ? (await fs.promises.stat(LATEST_DAISUKI_DUMP)).ctime
            : null;

        const mysqlLatency = await measureExecutionTime(
            sql`SELECT 1`.execute(dbContext.kmq),
        );

        const requestLatency =
            (
                await dbContext.kmq
                    .selectFrom("system_stats")
                    .select(["stat_value"])
                    .where("stat_name", "=", "avg_request_latency")
                    .where("date", ">", new Date(Date.now() - 2 * 60 * 1000))
                    .orderBy("date", "desc")
                    .executeTakeFirst()
            )?.stat_value ?? -1;

        const gameStatistics = {
            [i18n.translate(
                messageContext.guildID,
                "command.stats.game.activeGameSessions",
            )]: activeGameSessions,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.game.activePlayers",
            )]: activePlayers,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.game.recentGameSessions",
            )]: `${friendlyFormattedNumber(
                Number(recentGameSessions),
            )} | ${friendlyFormattedNumber(Number(totalGameSessions))}`,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.game.recentGameRounds",
            )]: `${friendlyFormattedNumber(
                recentGameRounds,
            )} | ${friendlyFormattedNumber(totalGameRounds)}`,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.game.recentPlayers",
            )]: `${friendlyFormattedNumber(
                Number(recentPlayers),
            )} | ${friendlyFormattedNumber(Number(totalPlayers))}`,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.game.latestSongUpdate",
            )]: latestAvailableSongDate
                ? friendlyFormattedDate(
                      latestAvailableSongDate,
                      messageContext.guildID,
                  )
                : "null",
        };

        const guild = State.client.guilds.get(guildID) as Eris.Guild;

        const systemStatistics = {
            [i18n.translate(
                messageContext.guildID,
                "command.stats.system.loadAverage",
            )]: os
                .loadavg()
                .map((x) => x.toFixed(2))
                .toString(),
            [i18n.translate(
                messageContext.guildID,
                "command.stats.system.memoryUsage",
            )]: `${fleetStats.totalRam.toFixed(2)} MB`,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.system.apiLatency",
            )]: `${
                !Number.isFinite(guild.shard.latency)
                    ? "?"
                    : guild.shard.latency
            } ms`,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.system.requestLatency",
            )]: `${requestLatency} ms`,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.system.databaseLatency",
            )]: `${mysqlLatency.toFixed(2)} ms`,
            [i18n.translate(
                messageContext.guildID,
                "command.stats.system.uptime",
            )]: i18n.translateN(
                messageContext.guildID,
                "misc.plural.hour",
                Number((process.uptime() / (60 * 60)).toFixed(2)),
            ),
        };

        const fields: Array<Eris.EmbedField> = [
            {
                name: i18n.translate(
                    messageContext.guildID,
                    "command.stats.game.title",
                ),
                value: `\`\`\`\n${Object.entries(gameStatistics)
                    .map((stat) => `${stat[0]}: ${stat[1]}`)
                    .join("\n")}\`\`\``,
            },
            {
                name: i18n.translate(
                    messageContext.guildID,
                    "command.stats.system.title",
                ),
                value: `\`\`\`\n${Object.entries(systemStatistics)
                    .map((stat) => `${stat[0]}: ${stat[1]}`)
                    .join("\n")}\`\`\``,
            },
        ];

        if (await userIsAdmin(messageContext.author.id)) {
            const runningStats = (await State.ipc.allClustersCommand(
                "running_stats",
                true,
            )) as Map<number, { roundsPlayed: number; gamesPlayed: number }>;

            const roundsPlayed = Array.from(runningStats.values()).reduce(
                (x, y) => x + y.roundsPlayed,
                0,
            );

            const gamesPlayed = Array.from(runningStats.values()).reduce(
                (x, y) => x + y.gamesPlayed,
                0,
            );

            const runningStatistics = {
                "Rounds Played": roundsPlayed,
                "Games Played": gamesPlayed,
            };

            fields.push({
                name: "Running Stats",
                value: `\`\`\`\n${Object.entries(runningStatistics)
                    .map((stat) => `${stat[0]}: ${stat[1]}`)
                    .join("\n")}\`\`\``,
            });
        }

        logger.info(`${getDebugLogHeader(messageContext)} | Stats retrieved`);

        const embedPayload = {
            title: i18n.translate(
                messageContext.guildID,
                "command.stats.title",
            ),
            description: i18n.translate(
                messageContext.guildID,
                "command.stats.description",
                {
                    link: "https://kmq.kpop.gg/status",
                },
            ),
            fields,
            footerText: `${State.version} | ${i18n.translate(
                messageContext.guildID,
                "command.stats.footer",
            )}`,
            timestamp: new Date(),
            thumbnailUrl: KmqImages.READING_BOOK,
        };

        await sendInfoMessage(
            messageContext,
            embedPayload,
            false,
            undefined,
            undefined,
            interaction,
        );
    };

    call = async ({ message }: CommandArgs): Promise<void> => {
        await StatsCommand.sendStatsMessage(
            MessageContext.fromMessage(message),
            message.guildID,
        );
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await StatsCommand.sendStatsMessage(
            messageContext,
            interaction.guild?.id as string,
            interaction,
        );
    }
}
