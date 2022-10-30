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
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import ShuffleType from "../../enums/option_types/shuffle_type";
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
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.shuffle.help.description",
            {
                random: `\`${ShuffleType.RANDOM}\``,
            }
        ),
        usage: ",shuffle [random | popularity]",
        examples: [
            {
                example: "`,shuffle random`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.shuffle.help.example.random"
                ),
            },
            {
                example: "`,shuffle popularity`",
                explanation: LocalizationManager.localizer.translate(
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
                example: "`,shuffle`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.shuffle.help.example.reset",
                    { defaultShuffle: `\`${DEFAULT_SHUFFLE}\`` }
                ),
            },
        ],
        priority: 110,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "shuffle",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.shuffle.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.shuffle.help.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "shuffle",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.shuffle.help.description"
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
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.shuffle.help.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let shuffleType: ShuffleType;
        if (parsedMessage.components.length === 0) {
            shuffleType = null;
        } else {
            shuffleType =
                parsedMessage.components[0].toLowerCase() as ShuffleType;
        }

        await ShuffleCommand.updateOption(
            MessageContext.fromMessage(message),
            shuffleType,
            null,
            shuffleType == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        shuffleType: ShuffleType,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (PREMIUM_SHUFFLE_TYPES.includes(shuffleType)) {
            if (!(await isUserPremium(messageContext.author.id))) {
                logger.info(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Non-premium user attempted to use shuffle option = ${shuffleType}`
                );

                const embedPayload: EmbedPayload = {
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.premium.option.description"
                    ),
                    title: LocalizationManager.localizer.translate(
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

        let shuffleValue: ShuffleType;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            shuffleValue = null;
        } else if (action === OptionAction.SET) {
            shuffleValue = interactionOptions["shuffle"] as ShuffleType;
        }

        await ShuffleCommand.updateOption(
            messageContext,
            shuffleValue,
            interaction,
            shuffleValue == null
        );
    }

    resetPremium = async (guildPreference: GuildPreference): Promise<void> => {
        await guildPreference.reset(GameOption.SHUFFLE_TYPE);
    };

    isUsingPremiumOption = (guildPreference: GuildPreference): boolean =>
        PREMIUM_SHUFFLE_TYPES.includes(guildPreference.gameOptions.shuffleType);
}
