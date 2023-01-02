import { DEFAULT_OST_PREFERENCE, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import OstPreference from "../../enums/option_types/ost_preference";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("ost");

export default class OstCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
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
        name: "ost",
        description: i18n.translate(guildID, "command.ost.help.description"),
        usage: "/ost set\nost:[include | exclude | exclusive]\n\n/ost reset",
        examples: [
            {
                example: "`/ost set ost:include`",
                explanation: i18n.translate(
                    guildID,
                    "command.ost.help.example.include"
                ),
            },
            {
                example: "`/ost set ost:exclude`",
                explanation: i18n.translate(
                    guildID,
                    "command.ost.help.example.exclude"
                ),
            },
            {
                example: "`/ost set ost:exclusive`",
                explanation: i18n.translate(
                    guildID,
                    "command.ost.help.example.exclusive"
                ),
            },
            {
                example: "`/ost reset`",
                explanation: i18n.translate(
                    guildID,
                    "command.ost.help.example.reset",
                    { defaultOst: `\`${DEFAULT_OST_PREFERENCE}\`` }
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
                        "command.ost.help.description"
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "command.ost.help.description"
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "ost",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.ost.interaction.ost"
                            ),
                            description_localizations: {
                                [LocaleType.KO]: i18n.translate(
                                    LocaleType.KO,
                                    "command.ost.interaction.ost"
                                ),
                            },
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(OstPreference).map(
                                (ostPreference) => ({
                                    name: ostPreference,
                                    value: ostPreference,
                                })
                            ),
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "ost" }
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "misc.interaction.resetOption",
                            { optionName: "ost" }
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let ostPreference: OstPreference;

        if (parsedMessage.components.length === 0) {
            ostPreference = null;
        } else {
            ostPreference =
                parsedMessage.components[0].toLowerCase() as OstPreference;
        }

        await OstCommand.updateOption(
            MessageContext.fromMessage(message),
            ostPreference,
            null,
            ostPreference == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        ostPreference: OstPreference,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (reset) {
            await guildPreference.reset(GameOption.OST_PREFERENCE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | OST preference reset.`
            );
        } else {
            await guildPreference.setOstPreference(ostPreference);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | OST preference set to ${ostPreference}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.OST_PREFERENCE, reset }],
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

        let ostValue: OstPreference;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            ostValue = null;
        } else if (action === OptionAction.SET) {
            ostValue = interactionOptions["ost"] as OstPreference;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            ostValue = null;
        }

        await OstCommand.updateOption(
            messageContext,
            ostValue,
            interaction,
            ostValue == null
        );
    }
}
