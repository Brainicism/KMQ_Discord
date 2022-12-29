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
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
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
        description: i18n.translate(
            guildID,
            "command.gender.help.description",
            {
                male: `\`${Gender.MALE}\``,
                female: `\`${Gender.FEMALE}\``,
                coed: `\`${Gender.COED}\``,
                genderAlternating: "`/gender alternating`",
            }
        ),
        usage: "/gender set\ngender_1:[gender]\ngender_2:{gender}\ngender_3:{gender}\n\n/gender reset",
        examples: [
            {
                example: "`/gender set female`",
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.female"
                ),
            },
            {
                example: "`/gender set gender_1:male gender_2:female`",
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.maleFemale"
                ),
            },
            {
                example: "`/gender set gender_1:coed`",
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.coed"
                ),
            },
            {
                example: "`/gender set gender_1:alternating`",
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.alternating"
                ),
            },
            {
                example: "`/gender reset`",
                explanation: i18n.translate(
                    guildID,
                    "command.gender.help.example.reset"
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
                        "command.gender.help.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [...Array(4).keys()].map((x) => ({
                        name: `gender_${x + 1}`,
                        description: i18n.translate(
                            LocaleType.EN,
                            "command.gender.help.interaction.gender"
                        ),
                        type: Eris.Constants.ApplicationCommandOptionTypes
                            .STRING,
                        choices: Object.values(Gender)
                            .filter(
                                (gender) =>
                                    x === 0 || gender !== Gender.ALTERNATING
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
                        title: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.gameOptionConflict.title"
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.gameOptionConflict.description",
                            {
                                optionOne: "`groups`",
                                optionTwo: "`gender`",
                                optionOneCommand: "`/groups reset`",
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
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.gender.warning.gameOption.title"
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.gender.warning.gameOption.description",
                            {
                                alternatingGenderCommand:
                                    "`/gender alternating`",
                            }
                        ),
                    },
                    interaction
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
