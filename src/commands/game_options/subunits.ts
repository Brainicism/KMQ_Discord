import { DEFAULT_SUBUNIT_PREFERENCE } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateOptionsMessage,
    getDebugLogHeader,
    sendOptionsMessage,
    tryCreateInteractionCustomPayloadAcknowledgement,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import SubunitsPreference from "../../enums/option_types/subunit_preference";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("subunits");

export default class SubunitsCommand implements BaseCommand {
    aliases = ["subunit", "su"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "subunitPreference",
                type: "enum" as const,
                enums: Object.values(SubunitsPreference),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "subunits",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.subunits.help.description",
            { groups: `\`${process.env.BOT_PREFIX}groups\`` }
        ),
        usage: ",subunits [include | exclude]",
        examples: [
            {
                example: "`,subunits include`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.subunits.help.example.include",
                    {
                        groupCommand: `${process.env.BOT_PREFIX}groups`,
                        parentGroup: "BTS",
                        subunitOne: "J-Hope",
                        subunitTwo: "RM",
                    }
                ),
            },
            {
                example: "`,subunits exclude`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.subunits.help.example.exclude"
                ),
            },
            {
                example: "`,subunits`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.subunits.help.example.reset",
                    { defaultSubunit: `\`${DEFAULT_SUBUNIT_PREFERENCE}\`` }
                ),
            },
        ],
        priority: 130,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "subunits",
            description: LocalizationManager.localizer.translateByLocale(
                LocaleType.EN,
                "command.subunits.help.description",
                { groups: `\`${process.env.BOT_PREFIX}groups\`` }
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "subunits",
                    description:
                        LocalizationManager.localizer.translateByLocale(
                            LocaleType.EN,
                            "command.subunits.help.description",
                            { groups: `\`${process.env.BOT_PREFIX}groups\`` }
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                    choices: Object.values(SubunitsPreference).map(
                        (subunitPreference) => ({
                            name: subunitPreference,
                            value: subunitPreference,
                        })
                    ),
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let subunitsPreference: SubunitsPreference;

        if (parsedMessage.components.length === 0) {
            subunitsPreference = null;
        } else {
            subunitsPreference =
                parsedMessage.components[0].toLowerCase() as SubunitsPreference;
        }

        await SubunitsCommand.updateOption(
            MessageContext.fromMessage(message),
            subunitsPreference
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        subunitsPreference: SubunitsPreference,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = subunitsPreference === null;
        if (reset) {
            await guildPreference.reset(GameOption.SUBUNIT_PREFERENCE);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Subunit preference reset.`
            );
        } else {
            await guildPreference.setSubunitPreference(subunitsPreference);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Subunit preference set to ${subunitsPreference}`
            );
        }

        if (interaction) {
            const embedPayload = await generateOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.SUBUNIT_PREFERENCE, reset }]
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
                [{ option: GameOption.SUBUNIT_PREFERENCE, reset }]
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
        const subunitsPreference = interaction.data.options[0][
            "value"
        ] as SubunitsPreference;

        await SubunitsCommand.updateOption(
            messageContext,
            subunitsPreference,
            interaction
        );
    }
}
