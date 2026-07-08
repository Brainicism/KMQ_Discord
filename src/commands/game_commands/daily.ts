import { DAILY_CHALLENGE_LEADERBOARD_SIZE, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import { getDailyChallengeDate } from "../../helpers/daily_challenge";
import {
    getDailyLeaderboard,
    getDailyResultForPlayer,
} from "../../helpers/daily_challenge_manager";
import {
    getDebugLogHeader,
    getUserTag,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameType from "../../enums/game_type";
import MessageContext from "../../structures/message_context";
import PlayCommand from "./play";
import i18n from "../../helpers/localization_manager";
import type { DailyChallengeResult } from "../../helpers/daily_challenge_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "daily";
const logger = new IPCLogger(COMMAND_NAME);

/**
 * A Wordle-style grid string from an aggregate result: green per correct guess,
 * black per miss. Not per-round (the Activity builds the true per-round grid
 * live), but a recognizable shareable summary for the text path.
 * @param result - the player's stored result
 * @returns the emoji grid
 */
function resultGrid(result: DailyChallengeResult): string {
    return (
        "🟩".repeat(result.correctCount) +
        "⬛".repeat(Math.max(0, result.totalCount - result.correctCount))
    );
}

// eslint-disable-next-line import/no-unused-modules
export default class DailyCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.notRestartingPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.daily.help.description"),
        examples: [
            {
                example: "`/daily`",
                explanation: i18n.translate(
                    guildID,
                    "command.daily.help.example.play",
                ),
            },
        ],
        priority: 1010,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await DailyCommand.runDaily(MessageContext.fromMessage(message));
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await DailyCommand.runDaily(messageContext, interaction);
    }

    /**
     * Starts today's Daily Challenge, or — if the caller already played it —
     * shows their result and the day's leaderboard.
     * @param messageContext - the message context
     * @param interaction - the slash interaction, if any
     */
    static async runDaily(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const date = getDailyChallengeDate();
        const existing = await getDailyResultForPlayer(
            messageContext.author.id,
            date,
        );

        if (existing) {
            await DailyCommand.sendDailyStatus(
                messageContext,
                date,
                existing,
                interaction,
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Daily already completed; showed status.`,
            );
            return;
        }

        await PlayCommand.startGame(
            messageContext,
            GameType.CLASSIC,
            null,
            false,
            false,
            interaction,
            date,
        );

        logger.info(
            `${getDebugLogHeader(messageContext)} | Daily challenge started.`,
        );
    }

    /**
     * Sends the caller's result plus the day's leaderboard.
     * @param messageContext - the message context
     * @param date - the challenge date
     * @param result - the caller's stored result
     * @param interaction - the slash interaction, if any
     */
    private static async sendDailyStatus(
        messageContext: MessageContext,
        date: string,
        result: DailyChallengeResult,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildID = messageContext.guildID;
        const leaderboard = await getDailyLeaderboard(
            date,
            DAILY_CHALLENGE_LEADERBOARD_SIZE,
        );

        const resultLine = i18n.translate(
            guildID,
            "command.daily.result.summary",
            {
                correct: String(result.correctCount),
                total: String(result.totalCount),
                score: String(result.score),
                streak: String(result.bestStreak),
            },
        );

        const leaderboardLines = await Promise.all(
            leaderboard.map(async (entry, index) =>
                i18n.translate(guildID, "command.daily.leaderboard.entry", {
                    rank: String(index + 1),
                    user: await getUserTag(entry.playerID),
                    score: String(entry.score),
                    correct: String(entry.correctCount),
                }),
            ),
        );

        const description = [
            resultGrid(result),
            resultLine,
            "",
            i18n.translate(guildID, "command.daily.leaderboard.title"),
            leaderboardLines.join("\n") ||
                i18n.translate(guildID, "command.daily.leaderboard.empty"),
        ].join("\n");

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(guildID, "command.daily.result.title", {
                    date,
                }),
                description,
                thumbnailUrl: KmqImages.THUMBS_UP,
            },
            false,
            undefined,
            [],
            interaction,
        );
    }
}
