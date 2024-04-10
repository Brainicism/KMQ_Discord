import { DEFAULT_MULTIGUESS_TYPE, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    clickableSlashCommand,
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
import MultiGuessType from "../../enums/option_types/multiguess_type";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "multiguess";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
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
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.multiguess.help.description",
            { on: `\`${MultiGuessType.ON}\`` },
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} multiguess:on`,
                explanation: i18n.translate(
                    guildID,
                    "command.multiguess.help.example.on",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} multiguess:off`,
                explanation: i18n.translate(
                    guildID,
                    "command.multiguess.help.example.off",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.multiguess.help.example.reset",
                    { defaultMultiguess: `\`${DEFAULT_MULTIGUESS_TYPE}\`` },
                ),
            },
        ],
        priority: 150,
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
                        "command.multiguess.help.interaction.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.multiguess.help.interaction.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "multiguess",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.multiguess.help.interaction.multiguess",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.multiguess.help.interaction.multiguess",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(MultiGuessType).map(
                                (multiguessType) => ({
                                    name: multiguessType,
                                    value: multiguessType,
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
                        { optionName: "multiguess" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "multiguess" },
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
        let multiGuessType: MultiGuessType | null;

        if (parsedMessage.components.length === 0) {
            multiGuessType = null;
        } else {
            multiGuessType =
                parsedMessage.components[0]!.toLowerCase() as MultiGuessType;
        }

        await MultiGuessCommand.updateOption(
            MessageContext.fromMessage(message),
            multiGuessType,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        multiguessType: MultiGuessType | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = multiguessType == null;

        if (reset) {
            await guildPreference.reset(GameOption.MULTIGUESS);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Multiguess type reset.`,
            );
        } else {
            await guildPreference.setMultiGuessType(multiguessType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Multiguess type set to ${multiguessType}`,
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.MULTIGUESS, reset }],
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

        let multiguessValue: MultiGuessType | null;

        const action = interactionName as OptionAction;
        switch (action) {
            case OptionAction.RESET:
                multiguessValue = null;
                break;
            case OptionAction.SET:
                multiguessValue = interactionOptions[
                    "multiguess"
                ] as MultiGuessType;
                break;
            default:
                logger.error(`Unexpected interaction name: ${interactionName}`);
                multiguessValue = null;
                break;
        }

        await MultiGuessCommand.updateOption(
            messageContext,
            multiguessValue,
            interaction,
        );
    }
}
