import {
    ExpBonusModifierValues,
    HIDDEN_DEFAULT_TIMER,
    OptionAction,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import AnswerType from "../../enums/option_types/answer_type";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import ExpBonusModifier from "../../enums/exp_bonus_modifier";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "answer";
const logger = new IPCLogger(COMMAND_NAME);

export default class AnswerCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "answerType",
                type: "enum" as const,
                enums: Object.values(AnswerType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.answer.help.description",
            {
                typing: `\`${AnswerType.TYPING}\``,
                typingtypos: `\`${AnswerType.TYPING_TYPOS}\``,
                easy: `\`${AnswerType.MULTIPLE_CHOICE_EASY}\``,
                medium: `\`${AnswerType.MULTIPLE_CHOICE_MED}\``,
                hard: `\`${AnswerType.MULTIPLE_CHOICE_HARD}\``,
                hidden: `\`${AnswerType.HIDDEN}\``,
            },
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} answer:typing`,
                explanation: i18n.translate(
                    guildID,
                    "command.answer.help.example.typing",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} answer:typingtypos`,
                explanation: i18n.translate(
                    guildID,
                    "command.answer.help.example.typingTypos",
                    {
                        penalty: `${
                            ExpBonusModifierValues[ExpBonusModifier.TYPO]
                        }x`,
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} answer:easy`,
                explanation: i18n.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    {
                        optionCount: String(4),
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.MC_GUESS_EASY
                            ]
                        }x`,
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} answer:medium`,
                explanation: i18n.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    {
                        optionCount: String(6),
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.MC_GUESS_MEDIUM
                            ]
                        }x`,
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} answer:hard`,
                explanation: i18n.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    {
                        optionCount: String(8),
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.MC_GUESS_HARD
                            ]
                        }`,
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} answer:hidden`,
                explanation: i18n.translate(
                    guildID,
                    "command.answer.help.example.hidden",
                ),
            },
        ],
        priority: 150,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.answer.help.interaction.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.answer.help.interaction.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "answer",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.answer.help.interaction.answerOption",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.answer.help.interaction.answerOption",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(AnswerType).map(
                                (answerType) => ({
                                    name: answerType,
                                    value: answerType,
                                }),
                            ),
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "answer" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "answer" },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let answerType: AnswerType | null;

        if (parsedMessage.components.length === 0) {
            answerType = null;
        } else {
            answerType =
                parsedMessage.components[0]!.toLowerCase() as AnswerType;
        }

        await AnswerCommand.updateOption(
            MessageContext.fromMessage(message),
            answerType,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        answerType: AnswerType | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = answerType == null;

        if (reset) {
            await guildPreference.reset(GameOption.ANSWER_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Answer type reset.`,
            );
        } else {
            if (answerType === AnswerType.HIDDEN) {
                await AnswerCommand.setAnswerHidden(guildPreference);
            } else {
                await guildPreference.setAnswerType(answerType);
            }

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Answer type set to ${answerType}`,
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.ANSWER_TYPE, reset }],
            false,
            undefined,
            undefined,
            interaction,
        );
    }

    static async setAnswerHidden(
        guildPreference: GuildPreference,
    ): Promise<void> {
        await guildPreference.setAnswerType(AnswerType.HIDDEN);
        if (!guildPreference.isGuessTimeoutSet()) {
            await guildPreference.setGuessTimeout(HIDDEN_DEFAULT_TIMER);
        }
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        let answerType: AnswerType | null;
        const action = interactionName as OptionAction;
        switch (action) {
            case OptionAction.RESET:
                answerType = null;
                break;
            case OptionAction.SET:
                answerType = interactionOptions["answer"] as AnswerType;
                break;
            default:
                logger.error(`Unexpected interaction name: ${action}`);
                answerType = null;
                break;
        }

        await AnswerCommand.updateOption(
            messageContext,
            answerType,
            interaction,
        );
    }
}
