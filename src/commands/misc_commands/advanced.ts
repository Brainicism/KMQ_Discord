import { IPCLogger } from "../../logger";
import { OptionAction } from "../../constants";
import { bold } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendDeprecatedTextCommandMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import AdvancedCommandActionName from "../../enums/advanced_setting_action_name";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "advanced";
const logger = new IPCLogger(COMMAND_NAME);

const MAX_MULTIGUESS_DELAY = 60;
const MAX_SONG_START_DELAY = 60;

export default class AdvancedSettingCommand implements BaseCommand {
    validations = {
        arguments: [],
        maxArgCount: 0,
        minArgCount: 0,
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.advanced.help.description",
        ),
        examples: [],
        priority: 500,
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
                        "command.advanced.help.interaction.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.advanced.help.interaction.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND_GROUP,
                    options: [
                        {
                            name: AdvancedCommandActionName.MULTIGUESS_DELAY,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.advanced.help.interaction.description_multiguess_delay",
                            ),

                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.advanced.help.interaction.description_multiguess_delay",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "delay",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.advanced.help.interaction.description_multiguess_delay",
                                    ),

                                    description_localizations: Object.values(
                                        LocaleType,
                                    )
                                        .filter((x) => x !== LocaleType.EN)
                                        .reduce(
                                            (acc, locale) => ({
                                                ...acc,
                                                [locale]: i18n.translate(
                                                    locale,
                                                    "command.advanced.help.interaction.description_multiguess_delay",
                                                ),
                                            }),
                                            {},
                                        ),

                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.NUMBER,
                                    required: true,
                                    max_value: MAX_MULTIGUESS_DELAY,
                                    min_value: 0,
                                },
                            ],
                        },
                        {
                            name: AdvancedCommandActionName.SONG_START_DELAY,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.advanced.help.interaction.description_song_start_delay",
                            ),

                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.advanced.help.interaction.description_song_start_delay",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "delay",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.advanced.help.interaction.description_song_start_delay",
                                    ),

                                    description_localizations: Object.values(
                                        LocaleType,
                                    )
                                        .filter((x) => x !== LocaleType.EN)
                                        .reduce(
                                            (acc, locale) => ({
                                                ...acc,
                                                [locale]: i18n.translate(
                                                    locale,
                                                    "command.advanced.help.interaction.description_song_start_delay",
                                                ),
                                            }),
                                            {},
                                        ),

                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.NUMBER,
                                    required: true,
                                    max_value: MAX_SONG_START_DELAY,
                                    min_value: 0,
                                },
                            ],
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.advanced.help.example.reset",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.advanced.help.example.reset",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
            ],
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        logger.warn("Text-based command not supported for advanced settings");
        await sendDeprecatedTextCommandMessage(
            MessageContext.fromMessage(message),
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        settingName: AdvancedCommandActionName,
        settingValue: number | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = settingValue == null;
        if (reset) {
            await guildPreference.resetAdvancedSettings();
            logger.info(
                `${getDebugLogHeader(messageContext)} | Advanced settings reset.`,
            );
        } else {
            await guildPreference.updateAdvancedSetting(
                settingName,
                settingValue,
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Advanced setting (${settingName}) set to ${settingValue}`,
            );
        }

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.advanced.optionUpdated.title",
                ),
                description: `${Object.entries(
                    guildPreference.gameOptions.advancedSettings,
                )
                    .map(([key, val]) => `${bold(key)}: ${val}`)
                    .join("\n")}`,
            },
            true,
            undefined,
            [],
            interaction,
        );
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

        const advancedSettingName =
            interactionName as AdvancedCommandActionName;

        let value: number | null = null;
        if (interactionName === OptionAction.RESET) {
            value = null;
        } else {
            switch (interactionName) {
                case AdvancedCommandActionName.MULTIGUESS_DELAY:
                    value = interactionOptions["delay"];
                    break;
                case AdvancedCommandActionName.SONG_START_DELAY:
                    value = interactionOptions["delay"];
                    break;
                default:
                    logger.error(
                        `Unexpected AdvancedCommandAction: ${interactionName}`,
                    );
                    break;
            }
        }

        await AdvancedSettingCommand.updateOption(
            messageContext,
            advancedSettingName,
            value,
            interaction,
        );
    }
}
