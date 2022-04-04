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
        arguments: [
            {
                minValue: 1,
                name: "goal",
                type: "number" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.goal.help.description"
        ),
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
        name: "goal",
        priority: 120,
        usage: `,goal [${state.localizer.translate(
            guildID,
            "command.goal.help.usage.points"
        )}]`,
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
                    description: state.localizer.translate(
                        message.guildID,
                        "command.goal.failure.goalExceeded.description"
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "command.goal.failure.goalExceeded.title"
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
                    description: state.localizer.translate(
                        message.guildID,
                        "command.goal.failure.gameOptionConflict.description",
                        {
                            classic: `\`${GameType.CLASSIC}\``,
                            elimination: `\`${GameType.ELIMINATION}\``,
                            goal: "`goal`",
                            teams: `\`${GameType.TEAMS}\``,
                        }
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "misc.failure.gameOptionConflict.title"
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
