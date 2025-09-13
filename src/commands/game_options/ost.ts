import { DEFAULT_OST_PREFERENCE, OptionAction } from "../../constants.js";
import { IPCLogger } from "../../logger.js";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendOptionsMessage,
} from "../../helpers/discord_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import * as Eris from "eris";
import GameOption from "../../enums/game_option_name.js";
import GuildPreference from "../../structures/guild_preference.js";
import LocaleType from "../../enums/locale_type.js";
import MessageContext from "../../structures/message_context.js";
import OstPreference from "../../enums/option_types/ost_preference.js";
import Session from "../../structures/session.js";
import i18n from "../../helpers/localization_manager.js";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "ost";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class OstCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notPlaylistPrecheck },
    ];

    aliases = ["osts"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "ostPreference",
                type: "enum" as const,
                enums: Object.values(OstPreference),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.ost.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} ost:include`,
                explanation: i18n.translate(
                    guildID,
                    "command.ost.help.example.include",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} ost:exclude`,
                explanation: i18n.translate(
                    guildID,
                    "command.ost.help.example.exclude",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} ost:exclusive`,
                explanation: i18n.translate(
                    guildID,
                    "command.ost.help.example.exclusive",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.ost.help.example.reset",
                    { defaultOst: `\`${DEFAULT_OST_PREFERENCE}\`` },
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
                        "command.ost.help.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.ost.help.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "ost",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.ost.interaction.ost",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.ost.interaction.ost",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(OstPreference).map(
                                (ostPreference) => ({
                                    name: ostPreference,
                                    value: ostPreference,
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
                        { optionName: "ost" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "ost" },
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
        let ostPreference: OstPreference | null;

        if (parsedMessage.components.length === 0) {
            ostPreference = null;
        } else {
            ostPreference =
                parsedMessage.components[0]!.toLowerCase() as OstPreference;
        }

        await OstCommand.updateOption(
            MessageContext.fromMessage(message),
            ostPreference,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        ostPreference: OstPreference | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = ostPreference == null;
        if (reset) {
            await guildPreference.reset(GameOption.OST_PREFERENCE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | OST preference reset.`,
            );
        } else {
            await guildPreference.setOstPreference(ostPreference);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | OST preference set to ${ostPreference}`,
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.OST_PREFERENCE, reset }],
            false,
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

        let ostValue: OstPreference | null;
        const action = interactionName as OptionAction;
        switch (action) {
            case OptionAction.RESET:
                ostValue = null;
                break;
            case OptionAction.SET:
                ostValue = interactionOptions["ost"] as OstPreference;

                break;
            default:
                logger.error(`Unexpected interaction name: ${interactionName}`);
                ostValue = null;
                break;
        }

        await OstCommand.updateOption(messageContext, ostValue, interaction);
    }
}
