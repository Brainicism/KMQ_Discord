import { ExpBonusModifierValues } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateOptionsMessage,
    getDebugLogHeader,
    sendOptionsMessage,
    tryCreateInteractionCustomPayloadAcknowledgement,
} from "../../helpers/discord_utils";
import AnswerType from "../../enums/option_types/answer_type";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import ExpBonusModifier from "../../enums/exp_bonus_modifier";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("answer");

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
        name: "answer",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.answer.help.description",
            {
                typing: `\`${AnswerType.TYPING}\``,
                typingtypos: `\`${AnswerType.TYPING_TYPOS}\``,
                easy: `\`${AnswerType.MULTIPLE_CHOICE_EASY}\``,
                medium: `\`${AnswerType.MULTIPLE_CHOICE_MED}\``,
                hard: `\`${AnswerType.MULTIPLE_CHOICE_HARD}\``,
            }
        ),
        usage: ",answer [typing | typingtypos | easy | medium | hard]",
        examples: [
            {
                example: "`,answer typing`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.typing"
                ),
            },
            {
                example: "`,answer typingtypos`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.typingTypos",
                    {
                        penalty: `${
                            ExpBonusModifierValues[ExpBonusModifier.TYPO]
                        }x`,
                    }
                ),
            },
            {
                example: "`,answer easy`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    {
                        optionCount: String(4),
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.MC_GUESS_EASY
                            ]
                        }x`,
                    }
                ),
            },
            {
                example: "`,answer medium`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    {
                        optionCount: String(6),
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.MC_GUESS_MEDIUM
                            ]
                        }x`,
                    }
                ),
            },
            {
                example: "`,answer hard`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    {
                        optionCount: String(8),
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.MC_GUESS_HARD
                            ]
                        }`,
                    }
                ),
            },
        ],
        priority: 150,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "answer",
            description: LocalizationManager.localizer.translateByLocale(
                LocaleType.EN,
                "command.answer.help.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "answer",
                    description:
                        LocalizationManager.localizer.translateByLocale(
                            LocaleType.EN,
                            "command.answer.help.interaction.description"
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                    choices: Object.values(AnswerType).map((answerType) => ({
                        name: answerType,
                        value: answerType,
                    })),
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let answerType: AnswerType;

        if (parsedMessage.components.length === 0) {
            answerType = null;
        } else {
            answerType =
                parsedMessage.components[0].toLowerCase() as AnswerType;
        }

        await AnswerCommand.updateOption(
            MessageContext.fromMessage(message),
            answerType
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        answerType: AnswerType,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = answerType === null;

        if (reset) {
            await guildPreference.reset(GameOption.ANSWER_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Answer type reset.`
            );
        } else {
            await guildPreference.setAnswerType(answerType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Answer type set to ${answerType}`
            );
        }

        if (interaction) {
            const embedPayload = await generateOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.ANSWER_TYPE, reset }]
            );

            await tryCreateInteractionCustomPayloadAcknowledgement(
                messageContext,
                interaction,
                embedPayload
            );
        } else {
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.ANSWER_TYPE, reset }]
            );
        }
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    static async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const answerType = interaction.data.options[0]["value"] as AnswerType;

        await AnswerCommand.updateOption(
            messageContext,
            answerType,
            interaction
        );
    }
}
