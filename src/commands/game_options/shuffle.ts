import {
    DEFAULT_SHUFFLE,
    EMBED_ERROR_COLOR,
    ExpBonusModifierValues,
    OptionAction,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { isUserPremium } from "../../helpers/game_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import ExpBonusModifier from "../../enums/exp_bonus_modifier";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import ShuffleType from "../../enums/option_types/shuffle_type";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("shuffle");

const PREMIUM_SHUFFLE_TYPES = [
    ShuffleType.WEIGHTED_EASY,
    ShuffleType.WEIGHTED_HARD,
];

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
        name: "shuffle",
        description: i18n.translate(
            guildID,
            "command.shuffle.help.description",
            {
                random: `\`${ShuffleType.RANDOM}\``,
            }
        ),
        usage: "/shuffle set\nshuffle:[random | popularity | weighted_easy | weighted_hard | chronological | reversechronological]\n\n/shuffle reset",
        examples: [
            {
                example: "`/shuffle set shuffle:random`",
                explanation: i18n.translate(
                    guildID,
                    "command.shuffle.help.example.random"
                ),
            },
            {
                example: "`/shuffle set shuffle:popularity`",
                explanation: i18n.translate(
                    guildID,
                    "command.shuffle.help.example.popularity",
                    {
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.SHUFFLE_POPULARITY
                            ]
                        }x`,
                    }
                ),
            },
            {
                example: "`/shuffle set shuffle:chronological`",
                explanation: i18n.translate(
                    guildID,
                    "command.shuffle.help.example.chronological",
                    {
                        penalty: `${
                            ExpBonusModifierValues[
                                ExpBonusModifier.SHUFFLE_CHRONOLOGICAL
                            ]
                        }x`,
                    }
                ),
            },
            {
                example: "`/shuffle reset`",
                explanation: i18n.translate(
                    guildID,
                    "command.shuffle.help.example.reset",
                    { defaultShuffle: `\`${DEFAULT_SHUFFLE}\`` }
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
                        "command.shuffle.help.description"
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.shuffle.help.description"
                                ),
                            }),
                            {}
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "shuffle",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.shuffle.interaction.shuffle"
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.shuffle.interaction.shuffle"
                                        ),
                                    }),
                                    {}
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(ShuffleType).map(
                                (shuffleType) => ({
                                    name: shuffleType,
                                    value: shuffleType,
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
                        { optionName: "shuffle" }
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "shuffle" }
                                ),
                            }),
                            {}
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
                parsedMessage.components[0].toLowerCase() as ShuffleType;
        }

        await ShuffleCommand.updateOption(
            MessageContext.fromMessage(message),
            shuffleType,
            undefined
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        shuffleType: ShuffleType | null,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (shuffleType && PREMIUM_SHUFFLE_TYPES.includes(shuffleType)) {
            if (!(await isUserPremium(messageContext.author.id))) {
                logger.info(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Non-premium user attempted to use shuffle option = ${shuffleType}`
                );

                const embedPayload: EmbedPayload = {
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.premium.option.description"
                    ),
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.premium.option.title"
                    ),
                    color: EMBED_ERROR_COLOR,
                };

                await sendErrorMessage(
                    messageContext,
                    embedPayload,
                    interaction
                );

                return;
            }
        }

        const reset = shuffleType == null;
        if (reset) {
            await guildPreference.reset(GameOption.SHUFFLE_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Shuffle type reset.`
            );
        } else {
            await guildPreference.setShuffleType(shuffleType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Shuffle type set to ${shuffleType}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.SHUFFLE_TYPE, reset }],
            false,
            undefined,
            undefined,
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

        let shuffleValue: ShuffleType | null;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            shuffleValue = null;
        } else if (action === OptionAction.SET) {
            shuffleValue = interactionOptions["shuffle"] as ShuffleType;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            shuffleValue = null;
        }

        await ShuffleCommand.updateOption(
            messageContext,
            shuffleValue,
            interaction
        );
    }

    resetPremium = async (guildPreference: GuildPreference): Promise<void> => {
        await guildPreference.reset(GameOption.SHUFFLE_TYPE);
    };

    isUsingPremiumOption = (guildPreference: GuildPreference): boolean =>
        PREMIUM_SHUFFLE_TYPES.includes(guildPreference.gameOptions.shuffleType);
}
