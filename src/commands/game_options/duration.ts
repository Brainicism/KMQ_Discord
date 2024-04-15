import { IPCLogger } from "../../logger";
import {
    clickableSlashCommand,
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

const COMMAND_NAME = "duration";
const logger = new IPCLogger(COMMAND_NAME);

enum DurationAction {
    ADD = "add",
    REMOVE = "remove",
}

enum DurationActionInternal {
    ADD = "add",
    REMOVE = "remove",
    RESET = "reset",
    SET = "set",
}

// eslint-disable-next-line import/no-unused-modules
export default class DurationCommand implements BaseCommand {
    static DURATION_DELTA_MIN = 2;
    static DURATION_DELTA_MAX = 600;
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "duration",
                type: "int" as const,
                minValue: DurationCommand.DURATION_DELTA_MIN,
                maxValue: DurationCommand.DURATION_DELTA_MAX,
            },
            {
                name: "action",
                type: "enum" as const,
                enums: Object.values(DurationAction),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.duration.help.description",
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    DurationActionInternal.SET,
                )} duration:15`,
                explanation: i18n.translate(
                    guildID,
                    "command.duration.help.example.set",
                    {
                        duration: String(15),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    DurationActionInternal.ADD,
                )} duration:5`,
                explanation: i18n.translate(
                    guildID,
                    "command.duration.help.example.increment",
                    {
                        duration: String(5),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    DurationActionInternal.REMOVE,
                )} duration:5`,
                explanation: i18n.translate(
                    guildID,
                    "command.duration.help.example.decrement",
                    {
                        duration: String(5),
                    },
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    DurationActionInternal.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.duration.help.example.reset",
                ),
            },
        ],
        priority: 110,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: DurationActionInternal.SET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.duration.help.example.set",
                        { duration: "[duration]" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.duration.help.example.set",
                                    { duration: "[duration]" },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.duration.interaction.durationSet",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.duration.interaction.durationSet",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            min_value: DurationCommand.DURATION_DELTA_MIN,
                            max_value: DurationCommand.DURATION_DELTA_MAX,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                        },
                    ],
                },
                {
                    name: DurationActionInternal.ADD,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.duration.help.example.increment",
                        { duration: "[duration]" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.duration.help.example.increment",
                                    { duration: "[duration]" },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.duration.interaction.durationAdd",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.duration.interaction.durationAdd",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            min_value: DurationCommand.DURATION_DELTA_MIN,
                            max_value: DurationCommand.DURATION_DELTA_MAX,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                        },
                    ],
                },
                {
                    name: DurationActionInternal.REMOVE,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.duration.help.example.decrement",
                        { duration: "[duration]" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.duration.help.example.decrement",
                                    { duration: "[duration]" },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.duration.interaction.durationRemove",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.duration.interaction.durationRemove",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            min_value: DurationCommand.DURATION_DELTA_MIN,
                            max_value: DurationCommand.DURATION_DELTA_MAX,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                        },
                    ],
                },
                {
                    name: DurationActionInternal.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "duration" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "duration" },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let durationActionInternal: DurationActionInternal | undefined;
        let durationValue: number | undefined;

        if (parsedMessage.components.length === 0) {
            durationActionInternal = DurationActionInternal.RESET;
        } else {
            durationActionInternal = (parsedMessage.components[1] ??
                DurationActionInternal.SET) as DurationActionInternal;
            durationValue = parseInt(parsedMessage.components[0]!, 10);
        }

        await DurationCommand.updateOption(
            MessageContext.fromMessage(message),
            durationActionInternal,
            durationValue,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        action: DurationActionInternal,
        durationValue?: number,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        let finalDuration: number;
        const reset = action === DurationActionInternal.RESET;
        if (reset) {
            await guildPreference.reset(GameOption.DURATION);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Duration disabled.`,
            );

            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.DURATION, reset: true }],
                false,
                undefined,
                interaction,
            );
            return;
        } else {
            if (durationValue === undefined) {
                logger.error("durationValue unexpectedly undefined");
                return;
            }

            const currentDuration = guildPreference.isDurationSet()
                ? guildPreference.gameOptions.duration
                : 0;

            switch (action) {
                case DurationActionInternal.ADD:
                    finalDuration = currentDuration + durationValue;
                    break;
                case DurationActionInternal.REMOVE:
                    if (!guildPreference.isDurationSet()) {
                        await sendErrorMessage(
                            messageContext,
                            {
                                title: i18n.translate(
                                    messageContext.guildID,
                                    "command.duration.failure.removingDuration.title",
                                ),
                                description: i18n.translate(
                                    messageContext.guildID,
                                    "command.duration.failure.removingDuration.notSet.description",
                                ),
                            },
                            interaction,
                        );
                        return;
                    }

                    finalDuration = currentDuration - durationValue;
                    if (finalDuration < 2) {
                        await sendErrorMessage(
                            messageContext,
                            {
                                title: i18n.translate(
                                    messageContext.guildID,
                                    "command.duration.failure.removingDuration.title",
                                ),
                                description: i18n.translate(
                                    messageContext.guildID,
                                    "command.duration.failure.removingDuration.tooShort.description",
                                ),
                            },
                            interaction,
                        );
                    }

                    break;
                case DurationActionInternal.SET:
                    finalDuration = durationValue;
                    break;
                default:
                    logger.error(
                        `Unexpected duration action internal: ${action}`,
                    );
                    return;
            }

            logger.info(
                `${getDebugLogHeader(messageContext)} | Duration set to ${
                    guildPreference.gameOptions.duration
                }`,
            );
        }

        await guildPreference.setDuration(finalDuration);
        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.DURATION, reset: false }],
            false,
            undefined,
            interaction,
        );
    }

    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        const action = interactionName as DurationActionInternal;
        let durationValue: number | undefined;

        if (action === DurationActionInternal.RESET) {
            durationValue = undefined;
        } else if (
            [
                DurationActionInternal.ADD,
                DurationActionInternal.REMOVE,
                DurationActionInternal.SET,
            ].includes(action)
        ) {
            durationValue = interactionOptions["duration"];
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            durationValue = undefined;
        }

        await DurationCommand.updateOption(
            messageContext,
            action,
            durationValue,
            interaction,
        );
    }
}
