import type BaseCommand from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendOptionsMessage,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import Session from "../../structures/session";
import type GameSession from "../../structures/game_session";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import { GameOption } from "../../enums/game_option_name";
import { GameType } from "../../enums/game_type";
import LocalizationManager from "../../helpers/localization_manager";

const logger = new IPCLogger("goal");

export default class GoalCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

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

    help = (guildID: string): HelpDocumentation => ({
        name: "goal",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.goal.help.description"
        ),
        usage: `,goal [${LocalizationManager.localizer.translate(
            guildID,
            "command.goal.help.usage.points"
        )}]`,
        examples: [
            {
                example: "`,goal 30`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.goal.help.example.set",
                    { goal: String(30) }
                ),
            },
            {
                example: "`,goal`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.goal.help.example.reset"
                ),
            },
        ],
        priority: 120,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.GOAL);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.GOAL, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Goal disabled.`);
            return;
        }

        const gameSession = Session.getSession(message.guildID) as GameSession;
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
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.goal.failure.goalExceeded.title"
                    ),
                    description: LocalizationManager.localizer.translate(
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
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.gameOptionConflict.title"
                    ),
                    description: LocalizationManager.localizer.translate(
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
            Session.getSession(message.guildID),
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
