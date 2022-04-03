import CommandPrechecks from "../../command_prechecks";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption, GameType } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("goal");

export default class GoalCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "goal",
                type: "number" as const,
                minValue: 1,
            },
        ],
    };

    help = (guildID: string): Help => ({
        name: "goal",
        description: state.localizer.translate(
            guildID,
            "command.goal.help.description"
        ),
        usage: `,goal [${state.localizer.translate(
            guildID,
            "command.goal.help.usage.points"
        )}]`,
        examples: [
            {
                example: "`,goal 30`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.goal.help.example.set",
                    { goal: String(30) }
                ),
            },
            {
                example: "`,goal`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.goal.help.example.reset"
                ),
            },
        ],
        priority: 120,
    });

    call = async ({
        message,
        parsedMessage,
        gameSessions,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.GOAL);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.GOAL, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Goal disabled.`);
            return;
        }

        const gameSession = gameSessions[message.guildID];
        const userGoal = parseInt(parsedMessage.components[0]);
        if (gameSession) {
            if (
                gameSession.scoreboard.getWinners().length > 0 &&
                userGoal <= gameSession.scoreboard.getWinners()[0].getScore()
            ) {
                logger.info(
                    `${getDebugLogHeader(message)} | Goal update ignored.`
                );

                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(
                        message.guildID,
                        "command.goal.failure.goalExceeded.title"
                    ),
                    description: state.localizer.translate(
                        message.guildID,
                        "command.goal.failure.goalExceeded.description"
                    ),
                });
                return;
            }

            if (gameSession.gameType === GameType.ELIMINATION) {
                logger.warn(
                    `${getDebugLogHeader(
                        message
                    )} | Game option conflict between goal and ${
                        gameSession.gameType
                    } gameType.`
                );

                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(
                        message.guildID,
                        "misc.failure.gameOptionConflict.title"
                    ),
                    description: state.localizer.translate(
                        message.guildID,
                        "command.goal.failure.gameOptionConflict.description",
                        {
                            elimination: `\`${GameType.ELIMINATION}\``,
                            goal: "`goal`",
                            classic: `\`${GameType.CLASSIC}\``,
                            teams: `\`${GameType.TEAMS}\``,
                        }
                    ),
                });
                return;
            }
        }

        await guildPreference.setGoal(userGoal);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.GOAL, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Goal set to ${
                guildPreference.gameOptions.goal
            }`
        );
    };
}
