import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import {
    friendlyFormattedDate,
    friendlyFormattedNumber,
    measureExecutionTime,
} from "../../helpers/utils";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { sql } from "kysely";
import Eris from "eris";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import dbContext from "../../database_context";
import i18n from "../../helpers/localization_manager";
import os from "os";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "stats";
const logger = new IPCLogger(COMMAND_NAME);

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

        const latestAvailableSong = new Date(
            (
                await dbContext.kmq
                    .selectFrom("available_songs")
                    .select(["publishedon"])
                    .orderBy("publishedon", "desc")
                    .executeTakeFirst()
            )?.publishedon as Date,
        );

        const mysqlLatency = await measureExecutionTime(
            sql`SELECT 1`.execute(dbContext.kmq),
        );

        const requestLatency = (
            await dbContext.kmq
                .selectFrom("system_stats")
                .select(["stat_value"])
                .where("stat_name", "=", "request_latency")
                .orderBy("date", "desc")
                .executeTakeFirst()
        )?.stat_value;

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
            )]: friendlyFormattedDate(
                latestAvailableSong,
                messageContext.guildID,
            ),
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
            interaction.guildID as string,
            interaction,
        );
    }
}
