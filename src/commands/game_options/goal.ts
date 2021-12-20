import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendOptionsMessage,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption, GameType } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { GameOptions } from "../../structures/guild_preference";

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

    help = {
        name: "goal",
        description:
            "Once the player with the most points reaches the goal score, the game ends. Calling it with no arguments disables the goal. If a game is in progress, the goal must exceed the highest score",
        usage: ",goal [goal]",
        examples: [
            {
                example: "`,goal 30`",
                explanation: "The first player to 30 wins the game",
            },
            {
                example: "`,goal`",
                explanation: "Disables the goal",
            },
        ],
        priority: 120,
    };

    static argumentValidator = (gameOptions: GameOptions): boolean =>
        gameOptions.goal === null || gameOptions.goal > 1;

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
                !gameSession.scoreboard.isEmpty() &&
                userGoal <= gameSession.scoreboard.getWinners()[0].getScore()
            ) {
                logger.info(
                    `${getDebugLogHeader(message)} | Goal update ignored.`
                );

                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: "Error Applying Goal",
                    description:
                        "Given goal exceeds highest score. Please raise your goal, or start a new game.",
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
                    title: "Game Option Conflict",
                    description: `An \`${GameType.ELIMINATION}\` game is currently in progress. \`goal\` and \`${GameType.ELIMINATION}\` are incompatible. Play a \`${GameType.CLASSIC}\` or \`${GameType.TEAMS}\` game to use \`goal\`.`,
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
