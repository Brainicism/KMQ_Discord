import {
    DEFAULT_BEGINNING_SEARCH_YEAR,
    DEFAULT_ENDING_SEARCH_YEAR,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
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
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("cutoff");

export default class CutoffCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "cutoff_start",
                type: "number" as const,
                minValue: DEFAULT_BEGINNING_SEARCH_YEAR,
                maxValue: DEFAULT_ENDING_SEARCH_YEAR,
            },
            {
                name: "cutoff_end",
                type: "number" as const,
                minValue: DEFAULT_BEGINNING_SEARCH_YEAR,
                maxValue: DEFAULT_ENDING_SEARCH_YEAR,
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "cutoff",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.cutoff.help.description"
        ),
        usage: ",cutoff [year_start] {year_end}",
        examples: [
            {
                example: "`,cutoff 2015`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.cutoff.help.example.singleCutoff",
                    {
                        year: String(2015),
                    }
                ),
            },
            {
                example: "`,cutoff 2015 2018`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.cutoff.help.example.twoCutoffs",
                    {
                        beginningYear: String(2015),
                        endYear: String(2018),
                    }
                ),
            },
            {
                example: "`,cutoff`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.cutoff.help.example.reset",
                    {
                        defaultBeginningSearchYear: String(
                            DEFAULT_BEGINNING_SEARCH_YEAR
                        ),
                        defaultEndSearchYear: String(
                            DEFAULT_ENDING_SEARCH_YEAR
                        ),
                    }
                ),
            },
        ],
        priority: 140,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "cutoff",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.cutoff.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "set",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.cutoff.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND_GROUP,
                    options: [
                        {
                            name: "earliest",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.cutoff.interaction.earliestOption"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "beginning_year",
                                    description:
                                        LocalizationManager.localizer.translate(
                                            LocaleType.EN,
                                            "command.cutoff.interaction.earliestOption"
                                        ),
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: DEFAULT_ENDING_SEARCH_YEAR,
                                    min_value: DEFAULT_BEGINNING_SEARCH_YEAR,
                                } as any,
                            ],
                        },
                        {
                            name: "range",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.cutoff.interaction.rangeOption"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .SUB_COMMAND,
                            options: [
                                {
                                    name: "beginning_year",
                                    description:
                                        LocalizationManager.localizer.translate(
                                            LocaleType.EN,
                                            "command.cutoff.interaction.rangeOption"
                                        ),
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: DEFAULT_ENDING_SEARCH_YEAR,
                                    min_value: DEFAULT_BEGINNING_SEARCH_YEAR,
                                } as any,
                                {
                                    name: "ending_year",
                                    description:
                                        LocalizationManager.localizer.translate(
                                            LocaleType.EN,
                                            "command.cutoff.interaction.rangeOption"
                                        ),
                                    type: Eris.Constants
                                        .ApplicationCommandOptionTypes.INTEGER,
                                    required: true,
                                    max_value: DEFAULT_ENDING_SEARCH_YEAR,
                                    min_value: DEFAULT_BEGINNING_SEARCH_YEAR,
                                } as any,
                            ],
                        },
                    ],
                },
                {
                    name: "reset",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "cutoff" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let beginningYear: number = null;
        let endingYear: number = null;
        const yearRange = parsedMessage.components;

        if (yearRange.length === 0) {
            beginningYear = null;
            endingYear = null;
        } else if (yearRange.length === 1) {
            beginningYear = parseInt(yearRange[0], 10);
        } else {
            beginningYear = parseInt(yearRange[0], 10);
            endingYear = parseInt(yearRange[1], 10);
        }

        await CutoffCommand.updateOption(
            MessageContext.fromMessage(message),
            beginningYear,
            endingYear
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        beginningYear: number,
        endingYear: number,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = beginningYear == null && endingYear == null;

        if (reset) {
            await guildPreference.setBeginningCutoffYear(
                DEFAULT_BEGINNING_SEARCH_YEAR
            );
            await guildPreference.setEndCutoffYear(DEFAULT_ENDING_SEARCH_YEAR);
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.CUTOFF, reset: true }],
                null,
                null,
                null,
                interaction
            );

            logger.info(
                `${getDebugLogHeader(messageContext)} | Cutoff set to ${
                    guildPreference.gameOptions.beginningYear
                } - ${guildPreference.gameOptions.endYear}`
            );

            return;
        }

        if (beginningYear && !endingYear) {
            await guildPreference.setBeginningCutoffYear(beginningYear);
            await guildPreference.setEndCutoffYear(DEFAULT_ENDING_SEARCH_YEAR);
        } else {
            if (endingYear < beginningYear) {
                await sendErrorMessage(
                    messageContext,
                    {
                        title: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.cutoff.failure.invalidEndYear.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.cutoff.failure.invalidEndYear.description"
                        ),
                    },
                    interaction
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
            null,
            null,
            null,
            interaction
        );

        logger.info(
            `${getDebugLogHeader(messageContext)} | Cutoff set to ${
                guildPreference.gameOptions.beginningYear
            } - ${guildPreference.gameOptions.endYear}`
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

        let beginningYear: number;
        let endingYear: number;
        if (interactionName === "range") {
            beginningYear = interactionOptions["beginning_year"];
            endingYear = interactionOptions["ending_year"];
        } else if (interactionName === "earliest") {
            beginningYear = interactionOptions["beginning_year"];
        }

        await CutoffCommand.updateOption(
            messageContext,
            beginningYear,
            endingYear,
            interaction
        );
    }
}
