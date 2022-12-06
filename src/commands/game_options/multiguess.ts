import { DEFAULT_MULTIGUESS_TYPE, OptionAction } from "../../constants";
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
        usage: "/multiguess set\nmultiguess:[on | off]\n\n/multiguess reset",
        examples: [
            {
                example: "`,multiguess set multiguess:on`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.on"
                ),
            },
            {
                example: "`,multiguess set multiguess:off`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.off"
                ),
            },
            {
                example: "`,multiguess reset`",
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
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.multiguess.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.multiguess.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "multiguess",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.multiguess.interaction.multiguess"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
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
                {
                    name: OptionAction.RESET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "multiguess" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
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
            multiGuessType,
            null,
            multiGuessType == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        multiguessType: MultiGuessType,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

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

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.MULTIGUESS, reset }],
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

        let multiguessValue: MultiGuessType;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            multiguessValue = null;
        } else if (action === OptionAction.SET) {
            multiguessValue = interactionOptions[
                "multiguess"
            ] as MultiGuessType;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            multiguessValue = null;
        }

        await MultiGuessCommand.updateOption(
            messageContext,
            multiguessValue,
            interaction,
            multiguessValue == null
        );
    }
}
