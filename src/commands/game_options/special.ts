import { EMBED_ERROR_COLOR, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
import { clickableSlashCommand } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { isUserPremium } from "../../helpers/game_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import SpecialType from "../../enums/option_types/special_type";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "special";
const logger = new IPCLogger(COMMAND_NAME);

export default class SpecialCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.premiumOrDebugServerPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "specialType",
                type: "enum" as const,
                enums: Object.values(SpecialType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.special.help.description",
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} special:reverse`,
                explanation: i18n.translate(
                    guildID,
                    "command.special.help.example.reverse",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} special:slow`,
                explanation: i18n.translate(
                    guildID,
                    "command.special.help.example.slow",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} special:fast`,
                explanation: i18n.translate(
                    guildID,
                    "command.special.help.example.fast",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} special:faster`,
                explanation: i18n.translate(
                    guildID,
                    "command.special.help.example.faster",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} special:lowpitch`,
                explanation: i18n.translate(
                    guildID,
                    "command.special.help.example.lowPitch",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} special:highpitch`,
                explanation: i18n.translate(
                    guildID,
                    "command.special.help.example.highPitch",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} special:nightcore`,
                explanation: i18n.translate(
                    guildID,
                    "command.special.help.example.nightcore",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.special.help.example.reset",
                ),
            },
        ],
        priority: 130,
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
                        "command.special.help.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.special.help.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "special",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.special.interaction.special",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.special.interaction.special",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(SpecialType).map(
                                (specialType) => ({
                                    name: specialType,
                                    value: specialType,
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
                        { optionName: "special" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "special" },
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
        let specialType: SpecialType | null;
        if (parsedMessage.components.length === 0) {
            specialType = null;
        } else {
            specialType = parsedMessage.components[0] as SpecialType;
        }

        await SpecialCommand.updateOption(
            MessageContext.fromMessage(message),
            specialType,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        specialType: SpecialType | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (
            process.env.DEBUG_SERVER_ID !== messageContext.guildID &&
            !(await isUserPremium(messageContext.author.id))
        ) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Non-premium user attempted to use premium special option`,
            );

            const embedPayload: EmbedPayload = {
                description: i18n.translate(
                    messageContext.guildID,
                    "command.premium.option.description_kmq_server",
                ),
                title: i18n.translate(
                    messageContext.guildID,
                    "command.premium.option.title",
                ),
                color: EMBED_ERROR_COLOR,
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return;
        }

        const reset = specialType == null;
        if (reset) {
            await guildPreference.reset(GameOption.SPECIAL_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Special type reset.`,
            );
        } else {
            await guildPreference.setSpecialType(specialType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Special type set to ${specialType}`,
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.SPECIAL_TYPE, reset }],
            false,
            undefined,
            undefined,
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

        let specialValue: SpecialType | null;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            specialValue = null;
        } else if (action === OptionAction.SET) {
            specialValue = interactionOptions["special"] as SpecialType;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            specialValue = null;
        }

        await SpecialCommand.updateOption(
            messageContext,
            specialValue,
            interaction,
        );
    }

    resetPremium = async (guildPreference: GuildPreference): Promise<void> => {
        if (guildPreference.guildID !== process.env.DEBUG_SERVER_ID) {
            await guildPreference.reset(GameOption.SPECIAL_TYPE);
        }
    };

    isUsingPremiumOption = (guildPreference: GuildPreference): boolean =>
        guildPreference.guildID !== process.env.DEBUG_SERVER_ID &&
        guildPreference.gameOptions.specialType !== null;
}
