import {
    DEFAULT_SHUFFLE,
    ExpBonusModifierValues,
    OptionAction,
} from "../../constants.js";
import { IPCLogger } from "../../logger.js";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendOptionsMessage,
} from "../../helpers/discord_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import * as Eris from "eris";
import ExpBonusModifier from "../../enums/exp_bonus_modifier.js";
import GameOption from "../../enums/game_option_name.js";
import GuildPreference from "../../structures/guild_preference.js";
import LocaleType from "../../enums/locale_type.js";
import MessageContext from "../../structures/message_context.js";
import Session from "../../structures/session.js";
import ShuffleType from "../../enums/option_types/shuffle_type.js";
import i18n from "../../helpers/localization_manager.js";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "shuffle";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class ShuffleCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "shuffleType",
                type: "enum" as const,
                enums: Object.values(ShuffleType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.shuffle.help.description",
            {
                random: `\`${ShuffleType.RANDOM}\``,
            },
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} shuffle:random`,
                explanation: i18n.translate(
                    guildID,
                    "command.shuffle.help.example.random",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} shuffle:popularity`,
                explanation: i18n.translate(
                    guildID,
                    "command.shuffle.help.example.popularity",
                    {
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.SHUFFLE_POPULARITY
                            ]
                        }x`,
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} shuffle:chronological`,
                explanation: i18n.translate(
                    guildID,
                    "command.shuffle.help.example.chronological",
                    {
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.SHUFFLE_CHRONOLOGICAL
                            ]
                        }x`,
                    },
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.shuffle.help.example.reset",
                    { defaultShuffle: `\`${DEFAULT_SHUFFLE}\`` },
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
                    name: OptionAction.SET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.shuffle.help.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.shuffle.help.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "shuffle",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.shuffle.interaction.shuffle",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.shuffle.interaction.shuffle",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(ShuffleType).map(
                                (shuffleType) => ({
                                    name: shuffleType,
                                    value: shuffleType,
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
                        { optionName: "shuffle" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "shuffle" },
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
        let shuffleType: ShuffleType | null;
        if (parsedMessage.components.length === 0) {
            shuffleType = null;
        } else {
            shuffleType =
                parsedMessage.components[0]!.toLowerCase() as ShuffleType;
        }

        await ShuffleCommand.updateOption(
            MessageContext.fromMessage(message),
            shuffleType,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        shuffleType: ShuffleType | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = shuffleType == null;
        if (reset) {
            await guildPreference.reset(GameOption.SHUFFLE_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Shuffle type reset.`,
            );
        } else {
            await guildPreference.setShuffleType(shuffleType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Shuffle type set to ${shuffleType}`,
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.SHUFFLE_TYPE, reset }],
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

        let shuffleValue: ShuffleType | null;

        const action = interactionName as OptionAction;
        switch (action) {
            case OptionAction.RESET:
                shuffleValue = null;
                break;
            case OptionAction.SET:
                shuffleValue = interactionOptions["shuffle"] as ShuffleType;
                break;
            default:
                logger.error(`Unexpected interaction name: ${interactionName}`);
                shuffleValue = null;
                break;
        }

        await ShuffleCommand.updateOption(
            messageContext,
            shuffleValue,
            interaction,
        );
    }
}
