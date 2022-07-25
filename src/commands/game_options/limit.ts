import { DEFAULT_LIMIT } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionOptionValueInteger,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("limit");

const LIMIT_START_MIN = 0;
const LIMIT_START_MAX = 100000;
const LIMIT_END_MIN = 1;
const LIMIT_END_MAX = 100000;

export default class LimitCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "limit_1",
                type: "number" as const,
                minValue: LIMIT_START_MIN,
                maxValue: LIMIT_START_MAX,
            },
            {
                name: "limit_2",
                type: "number" as const,
                minValue: LIMIT_END_MIN,
                maxValue: LIMIT_END_MAX,
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "limit",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.limit.help.description"
        ),
        usage: ",limit [limit_1] {limit_2}",
        examples: [
            {
                example: "`,limit 250`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.limit.help.example.singleLimit",
                    {
                        limit: String(250),
                    }
                ),
            },
            {
                example: "`,limit 250 500`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.limit.help.example.twoLimits",
                    { limitStart: String(250), limitEnd: String(500) }
                ),
            },
            {
                example: "`,limit`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.limit.help.example.reset",
                    { defaultLimit: `\`${DEFAULT_LIMIT}\`` }
                ),
            },
        ],
        priority: 140,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "limit",
            description: "boop",
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "top",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.limit.interaction.description_top"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "limit",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.limit.interaction.description_top"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                            required: true,
                            max_value: LIMIT_END_MAX,
                            min_value: LIMIT_END_MIN,
                        } as any,
                    ],
                },
                {
                    name: "range",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.limit.interaction.description_range"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "limit_start",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.limit.interaction.description_range"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                            required: true,
                            max_value: LIMIT_START_MAX,
                            min_value: LIMIT_START_MIN,
                        } as any,
                        {
                            name: "limit_end",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.limit.interaction.description_range"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                            required: true,
                            max_value: LIMIT_END_MAX,
                            min_value: LIMIT_END_MIN,
                        } as any,
                    ],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let limitStart: number;
        let limitEnd: number;

        if (parsedMessage.components.length === 0) {
            limitStart = null;
            limitEnd = null;
        } else if (parsedMessage.components.length === 1) {
            limitStart = 0;
            limitEnd = parseInt(parsedMessage.components[0], 10);
        } else {
            limitStart = parseInt(parsedMessage.components[0], 10);
            limitEnd = parseInt(parsedMessage.components[1], 10);
        }

        await LimitCommand.updateOption(
            MessageContext.fromMessage(message),
            limitStart,
            limitEnd
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        limitStart: number,
        limitEnd: number,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        if (limitEnd === 0) {
            sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.limit.failure.invalidLimit.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.limit.failure.invalidLimit.greaterThanZero.description"
                    ),
                },
                interaction
            );
            return;
        }

        if (limitEnd <= limitStart) {
            sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.limit.failure.invalidLimit.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.limit.failure.invalidLimit.greaterThanStart.description"
                    ),
                },
                interaction
            );
            return;
        }

        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = limitStart === null && limitEnd === null;

        if (reset) {
            await guildPreference.reset(GameOption.LIMIT);
            logger.info(`${getDebugLogHeader(messageContext)} | Limit reset.`);
        } else {
            await guildPreference.setLimit(limitStart, limitEnd);

            logger.info(
                `${getDebugLogHeader(messageContext)} | Limit set to ${
                    guildPreference.gameOptions.limitStart
                } - ${guildPreference.gameOptions.limitEnd}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.LIMIT, reset }],
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
        const limitDataOption = interaction.data
            .options[0] as Eris.InteractionDataOptionsSubCommand;

        let limitStart: number;
        let limitEnd: number;
        if (limitDataOption.name === "range") {
            limitStart = getInteractionOptionValueInteger(
                limitDataOption.options,
                "limit_start"
            );

            limitEnd = getInteractionOptionValueInteger(
                limitDataOption.options,
                "limit_end"
            );
        } else {
            limitStart = 0;
            limitEnd = getInteractionOptionValueInteger(
                limitDataOption.options,
                "limit"
            );
        }

        await LimitCommand.updateOption(
            messageContext,
            limitStart,
            limitEnd,
            interaction
        );
    }
}
