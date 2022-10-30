import { IPCLogger } from "../../logger";
import { OptionAction } from "../../constants";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import Gender from "../../enums/option_types/gender";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("gender");

export default class GenderCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 3,
        arguments: [
            {
                name: "gender_1",
                type: "enum" as const,
                enums: Object.values(Gender),
            },
            {
                name: "gender_2",
                type: "enum" as const,
                enums: Object.values(Gender).slice(0, 3),
            },
            {
                name: "gender_3",
                type: "enum" as const,
                enums: Object.values(Gender).slice(0, 3),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "gender",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.gender.help.description",
            {
                male: `\`${Gender.MALE}\``,
                female: `\`${Gender.FEMALE}\``,
                coed: `\`${Gender.COED}\``,
                genderAlternating: `\`${process.env.BOT_PREFIX}gender alternating\``,
            }
        ),
        usage: ",gender [gender_1 | alternating] {gender_2} {gender_3}",
        examples: [
            {
                example: "`,gender female`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.female"
                ),
            },
            {
                example: "`,gender male female`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.maleFemale"
                ),
            },
            {
                example: "`,gender coed`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.coed"
                ),
            },
            {
                example: "`,gender`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.reset"
                ),
            },
            {
                example: "`,gender alternating`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.alternating"
                ),
            },
        ],
        priority: 150,
    });

    slashCommands = (): Array<Eris.ApplicationCommandStructure> => [
        {
            name: "gender",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.gender.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.gender.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [...Array(4).keys()].map((x) => ({
                        name: `gender_${x + 1}`,
                        description: LocalizationManager.localizer.translate(
                            LocaleType.EN,
                            "command.gender.interaction.description"
                        ),
                        type: Eris.Constants.ApplicationCommandOptionTypes
                            .STRING,
                        choices: Object.values(Gender).map((gender) => ({
                            name: gender,
                            value: gender,
                        })),
                        required: x === 0,
                    })),
                },
                {
                    name: OptionAction.RESET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "gender" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const selectedGenders = parsedMessage.components as Array<Gender>;
        await GenderCommand.updateOption(
            MessageContext.fromMessage(message),
            selectedGenders,
            null,
            selectedGenders.length === 0
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        selectedGenders: Array<Gender>,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (reset) {
            await guildPreference.reset(GameOption.GENDER);
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.GENDER, reset: true }],
                null,
                null,
                null,
                interaction
            );

            logger.info(`${getDebugLogHeader(messageContext)} | Gender reset.`);
            return;
        }

        // ALTERNATING is mutually exclusive
        if (selectedGenders.includes(Gender.ALTERNATING)) {
            selectedGenders = [Gender.ALTERNATING];
        }

        if (guildPreference.isGroupsMode() && selectedGenders.length >= 1) {
            // Incompatibility between groups and gender doesn't exist in GENDER.ALTERNATING
            if (selectedGenders[0] !== Gender.ALTERNATING) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Game option conflict between gender and groups.`
                );

                sendErrorMessage(
                    messageContext,
                    {
                        title: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "misc.failure.gameOptionConflict.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "misc.failure.gameOptionConflict.description",
                            {
                                optionOne: "`groups`",
                                optionTwo: "`gender`",
                                optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                            }
                        ),
                    },
                    interaction
                );
                return;
            }
        }

        if (selectedGenders[0] === Gender.ALTERNATING) {
            if (
                guildPreference.isGroupsMode() &&
                guildPreference.getGroupIDs().length === 1
            ) {
                sendErrorMessage(
                    messageContext,
                    {
                        title: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.gender.warning.gameOption.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.gender.warning.gameOption.description",
                            {
                                alternatingGenderCommand: `\`${process.env.BOT_PREFIX}gender alternating\``,
                            }
                        ),
                    },
                    interaction
                );
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
            null,
            null,
            null,
            interaction
        );

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Genders set to ${guildPreference.gameOptions.gender.join(
                ", "
            )}`
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

        let selectedGenders: Array<Gender>;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            selectedGenders = null;
        } else if (action === OptionAction.SET) {
            selectedGenders = Object.values(interactionOptions);
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            selectedGenders = null;
        }

        await GenderCommand.updateOption(
            messageContext,
            selectedGenders,
            interaction,
            selectedGenders == null
        );
    }
}
