import { IPCLogger } from "../../logger";
import { OptionAction } from "../../constants";
import { availableGenders } from "../../enums/option_types/gender";
import { clickableSlashCommand } from "../../helpers/utils";
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
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { GenderModeOptions } from "../../enums/option_types/gender";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "gender";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class GenderCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notPlaylistPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 3,
        arguments: [
            {
                name: "gender_1",
                type: "enum" as const,
                enums: Object.values(availableGenders),
            },
            {
                name: "gender_2",
                type: "enum" as const,
                enums: Object.values(availableGenders).slice(0, 3),
            },
            {
                name: "gender_3",
                type: "enum" as const,
                enums: Object.values(availableGenders).slice(0, 3),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.gender.help.description",
            {
                male: "`male`",
                female: "`female`",
                coed: "`coed`",
                genderAlternating: clickableSlashCommand(
                    COMMAND_NAME,
                    "alternating",
                ),
            },
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} female`,
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.female",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} gender_1:male gender_2:female`,
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.maleFemale",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} gender_1:coed`,
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.coed",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} gender_1:alternating`,
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.alternating",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.reset",
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
                        "command.gender.help.interaction.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.gender.help.interaction.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [...Array(3).keys()].map((x) => ({
                        name: `gender_${x + 1}`,
                        description: i18n.translate(
                            LocaleType.EN,
                            "command.gender.help.interaction.gender",
                        ),
                        description_localizations: Object.values(LocaleType)
                            .filter((y) => y !== LocaleType.EN)
                            .reduce(
                                (acc, locale) => ({
                                    ...acc,
                                    [locale]: i18n.translate(
                                        locale,
                                        "command.gender.help.interaction.gender",
                                    ),
                                }),
                                {},
                            ),

                        type: Eris.Constants.ApplicationCommandOptionTypes
                            .STRING,
                        choices: Object.values(availableGenders)
                            .filter(
                                (gender) => x === 0 || gender !== "alternating",
                            )
                            .map((gender) => ({
                                name: gender,
                                value: gender,
                            })),
                        required: x === 0,
                    })),
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "gender" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "gender" },
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
        const selectedGenders =
            parsedMessage.components as Array<GenderModeOptions>;

        await GenderCommand.updateOption(
            MessageContext.fromMessage(message),
            selectedGenders,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        selectedGenders: Array<GenderModeOptions>,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = selectedGenders.length === 0;

        if (reset) {
            await guildPreference.reset(GameOption.GENDER);
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.GENDER, reset: true }],
                false,
                undefined,
                undefined,
                interaction,
            );

            logger.info(`${getDebugLogHeader(messageContext)} | Gender reset.`);
            return;
        }

        // ALTERNATING is mutually exclusive
        if (selectedGenders.includes("alternating")) {
            selectedGenders = ["alternating"];
        }

        if (guildPreference.isGroupsMode() && selectedGenders.length >= 1) {
            // Incompatibility between groups and gender doesn't exist in GENDER.ALTERNATING
            if (selectedGenders[0] !== "alternating") {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Game option conflict between gender and groups.`,
                );

                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.gameOptionConflict.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.gameOptionConflict.description",
                            {
                                optionOne: clickableSlashCommand("groups"),
                                optionTwo: clickableSlashCommand(COMMAND_NAME),
                                optionOneCommand: clickableSlashCommand(
                                    "groups",
                                    OptionAction.RESET,
                                ),
                            },
                        ),
                    },
                    interaction,
                );
                return;
            }
        }

        if (selectedGenders[0] === "alternating") {
            if (
                guildPreference.isGroupsMode() &&
                guildPreference.getGroupIDs().length === 1
            ) {
                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.gender.warning.gameOption.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.gender.warning.gameOption.description",
                            {
                                alternatingGenderCommand: `${clickableSlashCommand(
                                    COMMAND_NAME,
                                    OptionAction.SET,
                                )} gender_1:alternating`,
                            },
                        ),
                    },
                    interaction,
                );
                return;
            }

            await guildPreference.setGender([selectedGenders[0]]);
        } else {
            await guildPreference.setGender(selectedGenders);
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.GENDER, reset: false }],
            false,
            undefined,
            undefined,
            interaction,
        );

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Genders set to ${guildPreference.gameOptions.gender.join(
                ", ",
            )}`,
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

        let selectedGenders: Array<GenderModeOptions>;

        const action = interactionName as OptionAction;
        switch (action) {
            case OptionAction.RESET:
                selectedGenders = [];
                break;
            case OptionAction.SET:
                selectedGenders = Object.values(interactionOptions);
                break;
            default:
                logger.error(`Unexpected interaction name: ${interactionName}`);
                selectedGenders = [];
                break;
        }

        await GenderCommand.updateOption(
            messageContext,
            selectedGenders,
            interaction,
        );
    }
}
