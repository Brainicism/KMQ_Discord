import { DEFAULT_MULTIGUESS_TYPE } from "../../constants";
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
import MultiGuessType from "../../enums/option_types/multiguess_type";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("multiguess");
export default class MultiGuessCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "multiguess_type",
                type: "enum" as const,
                enums: Object.values(MultiGuessType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "multiguess",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.multiguess.help.description",
            { on: `\`${MultiGuessType.ON}\`` }
        ),
        usage: ",multiguess [on | off]",
        examples: [
            {
                example: "`,multiguess on`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.on"
                ),
            },
            {
                example: "`,multiguess off`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.off"
                ),
            },
            {
                example: "`,multiguess`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.reset",
                    { defaultMultiguess: `\`${DEFAULT_MULTIGUESS_TYPE}\`` }
                ),
            },
        ],
        priority: 150,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "multiguess",
            description: LocalizationManager.localizer.translateByLocale(
                LocaleType.EN,
                "command.multiguess.help.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "multiguess",
                    description:
                        LocalizationManager.localizer.translateByLocale(
                            LocaleType.EN,
                            "command.multiguess.help.interaction.description"
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                    choices: Object.values(MultiGuessType).map(
                        (multiguessType) => ({
                            name: multiguessType,
                            value: multiguessType,
                        })
                    ),
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let multiGuessType: MultiGuessType;

        if (parsedMessage.components.length === 0) {
            multiGuessType = null;
        } else {
            multiGuessType =
                parsedMessage.components[0].toLowerCase() as MultiGuessType;
        }

        await MultiGuessCommand.updateOption(
            MessageContext.fromMessage(message),
            multiGuessType
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        multiguessType: MultiGuessType,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = multiguessType === null;
        if (reset) {
            await guildPreference.reset(GameOption.MULTIGUESS);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Multiguess type reset.`
            );
        } else {
            await guildPreference.setMultiGuessType(multiguessType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Multiguess type set to ${multiguessType}`
            );
        }

        if (interaction) {
            const embedPayload = await generateOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.MULTIGUESS, reset }]
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
                [{ option: GameOption.MULTIGUESS, reset }]
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
        const multiguessType = interaction.data.options[0][
            "value"
        ] as MultiGuessType;

        await MultiGuessCommand.updateOption(
            messageContext,
            multiguessType,
            interaction
        );
    }
}
