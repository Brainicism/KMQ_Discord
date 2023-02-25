import { DEFAULT_LIMIT, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
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

const logger = new IPCLogger("limit");

const LIMIT_START_MIN = 0;
const LIMIT_START_MAX = 100000;
const LIMIT_END_MIN = 1;
const LIMIT_END_MAX = 100000;

enum LimitAppCommandAction {
    RANGE = "range",
    TOP = "top",
}

export default class LimitCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

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
        description: i18n.translate(guildID, "command.limit.help.description"),
        usage: "/limit set top\nlimit:{limit}\n\n/limit set range\nlimit_start:{limit_start}\nlimit_end:{limit_end}\n\n/limit reset",
        examples: [
            {
                example: "`/limit set top limit:250`",
                explanation: i18n.translate(
                    guildID,
                    "command.limit.help.example.singleLimit",
                    {
                        limit: String(250),
                    }
                ),
            },
            {
                example: "`/limit set range limit_start:250 limit_end:500`",
                explanation: i18n.translate(
                    guildID,
                    "command.limit.help.example.twoLimits",
                    { limitStart: String(250), limitEnd: String(500) }
                ),
            },
            {
                example: "`/limit reset`",
                explanation: i18n.translate(
                    guildID,
                    "command.limit.help.example.reset",
                    { defaultLimit: `\`${DEFAULT_LIMIT}\`` }
                ),
            },
        ],
        priority: 140,
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
                        "command.limit.help.interaction.description"
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "command.limit.help.interaction.description"
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND_GROUP,
                    options: [
                        {
                            name: LimitAppCommandAction.TOP,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.limit.help.interaction.description_top"
                            ),
                            description_localizations: {
                                [LocaleType.KO]: i18n.translate(
                                    LocaleType.KO,
                                    "command.limit.help.interaction.description_top"
                                ),
                            },
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "limit",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.limit.help.interaction.limit"
                                    ),
                                    description_localizations: {
                                        [LocaleType.KO]: i18n.translate(
                                            LocaleType.KO,
                                            "command.limit.help.interaction.limit"
                                        ),
                                    },
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: LIMIT_END_MAX,
                                    min_value: LIMIT_END_MIN,
                                },
                            ],
                        },
                        {
                            name: LimitAppCommandAction.RANGE,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.limit.help.interaction.description_range"
                            ),
                            description_localizations: {
                                [LocaleType.KO]: i18n.translate(
                                    LocaleType.KO,
                                    "command.limit.help.interaction.description_range"
                                ),
                            },
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "limit_start",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.limit.help.interaction.limit_start"
                                    ),
                                    description_localizations: {
                                        [LocaleType.KO]: i18n.translate(
                                            LocaleType.KO,
                                            "command.limit.help.interaction.limit_start"
                                        ),
                                    },
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: LIMIT_START_MAX,
                                    min_value: LIMIT_START_MIN,
                                },
                                {
                                    name: "limit_end",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.limit.help.interaction.limit_end"
                                    ),
                                    description_localizations: {
                                        [LocaleType.KO]: i18n.translate(
                                            LocaleType.KO,
                                            "command.limit.help.interaction.limit_end"
                                        ),
                                    },
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: LIMIT_END_MAX,
                                    min_value: LIMIT_END_MIN,
                                },
                            ],
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.limit.help.example.reset",
                        { defaultLimit: String(DEFAULT_LIMIT) }
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "command.limit.help.example.reset",
                            { defaultLimit: String(DEFAULT_LIMIT) }
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let limitStart: number | null;
        let limitEnd: number | null;

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
            limitEnd,
            undefined,
            true
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        limitStart: number | null,
        limitEnd: number | null,
        interaction?: Eris.CommandInteraction,
        optionsOnUpdate = true
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = limitStart == null && limitEnd == null;
        if (reset) {
            await guildPreference.reset(GameOption.LIMIT);
            logger.info(`${getDebugLogHeader(messageContext)} | Limit reset.`);
        } else {
            if (limitEnd === 0) {
                sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.limit.failure.invalidLimit.title"
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.limit.failure.invalidLimit.greaterThanZero.description"
                        ),
                    },
                    interaction
                );
                return;
            }

            if (limitStart === null || limitEnd === null) {
                logger.error(
                    `Unexpected null limitStart/limitEnd: ${limitStart} ${limitEnd}`
                );
                return;
            }

            if (limitEnd <= limitStart) {
                sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.limit.failure.invalidLimit.title"
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.limit.failure.invalidLimit.greaterThanStart.description"
                        ),
                    },
                    interaction
                );
                return;
            }

            await guildPreference.setLimit(limitStart, limitEnd);

            logger.info(
                `${getDebugLogHeader(messageContext)} | Limit set to ${
                    guildPreference.gameOptions.limitStart
                } - ${guildPreference.gameOptions.limitEnd}`
            );
        }

        if (optionsOnUpdate) {
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.LIMIT, reset }],
                false,
                undefined,
                undefined,
                interaction
            );
        }
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

        let limitStart: number | null;
        let limitEnd: number | null;

        if (interactionName === OptionAction.RESET) {
            limitStart = null;
            limitEnd = null;
        } else if (interactionName === LimitAppCommandAction.RANGE) {
            limitStart = interactionOptions["limit_start"];
            limitEnd = interactionOptions["limit_end"];
        } else if (interactionName === LimitAppCommandAction.TOP) {
            limitStart = 0;
            limitEnd = interactionOptions["limit"];
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            limitStart = null;
            limitEnd = null;
        }

        await LimitCommand.updateOption(
            messageContext,
            limitStart,
            limitEnd,
            interaction,
            true
        );
    }
}
