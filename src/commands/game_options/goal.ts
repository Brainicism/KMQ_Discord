import { IPCLogger } from "../../logger";
import { OptionAction } from "../../constants";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GameType from "../../enums/game_type";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type GameSession from "../../structures/game_session";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("goal");

export default class GoalCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
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

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "goal",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.goal.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.goal.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "goal",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.goal.interaction.description"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                            required: true,
                            min_value: 1,
                        } as any,
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "goal" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let userGoal: number;
        if (parsedMessage.components.length === 0) {
            userGoal = null;
        } else {
            userGoal = parseInt(parsedMessage.components[0], 10);
        }

        await GoalCommand.updateOption(
            MessageContext.fromMessage(message),
            userGoal,
            null,
            userGoal == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        userGoal: number,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const gameSession = Session.getSession(
            messageContext.guildID
        ) as GameSession;

        if (gameSession) {
            if (
                gameSession.scoreboard.getWinners().length > 0 &&
                userGoal <= gameSession.scoreboard.getWinners()[0].getScore()
            ) {
                logger.info(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Goal update ignored.`
                );

                sendErrorMessage(
                    messageContext,
                    {
                        title: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.goal.failure.goalExceeded.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.goal.failure.goalExceeded.description"
                        ),
                    },
                    interaction
                );
                return;
            }

            if (gameSession.gameType === GameType.ELIMINATION) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Game option conflict between goal and ${
                        gameSession.gameType
                    } gameType.`
                );

                sendErrorMessage(
                    messageContext,
                    {
                        title: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "misc.failure.gameOptionConflict.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.goal.failure.gameOptionConflict.description",
                            {
                                elimination: `\`${GameType.ELIMINATION}\``,
                                goal: "`goal`",
                                classic: `\`${GameType.CLASSIC}\``,
                                teams: `\`${GameType.TEAMS}\``,
                            }
                        ),
                    },
                    interaction
                );

                return;
            }
        }

        if (reset) {
            await guildPreference.reset(GameOption.GOAL);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Goal disabled.`
            );
        } else {
            await guildPreference.setGoal(userGoal);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Goal set to ${
                    guildPreference.gameOptions.goal
                }`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.GOAL, reset }],
            null,
            null,
            null,
            interaction
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        const action = interactionName as OptionAction;
        if (action === OptionAction.SET) {
            await GoalCommand.updateOption(
                messageContext,
                interactionOptions["goal"] as number,
                interaction,
                false
            );
        } else if (action === OptionAction.RESET) {
            await GoalCommand.updateOption(
                messageContext,
                null,
                interaction,
                true
            );
        }
    }
}
