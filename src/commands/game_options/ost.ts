import { DEFAULT_OST_PREFERENCE } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateEmbed,
    generateOptionsMessage,
    getDebugLogHeader,
    sendOptionsMessage,
    tryCreateInteractionSuccessAcknowledgement,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import OstPreference from "../../enums/option_types/ost_preference";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("ost");

export default class OstCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

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
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.ost.help.description"
        ),
        usage: ",ost [include | exclude | exclusive]",
        examples: [
            {
                example: "`,ost include`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.ost.help.example.include"
                ),
            },
            {
                example: "`,ost exclude`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.ost.help.example.exclude"
                ),
            },
            {
                example: "`,ost exclusive`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.ost.help.example.exclusive"
                ),
            },
            {
                example: "`,ost`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.ost.help.example.reset",
                    { defaultOst: `\`${DEFAULT_OST_PREFERENCE}\`` }
                ),
            },
        ],
        priority: 130,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "ost",
            description: LocalizationManager.localizer.translateByLocale(
                LocaleType.EN,
                "command.ost.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "ost",
                    description:
                        LocalizationManager.localizer.translateByLocale(
                            LocaleType.EN,
                            "command.ost.help.description"
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
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
            ostPreference
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        ostPreference: OstPreference,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = ostPreference === null;
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

        if (interaction) {
            const message = await generateOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.OST_PREFERENCE, reset }]
            );

            const embed = generateEmbed(messageContext, message, true);
            tryCreateInteractionSuccessAcknowledgement(
                interaction,
                null,
                null,
                { embeds: [embed] }
            );
        } else {
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.OST_PREFERENCE, reset }]
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
        const ostPreference = interaction.data.options[0][
            "value"
        ] as OstPreference;

        await OstCommand.updateOption(
            messageContext,
            ostPreference,
            interaction
        );
    }
}
