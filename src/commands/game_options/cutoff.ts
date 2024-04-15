import {
    DEFAULT_BEGINNING_SEARCH_YEAR,
    DEFAULT_ENDING_SEARCH_YEAR,
    EARLIEST_BEGINNING_SEARCH_YEAR,
    OptionAction,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "cutoff";
const logger = new IPCLogger(COMMAND_NAME);

enum CutoffAppCommandAction {
    EARLIEST = "earliest",
    RANGE = "range",
}

// eslint-disable-next-line import/no-unused-modules
export default class CutoffCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notPlaylistPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "cutoff_start",
                type: "int" as const,
                minValue: EARLIEST_BEGINNING_SEARCH_YEAR,
                maxValue: DEFAULT_ENDING_SEARCH_YEAR,
            },
            {
                name: "cutoff_end",
                type: "int" as const,
                minValue: EARLIEST_BEGINNING_SEARCH_YEAR,
                maxValue: DEFAULT_ENDING_SEARCH_YEAR,
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.cutoff.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                    CutoffAppCommandAction.EARLIEST,
                )} beginning_year:2015`,
                explanation: i18n.translate(
                    guildID,
                    "command.cutoff.help.example.singleCutoff",
                    {
                        year: String(2015),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                    CutoffAppCommandAction.RANGE,
                )} beginning_year:2015 ending_year:2018`,
                explanation: i18n.translate(
                    guildID,
                    "command.cutoff.help.example.twoCutoffs",
                    {
                        beginningYear: String(2015),
                        endingYear: String(2018),
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
                    "command.cutoff.help.example.reset",
                    {
                        defaultBeginningSearchYear: String(
                            DEFAULT_BEGINNING_SEARCH_YEAR,
                        ),
                        defaultEndSearchYear: String(
                            DEFAULT_ENDING_SEARCH_YEAR,
                        ),
                    },
                ),
            },
        ],
        priority: 140,
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
                        "command.cutoff.help.interaction.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.cutoff.help.interaction.description",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND_GROUP,
                    options: [
                        {
                            name: CutoffAppCommandAction.EARLIEST,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.cutoff.help.interaction.earliestOption",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.cutoff.help.interaction.earliestOption",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "beginning_year",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.cutoff.help.interaction.beginningYear",
                                    ),
                                    description_localizations: Object.values(
                                        LocaleType,
                                    )
                                        .filter((x) => x !== LocaleType.EN)
                                        .reduce(
                                            (acc, locale) => ({
                                                ...acc,
                                                [locale]: i18n.translate(
                                                    locale,
                                                    "command.cutoff.help.interaction.beginningYear",
                                                ),
                                            }),
                                            {},
                                        ),
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: DEFAULT_ENDING_SEARCH_YEAR,
                                    min_value: EARLIEST_BEGINNING_SEARCH_YEAR,
                                },
                            ],
                        },
                        {
                            name: CutoffAppCommandAction.RANGE,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.cutoff.help.interaction.rangeOption",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.cutoff.help.interaction.rangeOption",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "beginning_year",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.cutoff.help.interaction.beginningYear",
                                    ),
                                    description_localizations: Object.values(
                                        LocaleType,
                                    )
                                        .filter((x) => x !== LocaleType.EN)
                                        .reduce(
                                            (acc, locale) => ({
                                                ...acc,
                                                [locale]: i18n.translate(
                                                    locale,
                                                    "command.cutoff.help.interaction.beginningYear",
                                                ),
                                            }),
                                            {},
                                        ),
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: DEFAULT_ENDING_SEARCH_YEAR,
                                    min_value: EARLIEST_BEGINNING_SEARCH_YEAR,
                                },
                                {
                                    name: "ending_year",
                                    description: i18n.translate(
                                        LocaleType.EN,
                                        "command.cutoff.help.interaction.endingYear",
                                    ),
                                    description_localizations: Object.values(
                                        LocaleType,
                                    )
                                        .filter((x) => x !== LocaleType.EN)
                                        .reduce(
                                            (acc, locale) => ({
                                                ...acc,
                                                [locale]: i18n.translate(
                                                    locale,
                                                    "command.cutoff.help.interaction.endingYear",
                                                ),
                                            }),
                                            {},
                                        ),
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: DEFAULT_ENDING_SEARCH_YEAR,
                                    min_value: EARLIEST_BEGINNING_SEARCH_YEAR,
                                },
                            ],
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "cutoff" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "cutoff" },
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let beginningYear: number | null = null;
        let endingYear: number | null = null;
        const yearRange = parsedMessage.components;

        if (yearRange.length === 0) {
            beginningYear = null;
            endingYear = null;
        } else if (yearRange.length === 1) {
            beginningYear = parseInt(yearRange[0]!, 10);
        } else {
            beginningYear = parseInt(yearRange[0]!, 10);
            endingYear = parseInt(yearRange[1]!, 10);
        }

        await CutoffCommand.updateOption(
            MessageContext.fromMessage(message),
            beginningYear,
            endingYear,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        beginningYear: number | null,
        endingYear: number | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = beginningYear == null && endingYear == null;

        if (reset) {
            await guildPreference.setBeginningCutoffYear(
                DEFAULT_BEGINNING_SEARCH_YEAR,
            );
            await guildPreference.setEndCutoffYear(DEFAULT_ENDING_SEARCH_YEAR);
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.CUTOFF, reset: true }],
                false,
                undefined,
                interaction,
            );

            logger.info(
                `${getDebugLogHeader(messageContext)} | Cutoff set to ${
                    guildPreference.gameOptions.beginningYear
                } - ${guildPreference.gameOptions.endYear}`,
            );

            return;
        }

        if (beginningYear && !endingYear) {
            await guildPreference.setBeginningCutoffYear(beginningYear);
            await guildPreference.setEndCutoffYear(DEFAULT_ENDING_SEARCH_YEAR);
        } else {
            if (beginningYear === null || endingYear === null) {
                logger.error(
                    `Unexpected null beginningYear or ending year: ${beginningYear} ${endingYear}`,
                );
                return;
            }

            if (endingYear < beginningYear) {
                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.cutoff.failure.invalidEndYear.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.cutoff.failure.invalidEndYear.description",
                        ),
                    },
                    interaction,
                );
                return;
            }

            await guildPreference.setBeginningCutoffYear(beginningYear);
            await guildPreference.setEndCutoffYear(endingYear);
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.CUTOFF, reset: false }],
            false,
            undefined,
            interaction,
        );

        logger.info(
            `${getDebugLogHeader(messageContext)} | Cutoff set to ${
                guildPreference.gameOptions.beginningYear
            } - ${guildPreference.gameOptions.endYear}`,
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

        let beginningYear: number | null;
        let endingYear: number | null;
        if (interactionName === OptionAction.RESET) {
            beginningYear = null;
            endingYear = null;
        } else if (interactionName === CutoffAppCommandAction.RANGE) {
            beginningYear = interactionOptions["beginning_year"];
            endingYear = interactionOptions["ending_year"];
        } else if (interactionName === CutoffAppCommandAction.EARLIEST) {
            beginningYear = interactionOptions["beginning_year"];
            endingYear = null;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            beginningYear = null;
            endingYear = null;
        }

        await CutoffCommand.updateOption(
            messageContext,
            beginningYear,
            endingYear,
            interaction,
        );
    }
}
